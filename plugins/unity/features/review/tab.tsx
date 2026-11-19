/**
 * The Review tab: sub-tabs Anschauen · Entscheiden · Bilder · Klänge · Ideen · Laufend over the project's review files
 * (paths from `.claude/unity.json` → `review`), the picture viewer (frames, directions, views, painting) and the
 * "Problem melden" card. Answers are appended to the project's log, never rewritten.
 */
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { ReviewMark, ReviewUiState, ReviewViewState } from '../../types'
import {
  ActionButton,
  askAction,
  askClaude,
  Card,
  CardTitle,
  clearFieldDraft,
  CopyButton,
  EmptyState,
  Field,
  fieldText,
  ListRow,
  reloadAction,
  Segment,
  Sentence,
  Tabs,
  Toggle,
  type Action,
  type Kit,
} from '../../lib/ui'
import type { IconName } from '../../lib/icons'
import { join } from '../../lib/path'
import * as play from '../../lib/play'
import { canFront } from '../../lib/front'
import { knownPlatform } from '../../lib/host'
import { gotoSpot, mixGet, mixSet, soundList, soundPlay, soundStop, unityToFront, type Options } from '../state'
import { pngSize, spotText, verdictOf, type Answer, type Question, type Verdict } from './data'
import {
  appendAnswer,
  captureTo,
  loadReview,
  nowStamp,
  openCount,
  patchReview,
  readBase64,
  readReview,
  resolvePath,
  reviewRoot,
  reportsDir,
  type ReviewData,
} from './store'
import { describeMarks, markedSvg, marksLine, SVG_IMAGE_LIMIT } from './viewer'
import { openReport, reportCard, storedReportPrompt } from './report'

type El = (props: Record<string, unknown>) => RenderElement

export type SubTab = 'look' | 'decide' | 'pictures' | 'sounds' | 'ideas' | 'running'
const SUBS: { id: SubTab; label: string; icon: IconName }[] = [
  { id: 'look', label: 'Anschauen', icon: 'eye' },
  { id: 'decide', label: 'Entscheiden', icon: 'list' },
  { id: 'pictures', label: 'Bilder', icon: 'camera' },
  { id: 'sounds', label: 'Klänge', icon: 'speaker' },
  { id: 'ideas', label: 'Ideen', icon: 'bookmark' },
  { id: 'running', label: 'Laufend', icon: 'activity' },
]
const KIND_OF: Partial<Record<SubTab, Question['kind']>> = {
  look: 'anschauen',
  decide: 'entscheiden',
  pictures: 'bild',
}

const say = (msg: string) => ({ notice: msg })

function ago(time: string | undefined, now: number): string {
  const t = time ? Date.parse(time) : NaN
  if (!Number.isFinite(t)) return ''
  const min = Math.max(0, Math.round((now - t) / 60000))
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `vor ${h} h` : `vor ${Math.round(h / 24)} Tagen`
}

// One pair of words for a verdict in the whole mod (R6): buttons, pills and the notice read the same.
const FITS = 'Passt'
const FITS_NOT = 'Passt nicht'
const verdictText = (v: Verdict) => (v === 'passt' ? FITS : v === 'passt-nicht' ? FITS_NOT : 'Kommentar')
/** Where a marked option of a question waits until „Antwort schicken“ (the review atom has only `drafts` for it). */
const choiceKey = (id: string) => `wahl:${id}`
const commentKey = (id: string) => `rv-comment-${id}`
const VIEW_NOTE = 'rv-view-note'
const soundNoteKey = (id: string) => `rv-note-ton-${id}`
/** `openGroup` when every sound group is folded (unset opens the first group with new sounds). */
const NO_GROUP = '\u2205 none'
const verdictTone = (v: Verdict) => (v === 'passt' ? 'ok' : v === 'passt-nicht' ? 'bad' : 'info')
const isMusic = (x: { group: string; id: string }) => x.group === 'Music' || x.id.startsWith('music:')

// --- actions (function declarations: they carry `$`) ---

/** Appends an answer for a question (or idea/sound id); a screenshot + spot come along when wanted and possible. */
export async function answerItem(
  $: EngineInterface,
  options: Options,
  id: string,
  verdict: Verdict,
  choice: string | null,
  comment: string,
  withShot: boolean,
): Promise<Answer | undefined> {
  const { root, cfg } = await reviewRoot($)
  let screenshot: string | null = null
  let spot: unknown = null
  if (withShot && cfg?.shots) {
    const rel = `${cfg.shots.replace(/\/$/, '')}/${id.replace(/[^A-Za-z0-9_-]+/g, '-')}-${(await nowStamp($)).file}.png`
    const shot = await captureTo($, options, resolvePath(root, rel))
    if (!play.isPlayError(shot)) {
      screenshot = rel
      spot = shot.spot ?? null
    }
  }
  try {
    const a = await appendAnswer($, { id, verdict, choice, comment, spot, screenshot })
    await patchReview($, s => ({
      drafts: Object.fromEntries(Object.entries(s.drafts).filter(([key]) => key !== id && key !== choiceKey(id))),
      open: s.open === id ? undefined : s.open,
      ...say(`Antwort gespeichert: ${verdictText(verdict)}${screenshot ? ' · mit Screenshot' : ''}.`),
    }))
    clearFieldDraft(commentKey(id))
    return a
  } catch (err) {
    await patchReview($, say(err instanceof Error ? err.message : String(err)))
    return undefined
  }
}

export async function jump($: EngineInterface, options: Options, spot: unknown): Promise<void> {
  const text = spotText(spot)
  if (!text) return
  const res = await gotoSpot($, options, text)
  await patchReview($, say(play.isPlayError(res) ? `Hinspringen ging nicht: ${res.error}` : 'Hingesprungen.'))
}

/** Opens the viewer on one picture of the review list. */
async function viewItem($: EngineInterface, q: Question): Promise<void> {
  const { root } = await reviewRoot($)
  if (!q.image) return
  await patchReview($, {
    view: newView('item', q.id, q.title, q.text, [{ label: 'Bild', frames: [resolvePath(root, q.image)] }]),
  })
}

export function newView(
  source: ReviewViewState['source'],
  id: string,
  title: string,
  question: string | undefined,
  groups: ReviewViewState['groups'],
): ReviewViewState {
  return {
    source,
    id,
    title,
    question,
    groups,
    group: 0,
    frame: 0,
    playing: false,
    marks: [],
    tool: 'pen',
    color: 'red',
    note: '',
  }
}

async function patchView($: EngineInterface, fn: (v: ReviewViewState) => Partial<ReviewViewState>): Promise<void> {
  await patchReview($, s => (s.view ? { view: { ...s.view, ...fn(s.view) } } : {}))
}

/** Saves the marked picture as SVG beside the reports; returns the frame and the SVG path. */
export async function saveMarks($: EngineInterface, v: ReviewViewState): Promise<{ frame?: string; svg?: string }> {
  const frame = v.groups[v.group]?.frames[v.frame]
  if (!frame || v.marks.length === 0) return { frame }
  const b64 = await readBase64($, frame)
  const size = (b64 && pngSize(b64)) || { width: 1000, height: 1000 }
  const { root, cfg } = await reviewRoot($)
  const svgPath = join(reportsDir(root, cfg), `marks-${(await nowStamp($)).file}.svg`)
  await $.fs.write(svgPath, markedSvg(`file://${frame}`, size, v.marks))
  return { frame, svg: svgPath }
}

/** The viewer's answer: to the log for a list picture, to Claude for its own question. */
export async function sendView($: EngineInterface, options: Options, fits: boolean): Promise<void> {
  const v = (await readReview($)).view
  if (!v) return
  const g = v.groups[v.group]
  const where = `${g?.label ?? ''}${(g?.frames.length ?? 0) > 1 ? ` · Bild ${v.frame + 1}/${g?.frames.length}` : ''}`
  const marks = describeMarks(v.marks)
  if (v.source === 'item') {
    const comment = [v.note, ...marks].filter(Boolean).join('\n')
    await answerItem($, options, v.id, fits ? 'passt' : 'passt-nicht', null, comment, false)
    await patchReview($, { view: undefined })
    return
  }
  // Kit „ask Claude“: one lock per view, taken before the marks are saved, so a second press only toasts.
  await askClaude($, {
    key: `rv-view:${v.id}`,
    text: async () => {
      const cur = (await readReview($)).view
      if (!cur || cur.id !== v.id) return undefined
      const saved = await saveMarks($, v)
      const text = [
        `Antwort im Unity-Review zu „${v.title}“: ${fits ? 'passt so' : 'passt nicht, siehe Markierung'}.`,
        `Ansicht: ${where}`,
        v.note ? `Notiz: ${v.note}` : '',
        ...marks,
        saved.frame ? `Bild: ${saved.frame}` : '',
        saved.svg ? `Markierungen (SVG über dem Bild): ${saved.svg}` : '',
        marksLine(marks.length, true),
      ].filter(Boolean)
      await patchReview($, {
        view: undefined,
        feedback: { text: text.join('\n'), image: saved.frame, svg: saved.svg, at: Date.now() },
        ...say('An Claude geschickt.'),
      })
      return text.join('\n')
    },
  })
}

/** Pending automatic re-fetch after a failed load (one chain at a time). */
let soundRetry = false
const SOUND_RETRY_MS = 5000
const SOUND_RETRIES = 24

/**
 * Fetches list + mix from the sound board. When the bridge is down or busy (a test run blocks the editor), it tries
 * again on its own every 5 s for two minutes, as long as the error card still stands.
 */
export async function loadSounds($: EngineInterface, options: Options, tries = SOUND_RETRIES): Promise<void> {
  const list = await soundList($, options)
  const mix = play.isPlayError(list) ? list : await mixGet($, options)
  const failed = play.isPlayError(list) ? list : play.isPlayError(mix) ? mix : undefined
  const err = failed?.error
  if (failed && (failed.code === 'bridge-down' || failed.code === 'bridge-busy') && tries > 0 && !soundRetry) {
    soundRetry = true
    $.clock.after(SOUND_RETRY_MS, () => {
      soundRetry = false
      void readReview($).then(s => (s.sounds?.error ? loadSounds($, options, tries - 1) : undefined))
    })
  }
  await patchReview($, s => ({
    sounds: {
      list: play.isPlayError(list)
        ? []
        : list.sounds.map(keptSound),
      mix: play.isPlayError(mix) ? [] : mix.groups,
      mode: s.sounds?.mode ?? 'near',
      musicOpen: s.sounds?.musicOpen ?? false,
      // only the fields the tab draws are kept (the atom is rewritten on every press); the open group stays
      ...(s.sounds?.openGroup !== undefined ? { openGroup: s.sounds.openGroup } : {}),
      ...(err ? { error: err } : {}),
    },
  }))
}

/** „Unity vorholen“ (macOS) beside the last play's hint, when Unity in the background keeps the sound silent. */
function frontAction($: EngineInterface, snd: { hint?: string; front?: boolean }, options: Options): Action[] {
  if (!snd.hint || !snd.front || !canFront(knownPlatform())) return []
  return [
    {
      key: 'rv-front',
      label: 'Unity vorholen',
      icon: 'up',
      variant: 'secondary',
      onPress: () =>
        void unityToFront($, options).then(err => {
          if (err) $.ui.toast(err)
        }),
    },
  ]
}

export async function playSound($: EngineInterface, options: Options, id: string): Promise<void> {
  const s = await readReview($)
  const res = await soundPlay($, options, id, s.sounds?.mode ?? 'near')
  // Why it may stay silent stands at the sounds (a toast alone was gone before the button could be pressed).
  const hints = play.isPlayError(res) ? [] : play.soundHints(res)
  const hint = hints.map(h => h.text).join(' · ') || undefined
  const front = hints.some(h => h.front) || undefined
  await patchReview($, x => ({
    sounds: x.sounds
      ? { ...x.sounds, playing: play.isPlayError(res) ? undefined : id, hint, front }
      : x.sounds,
    ...(play.isPlayError(res) ? say(`Abspielen ging nicht: ${res.error}`) : {}),
  }))
}

async function stopSounds($: EngineInterface, options: Options): Promise<void> {
  await soundStop($, options)
  await patchReview($, x => ({ sounds: x.sounds ? { ...x.sounds, playing: undefined } : x.sounds }))
}

export async function nudgeMix($: EngineInterface, options: Options, group: string, delta: number): Promise<void> {
  const cur = (await readReview($)).sounds?.mix.find(m => m.group === group)?.db ?? 0
  const db = Math.max(-80, Math.min(20, Math.round(cur + delta)))
  const res = await mixSet($, options, group, db)
  await patchReview($, x =>
    play.isPlayError(res)
      ? say(`Mix nicht gesetzt: ${res.error}`)
      : { sounds: x.sounds ? { ...x.sounds, mix: res.groups } : x.sounds },
  )
}

async function setSoundMode($: EngineInterface, mode: 'near' | 'flat'): Promise<void> {
  await patchReview($, x => ({ sounds: x.sounds && { ...x.sounds, mode } }))
}

// --- rendering ---

function table($: EngineInterface, e: RenderInput<'Pane'>): Record<string, El | undefined> {
  return $.ui.resolve(e) as unknown as Record<string, El | undefined>
}

const kindIcon = (kind: Question['kind']): IconName => (kind === 'entscheiden' ? 'list' : kind === 'bild' ? 'camera' : 'eye')

/** The two verdicts of a question that asks nothing else: answered with one press. */
const isVerdictPair = (choices: string[]) =>
  choices.length === 2 && verdictOf(choices[0]!, '') === 'passt' && verdictOf(choices[1]!, '') === 'passt-nicht'

/**
 * The card of the one unfolded question, in the order of every card: text, the options (a decision), the comment
 * field, then ONE action row. A plain „Passt“ / „Passt nicht“ question answers with one press; a question with
 * options marks the option in its row and „Antwort schicken“ sends it with the comment.
 */
function questionCard(
  $: EngineInterface,
  k: Kit,
  options: Options,
  s: ReviewUiState,
  q: Question,
  place: string,
): RenderElement {
  const stored = s.drafts[q.id] ?? ''
  // the text of the moment: a press right after typing must not send the comment of a moment ago
  const comment = () => fieldText(commentKey(q.id), stored)
  const links: Action[] = []
  if (q.spot)
    links.push({
      key: `rv-goto-${q.id}`,
      label: 'Hinspringen',
      icon: 'pin',
      variant: 'link',
      onPress: () => void jump($, options, q.spot),
    })
  if (q.image)
    links.push({
      key: `rv-img-${q.id}`,
      label: 'Bild ansehen',
      icon: 'eye',
      variant: 'link',
      onPress: () => void viewItem($, q),
    })
  const decision = q.kind === 'entscheiden'
  const choices = q.options.length ? q.options : decision ? [] : [FITS, FITS_NOT]
  const pair = !decision && isVerdictPair(choices)
  const chosen = pair ? -1 : choices.indexOf(s.drafts[choiceKey(q.id)] ?? '\u0000')
  const shot = s.attachShot ? 'Screenshot geht mit' : ''
  const send = () => {
    const c = chosen >= 0 ? choices[chosen]! : null
    const text = comment()
    if (c === null && !text.trim()) {
      void patchReview($, say('Erst eine Option wählen oder einen Kommentar schreiben.'))
      return
    }
    void answerItem(
      $,
      options,
      q.id,
      decision || c === null ? 'kommentar' : verdictOf(c, text),
      decision ? c : null,
      text,
      s.attachShot,
    )
  }
  const verdict = (i: number): Action => ({
    key: `rv-choice-${q.id}-${i}`,
    label: i === 0 ? FITS : FITS_NOT,
    variant: i === 0 ? 'primary' : 'secondary',
    onPress: () => void answerItem($, options, q.id, verdictOf(choices[i]!, comment()), null, comment(), s.attachShot),
  })
  return Card(k, {
    key: `rv-q-${q.id}`,
    // no "Entscheiden" pill: the sub tab says it already; the place among the open ones stands on the right
    title: { icon: kindIcon(q.kind), title: q.title, count: place },
    children: [
      q.text ? Sentence(k, q.text) : null,
      ...(pair
        ? []
        : decisionRows(k, q.id, choices, chosen, i => () =>
            void patchReview($, x => ({ drafts: { ...x.drafts, [choiceKey(q.id)]: choices[i]! } })),
          )),
      Field(k, {
        key: commentKey(q.id),
        label: 'Kommentar',
        placeholder: 'z. B. lieber wärmer',
        value: stored,
        // with options the field only keeps the comment (the main action sends); without, it is the comment's answer
        submitLabel: pair ? 'Antworten' : 'Merken',
        onInput: v => void patchReview($, x => ({ drafts: { ...x.drafts, [q.id]: v } })),
        onSubmit: v =>
          pair
            ? void answerItem($, options, q.id, 'kommentar', null, v, s.attachShot)
            : void patchReview($, x => ({ drafts: { ...x.drafts, [q.id]: v } })),
      }),
    ],
    status: pair
      ? shot || undefined
      : chosen >= 0
        ? `${String.fromCharCode(65 + chosen)} gewählt${shot ? ` · ${shot}` : ''}`
        : shot || undefined,
    actions: pair
      ? { primary: verdict(0), secondary: [verdict(1)], links }
      : {
          primary: { key: `rv-answer-${q.id}`, label: 'Antwort schicken', variant: 'primary', onPress: send },
          links,
        },
  })
}

/** Characters of an option that still stand in the row's title; a longer one wraps under its row. */
const OPTION_ONE_LINE = 32

/**
 * The options of a decision as list rows: letter and option, the marked one with a pill, the others with „Wählen“ on
 * the right. A long option stands under its row as wrapping text, so it is read in full before it is chosen (a row
 * title is cut, a Button label does not wrap).
 */
export function decisionRows(
  k: Kit,
  id: string,
  choices: string[],
  chosen: number,
  choose: (i: number) => () => void,
): RenderElement[] {
  const room = Math.min(OPTION_ONE_LINE, Math.max(8, k.cols - 20))
  return choices.map((c, i) => {
    const letter = String.fromCharCode(65 + i)
    const long = [...c].length > room
    return ListRow(k, {
      key: `rv-choice-row-${id}-${i}`,
      title: long ? `Option ${letter}` : `${letter} · ${c}`,
      pill: i === chosen ? { text: 'gewählt', tone: 'ok' } : undefined,
      actions:
        i === chosen
          ? []
          : [{ key: `rv-choice-${id}-${i}`, label: 'Wählen', variant: 'link', onPress: choose(i) }],
      // the marked row keeps the place of its button: marking moves nothing
      actionSlot: 7,
      under: long ? [Sentence(k, c, { wrap: 'wrap' })] : undefined,
    })
  })
}

function storedReportRow(
  $: EngineInterface,
  k: Kit,
  options: Options,
  r: ReviewData['reports'][number],
): RenderElement {
  const acts: Action[] = [
    askAction($, k, { key: `rv-rep-send-${r.id}`, label: 'Schicken', text: () => storedReportPrompt($, r) }),
  ]
  if (r.spot)
    acts.push({
      key: `rv-rep-goto-${r.id}`,
      label: 'Hinspringen',
      variant: 'link',
      onPress: () => void jump($, options, r.spot),
    })
  return ListRow(k, {
    key: `rv-rep-${r.id}`,
    title: `${r.kind || 'Gemeldet'}${r.note ? `: ${r.note}` : ''}`,
    icon: 'flag',
    pill: { text: 'gemerkt', tone: 'neutral', glyph: false },
    actions: acts,
  })
}

/**
 * A question sub tab: the unfolded question as a card, then the cards „Offen“ (every open question as a row),
 * „Gemerkt“ (reports kept for later, only under Anschauen) and „Erledigt“ (the last five answers).
 */
function questionsBody(
  $: EngineInterface,
  k: Kit,
  options: Options,
  s: ReviewUiState,
  d: ReviewData,
  kind: Question['kind'],
  now: number,
): RenderElement[] {
  const all = d.questions.filter(q => q.kind === kind)
  const open = all.filter(q => !d.answers.has(q.id))
  const done = all.filter(q => d.answers.has(q.id))
  const kept = kind === 'anschauen' ? d.reports.filter(x => !x.sent) : []
  if (!open.length && !kept.length && !done.length)
    return [EmptyState(k, { icon: 'check', title: 'Nichts offen', text: 'Hier liegt gerade nichts.' })]
  const out: RenderElement[] = []
  const expanded = open.find(q => q.id === s.open) ?? open[0]
  if (expanded)
    out.push(
      questionCard(
        $,
        k,
        options,
        s,
        expanded,
        open.length > 1 ? `${open.indexOf(expanded) + 1} von ${open.length}` : '',
      ),
    )
  // one open question is the card above already; the list is drawn from two on (or to say that nothing is open)
  if (open.length !== 1)
    out.push(
      Card(k, {
        key: 'rv-open',
        title: { icon: kindIcon(kind), title: 'Offen', count: open.length },
        empty: 'Nichts offen.',
        children: open.map(q =>
          ListRow(k, {
            key: `rv-row-${q.id}`,
            title: q.title,
            icon: kindIcon(q.kind),
            pill: q === expanded ? { text: 'geöffnet', tone: 'info', glyph: false } : undefined,
            actions:
              q === expanded
                ? []
                : [
                    {
                      key: `rv-open-${q.id}`,
                      label: 'Details',
                      variant: 'link',
                      onPress: () => void patchReview($, { open: q.id }),
                    },
                  ],
            actionSlot: 8,
          }),
        ),
      }),
    )
  if (kept.length)
    out.push(
      Card(k, {
        key: 'rv-kept',
        title: { icon: 'flag', title: 'Gemerkt', count: kept.length },
        children: kept.map(r => storedReportRow($, k, options, r)),
      }),
    )
  if (done.length)
    out.push(
      Card(k, {
        key: 'rv-done',
        title: { icon: 'check', title: 'Erledigt', count: done.length },
        children: done
          .slice(-5)
          .reverse()
          .map(q => {
            const a = d.answers.get(q.id)!
            return ListRow(k, {
              key: `rv-done-${q.id}`,
              title: q.title,
              status: 'ok',
              // the verdict stands once, in the pill (R8); the meta keeps only a chosen option or comment
              meta: [a.choice && a.choice.toLowerCase() !== verdictText(a.verdict).toLowerCase() ? a.choice : '', ago(a.time, now)]
                .filter(Boolean)
                .join(' · '),
              pill: { text: verdictText(a.verdict), tone: verdictTone(a.verdict) },
            })
          }),
      }),
    )
  return out
}

function soundsBody($: EngineInterface, k: Kit, options: Options, s: ReviewUiState, d: ReviewData): RenderElement[] {
  const snd = s.sounds
  if (!snd)
    return [
      EmptyState(k, {
        icon: 'speaker',
        title: 'Klänge aus dem Spiel',
        text: 'Liste und Mix kommen aus dem Unity-Editor vom Soundboard des Projekts.',
        action: { ...reloadAction(k, { key: 'rv-snd-load', onPress: () => void loadSounds($, options) }), variant: 'primary' },
      }),
    ]
  const out: RenderElement[] = []
  if (snd.error)
    out.push(
      Card(k, {
        key: 'rv-snd-err',
        tone: 'warn',
        title: { icon: 'alert', title: 'Soundboard nicht erreichbar', tone: 'warn' },
        status: { text: snd.error, tone: 'warn' },
        actions: [reloadAction(k, { key: 'rv-snd-retry', onPress: () => void loadSounds($, options) })],
      }),
    )
  if (snd.mix.length)
    out.push(
      Card(k, {
        key: 'rv-mix',
        title: { icon: 'sliders', title: 'Mix', count: snd.mix.length },
        children: snd.mix.map(m =>
          ListRow(k, {
            key: `rv-mix-${m.group}`,
            title: m.group,
            meta: `${m.db > 0 ? '+' : m.db < 0 ? '−' : ''}${Math.abs(Math.round(m.db))} dB`,
            actions: [
              {
                key: `rv-mix-${m.group}-down`,
                label: '−3 dB',
                variant: 'link',
                onPress: () => void nudgeMix($, options, m.group, -3),
              },
              {
                key: `rv-mix-${m.group}-up`,
                label: '+3 dB',
                variant: 'link',
                onPress: () => void nudgeMix($, options, m.group, 3),
              },
            ],
          }),
        ),
        hint: 'Wirkt sofort im Spiel, das Spiel speichert den Mix selbst.',
      }),
    )
  const fresh = snd.list.filter(x => !isMusic(x) && !d.answers.has(`ton:${x.id}`))
  const music = snd.list.filter(isMusic)
  const groups = soundGroups(snd.list, id => d.answers.has(id))
  const openGroup =
    snd.openGroup === NO_GROUP
      ? undefined
      : (groups.find(g => g.name === snd.openGroup) ?? groups.find(g => g.fresh > 0) ?? groups[0])
  const secs = (n: number) => `${n.toFixed(1).replace('.', ',')} s`
  const rate = (id: string, fits: boolean, note?: string) => {
    const text = note ?? fieldText(soundNoteKey(id), s.drafts[`ton:${id}`] ?? '')
    clearFieldDraft(soundNoteKey(id))
    void answerItem($, options, `ton:${id}`, fits ? 'passt' : 'passt-nicht', id, text, false)
  }
  const shownCount = Math.max(SOUND_PAGE, snd.more ?? SOUND_PAGE)
  /** One sound: play and „Passt“ in the row; „Nochmal“ with its note waits behind „Details“ (the row keeps its height). */
  const soundRow = (x: SoundRow): RenderElement => {
    const a = d.answers.get(`ton:${x.id}`)
    if (a)
      return ListRow(k, {
        key: `rv-snd-done-${x.id}`,
        title: x.name,
        meta: secs(x.duration),
        pill: { text: a.verdict === 'passt-nicht' ? 'Nochmal' : verdictText(a.verdict), tone: verdictTone(a.verdict) },
      })
    return ListRow(k, {
      key: `rv-snd-${x.id}`,
      title: x.name,
      status: snd.playing === x.id ? 'running' : undefined,
      meta: `${secs(x.duration)}${x.takes > 1 ? ` · ${x.takes} Varianten` : ''}`,
      actions: [
        {
          key: `rv-play-${x.id}`,
          label: 'Abspielen',
          icon: 'play',
          variant: 'secondary',
          onPress: () => void playSound($, options, x.id),
        },
        { key: `rv-ok-${x.id}`, label: FITS, variant: 'secondary', onPress: () => rate(x.id, true) },
      ],
      details: () => [
        Field(k, {
          key: soundNoteKey(x.id),
          label: 'Notiz',
          placeholder: 'z. B. zu dumpf',
          value: s.drafts[`ton:${x.id}`] ?? '',
          submitLabel: 'Nochmal machen',
          onInput: v => void patchReview($, y => ({ drafts: { ...y.drafts, [`ton:${x.id}`]: v } })),
          onSubmit: v => rate(x.id, false, v),
        }) ??
          // a surface without input fields: the redo goes without a note
          ActionButton(k, {
            key: `rv-no-${x.id}`,
            label: 'Nochmal',
            variant: 'secondary',
            onPress: () => rate(x.id, false),
          }),
      ],
    })
  }
  // One group unfolded at a time, 20 rows per page: hundreds of rows with their buttons made a tree the app could not
  // draw any more (and with it no other mod's pane or band).
  const rows = groups.map((g, gi) =>
    ListRow(k, {
      key: `rv-sgrp-${gi}`,
      title: g.name || 'ohne Gruppe',
      icon: g === openGroup ? 'folder' : 'circle',
      meta: `${g.fresh} neu · ${g.items.length} gesamt`,
      open: g === openGroup,
      onToggle: open =>
        void patchReview($, x => ({
          sounds: x.sounds && { ...x.sounds, openGroup: open ? g.name : NO_GROUP, more: undefined },
        })),
      details: () => g.items.slice(0, shownCount).map(soundRow),
    }),
  )
  const left = openGroup ? openGroup.items.length - shownCount : 0
  out.push(
    Card(k, {
      key: 'rv-snd-new',
      title: { icon: 'speaker', title: 'Neue Klänge', count: fresh.length },
      // how a sound is played is a setting, not an action
      filter: Segment(k, {
        key: 'rv-mode',
        options: [
          { id: 'near', label: 'Räumlich (3D)' },
          { id: 'flat', label: 'Ohne Raum (2D)' },
        ],
        active: snd.mode,
        onSelect: mode => void setSoundMode($, mode),
      }),
      children: rows,
      empty: 'Das Soundboard hat keine Klänge.',
      // why the last play may stay silent stands here (a toast alone was gone before the button could be pressed)
      status: snd.hint ? { text: snd.hint, tone: 'warn' } : undefined,
      actions: [
        {
          key: 'rv-snd-stop',
          label: 'Stoppen',
          icon: 'stop',
          variant: 'secondary',
          onPress: () => void stopSounds($, options),
        },
        ...frontAction($, snd, options),
        ...(left > 0
          ? [
              {
                key: 'rv-snd-more',
                label: `Weitere ${Math.min(SOUND_PAGE, left)}`,
                variant: 'link' as const,
                onPress: () =>
                  void patchReview($, x => ({
                    sounds: x.sounds && { ...x.sounds, more: shownCount + SOUND_PAGE },
                  })),
              },
            ]
          : []),
      ],
    }),
  )
  if (music.length) {
    const musicShown = Math.max(SOUND_PAGE, snd.musicMore ?? SOUND_PAGE)
    const musicLeft = music.length - musicShown
    out.push(
      Card(k, {
        key: 'rv-music',
        title: { icon: 'music', title: 'Musik', count: music.length },
        children: snd.musicOpen
          ? music.slice(0, musicShown).map(x =>
              ListRow(k, {
                key: `rv-mus-${x.id}`,
                title: x.name,
                status: snd.playing === x.id ? 'running' : undefined,
                actions: [
                  {
                    key: `rv-mplay-${x.id}`,
                    label: 'Anspielen',
                    icon: 'play',
                    variant: 'secondary',
                    onPress: () => void playSound($, options, x.id),
                  },
                ],
              }),
            )
          : [],
        status: false,
        actions: [
          {
            key: 'rv-music-toggle',
            label: snd.musicOpen ? k.s.close : k.s.details,
            variant: 'link',
            onPress: () =>
              void patchReview($, x => ({
                sounds: x.sounds && { ...x.sounds, musicOpen: !x.sounds.musicOpen, musicMore: undefined },
              })),
          },
          ...(snd.musicOpen && musicLeft > 0
            ? [
                {
                  key: 'rv-music-more',
                  label: `Weitere ${Math.min(SOUND_PAGE, musicLeft)}`,
                  variant: 'link' as const,
                  onPress: () =>
                    void patchReview($, x => ({
                      sounds: x.sounds && { ...x.sounds, musicMore: musicShown + SOUND_PAGE },
                    })),
                },
              ]
            : []),
        ],
      }),
    )
  }
  return out
}

/** What the review atom keeps of a board sound: only the fields the tab draws. */
export function keptSound(x: play.SoundInfo): SoundRow {
  return { id: x.id, name: x.name, group: x.group ?? '', duration: x.duration, takes: x.takes }
}

/** Rows per page in the sound list (open group, music). */
export const SOUND_PAGE = 20

type SoundRow = NonNullable<ReviewUiState['sounds']>['list'][number]

/** The non-music sounds by group in board order; per group the new ones first, then the rated ones. */
export function soundGroups(
  list: SoundRow[],
  answered: (id: string) => boolean,
): { name: string; items: SoundRow[]; fresh: number }[] {
  const by = new Map<string, { fresh: SoundRow[]; rated: SoundRow[] }>()
  for (const x of list) {
    if (isMusic(x)) continue
    const g = by.get(x.group) ?? { fresh: [], rated: [] }
    ;(answered(`ton:${x.id}`) ? g.rated : g.fresh).push(x)
    by.set(x.group, g)
  }
  return [...by].map(([name, g]) => ({ name, items: [...g.fresh, ...g.rated], fresh: g.fresh.length }))
}

/** The ideas: the unfolded one as a card built like a question card (one verdict is the main action), then the list. */
function ideasBody($: EngineInterface, k: Kit, options: Options, s: ReviewUiState, d: ReviewData): RenderElement[] {
  if (!d.ideas.length)
    return [
      EmptyState(k, {
        icon: 'bookmark',
        title: 'Keine Ideen',
        text: d.cfg?.ideas ? 'Die Ideen-Datei ist leer.' : 'Für Ideen ist keine Datei eingetragen.',
      }),
    ]
  const out: RenderElement[] = []
  const shown = d.ideas.find(i => i.id === s.open)
  if (shown) {
    const stored = s.drafts[shown.id] ?? ''
    const comment = () => fieldText(commentKey(shown.id), stored)
    out.push(
      Card(k, {
        key: `rv-idea-card-${shown.id}`,
        title: { icon: 'bookmark', title: shown.title },
        children: [
          shown.text ? Sentence(k, shown.text) : null,
          Field(k, {
            key: commentKey(shown.id),
            label: 'Kommentar',
            placeholder: 'z. B. erst nach dem Dorf',
            value: stored,
            submitLabel: 'Antworten',
            onInput: v => void patchReview($, x => ({ drafts: { ...x.drafts, [shown.id]: v } })),
            onSubmit: v => void answerItem($, options, shown.id, 'kommentar', null, v, false),
          }),
        ],
        actions: {
          primary: {
            key: `rv-idea-yes-${shown.id}`,
            label: 'Gute Idee',
            variant: 'primary',
            onPress: () => void answerItem($, options, shown.id, 'passt', null, comment(), false),
          },
          secondary: [
            {
              key: `rv-idea-no-${shown.id}`,
              label: 'Eher nicht',
              variant: 'secondary',
              onPress: () => void answerItem($, options, shown.id, 'passt-nicht', null, comment(), false),
            },
          ],
          links: [
            {
              key: `rv-idea-close-${shown.id}`,
              label: k.s.close,
              variant: 'link',
              onPress: () => void patchReview($, { open: undefined }),
            },
          ],
        },
      }),
    )
  }
  out.push(
    Card(k, {
      key: 'rv-ideas',
      title: { icon: 'bookmark', title: 'Ideen', count: d.ideas.length },
      children: d.ideas.map(i => {
        const a = d.answers.get(i.id)
        return ListRow(k, {
          key: `rv-idea-${i.id}`,
          title: i.title,
          icon: 'bookmark',
          pill: a
            ? { text: verdictText(a.verdict), tone: verdictTone(a.verdict) }
            : i === shown
              ? { text: 'geöffnet', tone: 'info', glyph: false }
              : undefined,
          actions:
            i === shown
              ? []
              : [
                  {
                    key: `rv-idea-open-${i.id}`,
                    label: 'Details',
                    variant: 'link',
                    onPress: () => void patchReview($, { open: i.id }),
                  },
                ],
          actionSlot: 8,
        })
      }),
    }),
  )
  return out
}

function runningBody(k: Kit, d: ReviewData): RenderElement[] {
  const out: RenderElement[] = [
    Card(k, {
      key: 'rv-running',
      children: [
        CardTitle(k, { icon: 'activity', title: 'Läuft gerade', count: d.running.length }),
        ...(d.running.length
          ? d.running.map((r, i) =>
              ListRow(k, { key: `rv-run-${i}`, title: r.line || r.name, status: 'running', meta: r.name }),
            )
          : [Sentence(k, 'Keine Status-Datei gefunden.', { faint: true })]),
      ],
    }),
  ]
  if (d.queue.length)
    out.push(
      Card(k, {
        key: 'rv-queue',
        children: [
          CardTitle(k, { icon: 'list', title: 'Als Nächstes', count: d.queue.length }),
          ...d.queue.slice(0, 12).map(q => Sentence(k, `· ${q}`)),
        ],
      }),
    )
  return out
}

/**
 * The picture viewer: frame (Svg + paint overlay on desktop; a copy button for the file elsewhere). What is chosen
 * (view, tool, colour) is a `Segment`, never an action button; verdicts and paging share the one action row.
 */
export async function viewerCard(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  k: Kit,
  options: Options,
  v: ReviewViewState,
): Promise<RenderElement> {
  const els = table($, e)
  const { Box } = k
  const g = v.groups[v.group] ?? v.groups[0]
  const frames = g?.frames ?? []
  const frame = frames[Math.min(v.frame, frames.length - 1)]
  const total = v.groups.length
  let picture: RenderElement | null = null
  if (frame && k.graphical && els.Svg) {
    const b64 = await readBase64($, frame)
    const size = b64 ? pngSize(b64) : undefined
    if (b64 && size && b64.length <= SVG_IMAGE_LIMIT) {
      const svg = markedSvg(`data:image/png;base64,${b64}`, size, v.marks)
      const Client = els.Client
      picture = (
        <Box key="rv-pic" position="relative" alignSelf="flex-start">
          {els.Svg({ source: svg, alt: `${v.title} · ${g?.label ?? ''}` })}
          {Client ? (
            <Box position="absolute" top={0} left={0} right={0} bottom={0}>
              <Client
                key="rv-paint"
                module="./paint.tsx"
                props={{ playing: v.playing, fps: 8 }}
                width="100%"
                height="100%"
              />
            </Box>
          ) : null}
        </Box>
      )
    }
  }
  // no picture on this surface: the file's path only behind a copy button, never as running text (R10)
  const fileNote: (RenderElement | null)[] = picture
    ? []
    : frame
      ? [
          Sentence(k, 'Das Bild liegt als Datei vor.', { faint: true }),
          CopyButton(k, { key: 'rv-copy-frame', text: frame, label: 'Pfad kopieren' }),
        ]
      : [Sentence(k, 'Kein Bild.', { faint: true })]
  const step = (d: number) => (x: ReviewViewState) => ({
    playing: false,
    frame: (x.frame + d + frames.length) % frames.length,
  })
  const marks = v.marks.length ? `${v.marks.length} Markierung${v.marks.length > 1 ? 'en' : ''}` : ''
  const where = [
    total > 1 ? `Ansicht ${v.group + 1} von ${total}` : '',
    g?.label ?? '',
    frames.length > 1 ? `Bild ${v.frame + 1}/${frames.length}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  // The note field keeps what is typed until typing pauses: an answer takes the text of the moment along, and the
  // draft ends with the view (the field's key is the same for the next picture).
  const send = (fits: boolean) => {
    const note = fieldText(VIEW_NOTE, v.note)
    clearFieldDraft(VIEW_NOTE)
    void patchView($, () => ({ note })).then(() => sendView($, options, fits))
  }
  const verdicts: { primary?: Action; secondary: Action[] } =
    v.source === 'report'
      ? { secondary: [] }
      : v.source === 'item'
        ? {
            // two verdicts of equal rank look the same
            secondary: [
              { key: 'rv-view-ok', label: FITS, variant: 'secondary', onPress: () => send(true) },
              {
                key: 'rv-view-send',
                label: FITS_NOT,
                variant: 'secondary',
                onPress: () => send(false),
              },
            ],
          }
        : {
            primary: {
              key: 'rv-view-send',
              label: 'Markierung an Claude',
              icon: 'claude',
              variant: 'primary',
              onPress: () => send(false),
            },
            secondary: [
              { key: 'rv-view-ok', label: FITS, variant: 'secondary', onPress: () => send(true) },
            ],
          }
  const links: Action[] = []
  if (frames.length > 1)
    links.push(
      // paging stays reachable in one press, whatever else stands in the row
      { key: 'rv-prev', label: 'Zurück', variant: 'link', keep: true, onPress: () => void patchView($, step(-1)) },
      { key: 'rv-next', label: 'Weiter', variant: 'link', keep: true, onPress: () => void patchView($, step(1)) },
      {
        key: 'rv-play',
        label: v.playing ? 'Anhalten' : 'Abspielen',
        icon: v.playing ? 'stop' : 'play',
        variant: 'link',
        onPress: () => void patchView($, x => ({ playing: !x.playing })),
      },
    )
  if (picture && v.marks.length)
    links.push({
      key: 'rv-undo',
      label: 'Rückgängig',
      variant: 'link',
      onPress: () => void patchView($, x => ({ marks: x.marks.slice(0, -1) })),
    })
  if (v.source !== 'report')
    links.push({
      key: 'rv-view-close',
      label: k.s.close,
      variant: 'link',
      onPress: () => {
        clearFieldDraft(VIEW_NOTE)
        void patchReview($, { view: undefined })
      },
    })
  return Card(k, {
    key: 'rv-viewer',
    title: { icon: 'eye', title: v.title, subtitle: where || undefined, count: marks },
    filter:
      total > 1
        ? Segment(k, {
            key: 'rv-group',
            options: v.groups.map((x, i) => ({ id: String(i), label: x.label })),
            active: String(v.group),
            onSelect: id => void patchView($, () => ({ group: Number(id), frame: 0 })),
          })
        : null,
    children: [
      v.question ? Sentence(k, v.source === 'claude' ? `Claude fragt: „${v.question}“` : v.question) : null,
      picture,
      ...fileNote,
      picture ? (
        <Box key="rv-tools" flexDirection="row" alignItems="center" gap={2} flexWrap="wrap">
          {Segment(k, {
            key: 'rv-tool',
            options: [
              { id: 'pen', label: 'Stift' },
              { id: 'arrow', label: 'Pfeil' },
            ],
            active: v.tool,
            onSelect: tool => void patchView($, () => ({ tool })),
          })}
          {Segment(k, {
            key: 'rv-color',
            options: [
              { id: 'red', label: 'Rot' },
              { id: 'yellow', label: 'Gelb' },
              { id: 'blue', label: 'Blau' },
            ],
            active: v.color,
            onSelect: color => void patchView($, () => ({ color })),
          })}
        </Box>
      ) : null,
      Field(k, {
        key: VIEW_NOTE,
        label: 'Notiz',
        placeholder: 'z. B. Schatten zu hart',
        value: v.note,
        submitLabel: 'Merken',
        onInput: t => void patchView($, () => ({ note: t })),
        onSubmit: t => void patchView($, () => ({ note: t })),
      }),
    ],
    hint:
      v.source === 'claude'
        ? 'Claude bekommt das Bild mit deiner Markierung, Ansicht, Bildnummer und Notiz.'
        : undefined,
    status: false,
    actions: { ...verdicts, links },
    maxActions: 5,
  })
}

/** Setup state when the project has no `review` block: what it is for and the one way to get it. */
function setupHint($: EngineInterface, k: Kit): RenderElement {
  return EmptyState(k, {
    icon: 'gear',
    title: 'Review ist nicht eingerichtet',
    text: 'Fragen, Antworten und Ideen brauchen einen Eintrag in den Projekt-Einstellungen. Klänge und Meldungen gehen auch ohne.',
    action: askAction($, k, {
      key: 'rv-setup-draft',
      label: 'Entwurf erstellen',
      icon: 'wand',
      variant: 'primary',
      text: 'Führe /unity-init aus und ergänze in der .claude/unity.json den Block „review“ (questions: Fragen-JSON, answers: Antwort-Log, shots: Ordner für Screenshots, ideas, running, queue). Zeig mir den Entwurf und schreib ihn erst, wenn ich zustimme.',
    }),
  })
}

/**
 * The tab's own card above the sub tabs: the one place of „Problem melden“ (it works in every sub tab and without a
 * `review` block) and the screenshot switch, which holds for every answer of the tab.
 */
function frameCard($: EngineInterface, k: Kit, options: Options, s: ReviewUiState, d: ReviewData): RenderElement | null {
  const canShoot = !!d.cfg?.shots
  if (s.report && !canShoot) return null
  return Card(k, {
    key: 'rv-frame',
    title: { icon: 'flag', title: 'Review', count: openTotal(d) || '' },
    children: canShoot
      ? [
          Toggle(k, {
            key: 'rv-shot',
            label: 'Screenshot mitschicken',
            on: s.attachShot,
            onToggle: on => void patchReview($, { attachShot: on }),
          }),
        ]
      : [],
    status: false,
    actions: s.report
      ? []
      : [
          {
            key: 'rv-report-open',
            label: 'Problem melden',
            icon: 'flag',
            variant: 'secondary',
            onPress: () => void openReport($, options),
          },
        ],
  })
}

/** Unanswered questions plus reports not yet sent, as the tab badge counts them. */
const openTotal = (d: ReviewData) =>
  d.questions.filter(q => !d.answers.has(q.id)).length + d.reports.filter(r => !r.sent).length

export async function reviewTab(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  k: Kit,
  options: Options,
): Promise<RenderElement> {
  const { Box } = k
  const s = await readReview($)
  const d = await loadReview($)
  const now = Date.now()
  const sub = (SUBS.some(x => x.id === s.sub) ? s.sub : 'look') as SubTab
  const count = (kind: Question['kind']) => d.questions.filter(q => q.kind === kind && !d.answers.has(q.id)).length
  const counts: Partial<Record<SubTab, number>> = {
    look: count('anschauen') + d.reports.filter(r => !r.sent).length,
    decide: count('entscheiden'),
    pictures: count('bild'),
    sounds: s.sounds?.list.filter(x => !isMusic(x) && !d.answers.has(`ton:${x.id}`)).length,
  }
  const parts: (RenderElement | null)[] = []
  if (s.report) parts.push(await reportCard($, e, k, options, s))
  if (s.view) parts.push(await viewerCard($, e, k, options, s.view))
  // `s.notice` (what the last press said) stands in the pane's fixed status line, see renderPane
  parts.push(frameCard($, k, options, s, d))
  parts.push(
    Tabs(k, {
      tabs: SUBS.map(x => ({ id: x.id, label: x.label, icon: x.icon, count: counts[x.id] || undefined })),
      active: sub,
      keyPrefix: 'rv-tab-',
      moreLabel: 'Mehr',
      onSelect: id => void patchReview($, { sub: id, open: undefined, notice: undefined }),
    }),
  )
  const kind = KIND_OF[sub]
  if (sub === 'sounds') parts.push(...soundsBody($, k, options, s, d))
  else if (!d.cfg) parts.push(setupHint($, k))
  else if (kind) parts.push(...questionsBody($, k, options, s, d, kind, now))
  else if (sub === 'ideas') parts.push(...ideasBody($, k, options, s, d))
  else parts.push(...runningBody(k, d))
  return (
    <Box key="rv" flexDirection="column" gap={1}>
      {parts.filter(Boolean)}
    </Box>
  )
}

/** Open review items (the tab badge): unanswered questions plus reports not yet sent. */
export async function reviewBadge($: EngineInterface, _options: Options): Promise<number> {
  try {
    return await openCount($)
  } catch {
    return 0
  }
}

/** A stroke posted by the paint overlay, as a mark of the current tool and colour. */
export function addMark(v: ReviewViewState, pts: [number, number][]): ReviewViewState {
  const clean = pts.filter(p => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number').slice(0, 400)
  if (!clean.length) return v
  const mark: ReviewMark = {
    tool: v.tool,
    color: v.color,
    pts: v.tool === 'arrow' && clean.length > 1 ? [clean[0]!, clean[clean.length - 1]!] : clean,
  }
  return { ...v, marks: [...v.marks, mark].slice(-20) }
}
