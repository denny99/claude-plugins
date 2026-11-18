/**
 * The Review tab: sub-tabs Anschauen · Entscheiden · Bilder · Sounds · Ideen · Laufend over the project's review files
 * (paths from `.claude/unity.json` → `review`), the picture viewer (frames, directions, views, painting) and the
 * "Problem melden" card. Answers are appended to the project's log, never rewritten.
 */
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { ReviewMark, ReviewUiState, ReviewViewState } from '../../types'
import {
  ActionButton,
  Actions,
  Card,
  CardTitle,
  CopyButton,
  EmptyState,
  ListRow,
  Pill,
  Sentence,
  Tabs,
  type Action,
  type Kit,
} from '../../lib/ui'
import type { IconName } from '../../lib/icons'
import { join } from '../../lib/path'
import * as play from '../../lib/play'
import { gotoSpot, mixGet, mixSet, soundList, soundPlay, soundStop, type Options } from '../state'
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
import { openReport, reportCard, sendStoredReport } from './report'

type El = (props: Record<string, unknown>) => RenderElement

export type SubTab = 'look' | 'decide' | 'pictures' | 'sounds' | 'ideas' | 'running'
const SUBS: { id: SubTab; label: string; icon: IconName }[] = [
  { id: 'look', label: 'Anschauen', icon: 'eye' },
  { id: 'decide', label: 'Entscheiden', icon: 'list' },
  { id: 'pictures', label: 'Bilder', icon: 'camera' },
  { id: 'sounds', label: 'Sounds', icon: 'speaker' },
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

const verdictText = (v: Verdict) => (v === 'passt' ? 'passt' : v === 'passt-nicht' ? 'passt nicht' : 'Kommentar')
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
      drafts: Object.fromEntries(Object.entries(s.drafts).filter(([key]) => key !== id)),
      open: s.open === id ? undefined : s.open,
      ...say(`Antwort gespeichert: ${verdictText(verdict)}${screenshot ? ' · mit Screenshot' : ''}.`),
    }))
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
  await patchReview($, say(play.isPlayError(res) ? `Hinspringen ging nicht: ${res.error}` : 'Im Spiel hingesprungen.'))
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
  await $.prompt.submit({ text: text.join('\n') })
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
      list: play.isPlayError(list) ? [] : list.sounds.map(x => ({ ...x, group: x.group ?? '' })),
      mix: play.isPlayError(mix) ? [] : mix.groups,
      mode: s.sounds?.mode ?? 'near',
      musicOpen: s.sounds?.musicOpen ?? false,
      ...(err ? { error: err } : {}),
    },
  }))
}

export async function playSound($: EngineInterface, options: Options, id: string): Promise<void> {
  const s = await readReview($)
  const res = await soundPlay($, options, id, s.sounds?.mode ?? 'near')
  await patchReview($, x => ({
    open: `ton:${id}`,
    sounds: x.sounds ? { ...x.sounds, playing: play.isPlayError(res) ? undefined : id } : x.sounds,
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

function questionCard(
  $: EngineInterface,
  Input: El | undefined,
  k: Kit,
  options: Options,
  s: ReviewUiState,
  q: Question,
): RenderElement {
  const draft = s.drafts[q.id] ?? ''
  const icon: IconName = q.kind === 'entscheiden' ? 'list' : q.kind === 'bild' ? 'camera' : 'eye'
  const acts: Action[] = []
  if (q.spot)
    acts.push({
      key: `rv-goto-${q.id}`,
      label: 'Im Spiel hinspringen',
      icon: 'pin',
      variant: 'secondary',
      onPress: () => void jump($, options, q.spot),
    })
  if (q.image)
    acts.push({
      key: `rv-img-${q.id}`,
      label: 'Bild ansehen',
      icon: 'eye',
      variant: 'secondary',
      onPress: () => void viewItem($, q),
    })
  const choices = q.options.length ? q.options : q.kind === 'entscheiden' ? [] : ['passt', 'passt nicht']
  const letter = (i: number) => String.fromCharCode(65 + i)
  const choiceIcon = (c: string): IconName =>
    q.kind === 'entscheiden' ? 'arrow' : verdictOf(c, '') === 'passt' ? 'check' : 'x'
  return Card(k, {
    key: `rv-q-${q.id}`,
    children: [
      CardTitle(k, {
        icon,
        title: q.title,
        // no "Entscheiden" pill: the sub tab says it already, and the title gets the room
      }),
      q.text ? Sentence(k, q.text) : null,
      acts.length ? Actions(k, `rv-acts-${q.id}`, acts, 3) : null,
      choices.length && q.kind === 'entscheiden'
        ? decisionChoices(
            k,
            q.id,
            choices,
            c => () => void answerItem($, options, q.id, 'kommentar', c, draft, s.attachShot),
          )
        : choices.length
          ? Actions(
              k,
              `rv-choices-${q.id}`,
              choices.map((c, i) => ({
                key: `rv-choice-${q.id}-${i}`,
                label: q.kind === 'entscheiden' ? `${letter(i)} · ${c}` : c,
                icon: choiceIcon(c),
                variant: 'secondary' as const,
                onPress: () =>
                  void answerItem(
                    $,
                    options,
                    q.id,
                    q.kind === 'entscheiden' ? 'kommentar' : verdictOf(c, draft),
                    q.kind === 'entscheiden' ? c : null,
                    draft,
                    s.attachShot,
                  ),
              })),
              4,
            )
          : null,
      Input
        ? Input({
            key: `rv-comment-${q.id}`,
            placeholder: 'Kommentar',
            value: draft,
            submitLabel: 'Antworten',
            onInput: (v: string) => void patchReview($, x => ({ drafts: { ...x.drafts, [q.id]: v } })),
            onSubmit: (v: string) => void answerItem($, options, q.id, 'kommentar', null, v, s.attachShot),
          })
        : null,
      // One "Antworten": the comment field's own submit button; a separate one only where there is no field.
      Actions(
        k,
        `rv-send-${q.id}`,
        [
          ...(Input
            ? []
            : [
                {
                  key: `rv-answer-${q.id}`,
                  label: 'Antworten',
                  icon: 'check' as const,
                  variant: 'primary' as const,
                  onPress: () => void answerItem($, options, q.id, 'kommentar', null, draft, s.attachShot),
                },
              ]),
          {
            key: `rv-shot-${q.id}`,
            label: shotToggleLabel(s.attachShot),
            variant: 'link',
            onPress: () => void patchReview($, x => ({ attachShot: !x.attachShot })),
          },
        ],
        2,
      ),
    ],
  })
}

/** The screenshot switch as a checkbox, so it reads as a switch and not as a note: "☑ Screenshot mitschicken". */
export function shotToggleLabel(on: boolean): string {
  return `${on ? '☑' : '☐'} Screenshot mitschicken`
}

function storedReportRow(
  $: EngineInterface,
  k: Kit,
  options: Options,
  r: ReviewData['reports'][number],
): RenderElement {
  const acts: Action[] = [
    {
      key: `rv-rep-send-${r.id}`,
      label: 'An Claude schicken',
      icon: 'claude',
      variant: 'secondary',
      onPress: () => void sendStoredReport($, options, r),
    },
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
    meta: 'gemerkt, noch nicht an Claude',
    actions: acts,
  })
}

function questionsBody(
  $: EngineInterface,
  Input: El | undefined,
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
  const out: RenderElement[] = []
  if (kind === 'anschauen') for (const r of d.reports.filter(x => !x.sent)) out.push(storedReportRow($, k, options, r))
  if (!open.length && !out.length)
    out.push(
      EmptyState(k, {
        icon: 'check',
        title: 'Alles beantwortet',
        text: all.length ? `${all.length} erledigt.` : 'Hier liegt gerade nichts.',
      }),
    )
  const expanded = open.find(q => q.id === s.open) ?? open[0]
  for (const q of open) {
    if (q === expanded) out.push(questionCard($, Input, k, options, s, q))
    else
      out.push(
        ListRow(k, {
          key: `rv-row-${q.id}`,
          title: q.title,
          icon: q.kind === 'entscheiden' ? 'list' : q.kind === 'bild' ? 'camera' : 'eye',
          actions: [
            {
              key: `rv-open-${q.id}`,
              label: 'Öffnen',
              variant: 'link',
              onPress: () => void patchReview($, { open: q.id }),
            },
          ],
        }),
      )
  }
  for (const q of done.slice(-5).reverse()) {
    const a = d.answers.get(q.id)!
    out.push(
      ListRow(k, {
        key: `rv-done-${q.id}`,
        title: q.title,
        status: 'ok',
        meta: `${a.choice ?? verdictText(a.verdict)} · beantwortet ${ago(a.time, now)}`,
        pill: { text: verdictText(a.verdict), tone: verdictTone(a.verdict) },
      }),
    )
  }
  return out
}

function soundsBody(
  $: EngineInterface,
  Input: El | undefined,
  k: Kit,
  options: Options,
  s: ReviewUiState,
  d: ReviewData,
): RenderElement[] {
  const snd = s.sounds
  if (!snd)
    return [
      EmptyState(k, {
        icon: 'speaker',
        title: 'Klänge aus dem Spiel',
        text: 'Liste und Mix kommen aus dem Unity-Editor vom Soundboard des Projekts.',
        action: {
          key: 'rv-snd-load',
          label: 'Klänge holen',
          icon: 'refresh',
          variant: 'primary',
          onPress: () => void loadSounds($, options),
        },
      }),
    ]
  const out: RenderElement[] = []
  if (snd.error)
    out.push(
      Card(k, {
        key: 'rv-snd-err',
        tone: 'warn',
        children: [
          CardTitle(k, { icon: 'alert', title: 'Soundboard nicht erreichbar' }),
          Sentence(k, snd.error),
          Actions(k, 'rv-snd-err-acts', [
            {
              key: 'rv-snd-retry',
              label: 'Nochmal holen',
              icon: 'refresh',
              variant: 'secondary',
              onPress: () => void loadSounds($, options),
            },
          ]),
        ],
      }),
    )
  if (snd.mix.length)
    out.push(
      Card(k, {
        key: 'rv-mix',
        children: [
          CardTitle(k, {
            icon: 'sliders',
            title: 'Mix',
            pill: { text: 'wirkt sofort im Spiel', tone: 'info', glyph: false },
          }),
          ...snd.mix.map(m =>
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
          Sentence(k, 'Das Spiel speichert den Mix selbst.', { faint: true }),
        ],
      }),
    )
  const fresh = snd.list.filter(x => !isMusic(x) && !d.answers.has(`ton:${x.id}`))
  const rated = snd.list.filter(x => !isMusic(x) && d.answers.has(`ton:${x.id}`))
  const music = snd.list.filter(isMusic)
  const secs = (n: number) => `${n.toFixed(1).replace('.', ',')} s`
  const rate = (id: string, fits: boolean) =>
    void answerItem($, options, `ton:${id}`, fits ? 'passt' : 'passt-nicht', id, s.drafts[`ton:${id}`] ?? '', false)
  const rows: (RenderElement | null)[] = []
  for (const x of fresh) {
    rows.push(
      ListRow(k, {
        key: `rv-snd-${x.id}`,
        title: x.name,
        status: snd.playing === x.id ? 'running' : undefined,
        meta: `${x.group} · ${secs(x.duration)}${x.takes > 1 ? ` · ${x.takes} Varianten` : ''}`,
        actions: [
          {
            key: `rv-play-${x.id}`,
            label: 'Abspielen',
            icon: 'play',
            variant: 'secondary',
            onPress: () => void playSound($, options, x.id),
          },
          {
            key: `rv-ok-${x.id}`,
            label: 'passt',
            icon: 'check',
            variant: 'secondary',
            onPress: () => rate(x.id, true),
          },
          { key: `rv-no-${x.id}`, label: 'nochmal', icon: 'x', variant: 'secondary', onPress: () => rate(x.id, false) },
        ],
      }),
    )
    if (s.open === `ton:${x.id}` && Input)
      rows.push(
        Input({
          key: `rv-note-ton-${x.id}`,
          placeholder: 'Notiz zum Klang',
          value: s.drafts[`ton:${x.id}`] ?? '',
          submitLabel: 'nochmal',
          onInput: (v: string) => void patchReview($, y => ({ drafts: { ...y.drafts, [`ton:${x.id}`]: v } })),
          onSubmit: () => rate(x.id, false),
        }),
      )
  }
  for (const x of rated) {
    const a = d.answers.get(`ton:${x.id}`)!
    rows.push(
      ListRow(k, {
        key: `rv-snd-done-${x.id}`,
        title: x.name,
        meta: x.group,
        pill: { text: verdictText(a.verdict), tone: verdictTone(a.verdict) },
      }),
    )
  }
  out.push(
    Card(k, {
      key: 'rv-snd-new',
      children: [
        CardTitle(k, { icon: 'speaker', title: 'Neue Klänge', count: fresh.length }),
        Actions(
          k,
          'rv-snd-mode',
          [
            {
              key: 'rv-mode-near',
              label: 'Klang an der Figur (3D)',
              icon: snd.mode === 'near' ? 'check' : 'circle',
              variant: 'secondary',
              onPress: () => void setSoundMode($, 'near'),
            },
            {
              key: 'rv-mode-flat',
              label: 'ohne Raum (2D)',
              icon: snd.mode === 'flat' ? 'check' : 'circle',
              variant: 'secondary',
              onPress: () => void setSoundMode($, 'flat'),
            },
            {
              key: 'rv-snd-stop',
              label: 'Stopp',
              icon: 'stop',
              variant: 'secondary',
              onPress: () => void stopSounds($, options),
            },
          ],
          3,
        ),
        ...rows,
      ],
    }),
  )
  if (music.length)
    out.push(
      Card(k, {
        key: 'rv-music',
        children: [
          CardTitle(k, { icon: 'music', title: `Musik · ${music.length} Stücke` }),
          ...(snd.musicOpen
            ? music.map(x =>
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
            : [Sentence(k, 'Jedes Stück einzeln anspielen.', { faint: true })]),
          ActionButton(k, {
            key: 'rv-music-toggle',
            label: snd.musicOpen ? 'Musik einklappen' : 'Musik zeigen',
            variant: 'link',
            onPress: () =>
              void patchReview($, x => ({ sounds: x.sounds && { ...x.sounds, musicOpen: !x.sounds.musicOpen } })),
          }),
        ],
      }),
    )
  return out
}

function ideasBody(
  $: EngineInterface,
  Input: El | undefined,
  k: Kit,
  options: Options,
  s: ReviewUiState,
  d: ReviewData,
): RenderElement[] {
  if (!d.ideas.length)
    return [
      EmptyState(k, {
        icon: 'bookmark',
        title: 'Keine Ideen',
        text: d.cfg?.ideas ? `Nichts in ${d.cfg.ideas}.` : 'review.ideas ist nicht eingetragen.',
      }),
    ]
  return d.ideas.map(i => {
    const a = d.answers.get(i.id)
    if (s.open !== i.id)
      return ListRow(k, {
        key: `rv-idea-${i.id}`,
        title: i.title,
        icon: 'bookmark',
        pill: a ? { text: verdictText(a.verdict), tone: verdictTone(a.verdict) } : undefined,
        actions: [
          {
            key: `rv-idea-open-${i.id}`,
            label: 'Öffnen',
            variant: 'link',
            onPress: () => void patchReview($, { open: i.id }),
          },
        ],
      })
    const draft = s.drafts[i.id] ?? ''
    return Card(k, {
      key: `rv-idea-card-${i.id}`,
      children: [
        CardTitle(k, { icon: 'bookmark', title: i.title }),
        i.text ? Sentence(k, i.text) : null,
        Input
          ? Input({
              key: `rv-idea-c-${i.id}`,
              placeholder: 'Kommentar',
              value: draft,
              submitLabel: 'Antworten',
              onInput: (v: string) => void patchReview($, x => ({ drafts: { ...x.drafts, [i.id]: v } })),
              onSubmit: (v: string) => void answerItem($, options, i.id, 'kommentar', null, v, false),
            })
          : null,
        Actions(
          k,
          `rv-idea-acts-${i.id}`,
          [
            {
              key: `rv-idea-yes-${i.id}`,
              label: 'Gute Idee',
              icon: 'check',
              variant: 'primary',
              onPress: () => void answerItem($, options, i.id, 'passt', null, draft, false),
            },
            {
              key: `rv-idea-no-${i.id}`,
              label: 'Eher nicht',
              icon: 'x',
              variant: 'secondary',
              onPress: () => void answerItem($, options, i.id, 'passt-nicht', null, draft, false),
            },
          ],
          2,
        ),
      ],
    })
  })
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

/** The picture viewer: frame (Svg + paint overlay on desktop; file path elsewhere), frame/direction controls. */
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
  const fileNote: (RenderElement | null)[] = picture
    ? []
    : frame
      ? [Sentence(k, `Bild in Datei ${frame}`, { faint: true }), CopyButton(k, { key: 'rv-copy-frame', text: frame })]
      : [Sentence(k, 'Kein Bild.', { faint: true })]
  const tools: Action[] = picture
    ? [
        {
          key: 'rv-tool-pen',
          label: 'Stift',
          icon: v.tool === 'pen' ? 'check' : 'pen',
          variant: 'secondary',
          onPress: () => void patchView($, () => ({ tool: 'pen' })),
        },
        {
          key: 'rv-tool-arrow',
          label: 'Pfeil',
          icon: v.tool === 'arrow' ? 'check' : 'arrow',
          variant: 'secondary',
          onPress: () => void patchView($, () => ({ tool: 'arrow' })),
        },
        ...(['red', 'yellow', 'blue'] as const).map(c => ({
          key: `rv-color-${c}`,
          label: c === 'red' ? 'Rot' : c === 'yellow' ? 'Gelb' : 'Blau',
          icon: (v.color === c ? 'check' : 'circle') as IconName,
          variant: 'secondary' as const,
          onPress: () => void patchView($, () => ({ color: c })),
        })),
        {
          key: 'rv-undo',
          label: 'Rückgängig',
          icon: 'rerun',
          variant: 'secondary',
          onPress: () => void patchView($, x => ({ marks: x.marks.slice(0, -1) })),
        },
      ]
    : []
  const Input = els.Input
  const step = (d: number) => (x: ReviewViewState) => ({
    playing: false,
    frame: (x.frame + d + frames.length) % frames.length,
  })
  return Card(k, {
    key: 'rv-viewer',
    children: [
      CardTitle(k, {
        icon: 'eye',
        title: v.title,
        count: total > 1 ? `${v.group + 1} von ${total}` : frames.length > 1 ? `${frames.length} Bilder` : '',
      }),
      v.question ? Sentence(k, v.source === 'claude' ? `Claude fragt: „${v.question}“` : v.question) : null,
      picture,
      ...fileNote,
      Sentence(k, `${g?.label ?? ''}${frames.length > 1 ? ` · Bild ${v.frame + 1}/${frames.length}` : ''}`, {
        faint: true,
      }),
      v.marks.length
        ? Pill(k, { text: `${v.marks.length} Markierung${v.marks.length > 1 ? 'en' : ''}`, tone: 'bad', glyph: false })
        : null,
      total > 1
        ? Actions(
            k,
            'rv-groups',
            v.groups.map((x, i) => ({
              key: `rv-group-${i}`,
              label: x.label,
              icon: (i === v.group ? 'check' : 'circle') as IconName,
              variant: 'secondary' as const,
              onPress: () => void patchView($, () => ({ group: i, frame: 0 })),
            })),
            8,
          )
        : null,
      frames.length > 1
        ? Actions(
            k,
            'rv-frames',
            [
              {
                key: 'rv-prev',
                label: 'Zurück',
                icon: 'arrow',
                variant: 'secondary',
                onPress: () => void patchView($, step(-1)),
              },
              {
                key: 'rv-play',
                label: v.playing ? 'Anhalten' : 'Abspielen',
                icon: v.playing ? 'stop' : 'play',
                variant: 'secondary',
                onPress: () => void patchView($, x => ({ playing: !x.playing })),
              },
              {
                key: 'rv-next',
                label: 'Weiter',
                icon: 'next',
                variant: 'secondary',
                onPress: () => void patchView($, step(1)),
              },
            ],
            3,
          )
        : null,
      tools.length ? Actions(k, 'rv-tools', tools, 6) : null,
      Input
        ? Input({
            key: 'rv-view-note',
            placeholder: v.marks.length ? 'Notiz zu Markierung 1' : 'Notiz',
            value: v.note,
            submitLabel: 'Notiz',
            onInput: (t: string) => void patchView($, () => ({ note: t })),
            onSubmit: (t: string) => void patchView($, () => ({ note: t })),
          })
        : null,
      v.source === 'report'
        ? null
        : Actions(
            k,
            'rv-view-acts',
            [
              {
                key: 'rv-view-send',
                label: v.source === 'item' ? 'Passt nicht' : 'Markierung an Claude',
                icon: v.source === 'item' ? 'x' : 'claude',
                variant: 'primary',
                onPress: () => void sendView($, options, false),
              },
              {
                key: 'rv-view-ok',
                label: 'Passt so',
                icon: 'check',
                variant: 'secondary',
                onPress: () => void sendView($, options, true),
              },
              {
                key: 'rv-view-close',
                label: 'Schließen',
                variant: 'link',
                onPress: () => void patchReview($, { view: undefined }),
              },
            ],
            3,
          ),
      v.source === 'claude'
        ? Sentence(k, 'Claude bekommt das Bild mit deiner Markierung, Ansicht, Bildnummer und Notiz.', { faint: true })
        : null,
    ],
  })
}

/** Setup hint when the project has no `review` block. */
function setupHint(k: Kit): RenderElement {
  return EmptyState(k, {
    icon: 'gear',
    title: 'Review ist nicht eingerichtet',
    text: 'Trag in .claude/unity.json einen Block „review“ ein: questions (Fragen-JSON), answers (Antwort-Log), shots (Ordner für Screenshots), ideas, running, queue. Sounds und Problem melden gehen auch ohne.',
  })
}

export async function reviewTab(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  k: Kit,
  options: Options,
): Promise<RenderElement> {
  const { Box } = k
  const s = await readReview($)
  const d = await loadReview($)
  const Input = table($, e).Input
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
  if (s.notice) parts.push(Sentence(k, s.notice, { faint: true }))
  if (!s.report)
    parts.push(
      ActionButton(k, {
        key: 'rv-report-open',
        label: 'Problem melden',
        icon: 'flag',
        variant: 'secondary',
        onPress: () => void openReport($, options),
      }),
    )
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
  if (sub === 'sounds') parts.push(...soundsBody($, Input, k, options, s, d))
  else if (!d.cfg) parts.push(setupHint(k))
  else if (kind) parts.push(...questionsBody($, Input, k, options, s, d, kind, now))
  else if (sub === 'ideas') parts.push(...ideasBody($, Input, k, options, s, d))
  else parts.push(...runningBody(k, d))
  return (
    <Box key="rv" flexDirection="column" gap={1}>
      {parts.filter(Boolean)}
    </Box>
  )
}

/**
 * The options of a decision, one per row: a short letter button ("A") and the whole option as wrapping text beside it,
 * so a long option is read in full before it is chosen (a native Button cuts its label). The button's accessible
 * label carries the whole option.
 */
function decisionChoices(k: Kit, id: string, choices: string[], choose: (c: string) => () => void): RenderElement {
  const { Box, Button } = k
  return (
    <Box key={`rv-choices-${id}`} flexDirection="column" gap={k.graphical ? 'xs' : 0}>
      {choices.map((c, i) => {
        const letter = String.fromCharCode(65 + i)
        return (
          <Box key={`rv-choice-row-${id}-${i}`} flexDirection="row" alignItems="center" gap={1}>
            <Box flexShrink={0}>
              <Button key={`rv-choice-${id}-${i}`} label={`${letter} · ${c}`} variant="secondary" onPress={choose(c)}>
                {letter}
              </Button>
            </Box>
            {Sentence(k, c)}
          </Box>
        )
      })}
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
