/**
 * "Problem melden": the header button captures the running game through the bridge (picture + spot), the Review tab
 * then shows the picture to paint on, the kind, a note and an optional 10 s performance sample. "An Claude schicken"
 * hands it to Claude (text + feedback tool for the picture); "Nur merken" keeps it in the review list.
 */
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { ReviewReportState, ReviewUiState } from '../../types'
import { Actions, askClaude, Card, CardTitle, ProblemCard, Sentence, type Action, type Kit } from '../../lib/ui'
import type { IconName } from '../../lib/icons'
import { join } from '../../lib/path'
import * as play from '../../lib/play'
import { perfRecord, readModel, type Options } from '../state'
import { bridgeDir } from '../../lib/bridge'
import { spotFacts, spotText, type Report } from './data'
import {
  appendReport,
  captureTo,
  markReportSent,
  nowStamp,
  patchReview,
  readReview,
  ensureReportsIgnored,
  reportsDir,
  reviewRoot,
} from './store'
import { describeMarks, marksLine } from './viewer'
import { newView, saveMarks } from './tab'
import { bridgeUpdateAction } from '../pane/common'

type El = (props: Record<string, unknown>) => RenderElement

export const REPORT_KINDS: { id: string; icon: IconName }[] = [
  { id: 'Sieht falsch aus', icon: 'eye' },
  { id: 'Ruckelt', icon: 'gauge' },
  { id: 'Verhalten', icon: 'activity' },
  { id: 'Klang', icon: 'speaker' },
  { id: 'Idee', icon: 'bookmark' },
]

export const MEASURE_SECONDS = 10

/**
 * Facts for the report card: the project's spot (IClaudeSpotProvider) when it reports one, else what the bridge knows
 * itself (scene, camera) plus why there is no spot.
 */
export function captureFacts(shot: play.CaptureResult): string[] {
  // A picture without its UI Toolkit layer says so first: it does not show what the player sees.
  const ui = play.shotUiNote(shot.ui)
  const facts = spotFacts(shot.spot)
  if (facts.length) return ui ? [ui, ...facts] : facts
  const out: string[] = ui ? [ui] : []
  if (shot.scene) out.push(`Szene ${shot.scene.split('/').pop()?.replace(/\.unity$/, '') ?? shot.scene}`)
  const p = shot.camera?.position
  if (p) out.push(`Kamera ${p.map(n => Math.round(n)).join(' / ')}`)
  out.push(shot.provider ? 'Stelle: Projekt meldet hier keine' : 'Stelle unbekannt (Projekt meldet keine Stelle)')
  return out
}

/**
 * The note as typed. Every keystroke into the atom redrew the whole tab and handed the Input a new value each time
 * (its frame flickered), so keystrokes land here and reach the atom once typing pauses ({@link NOTE_FLUSH_MS}), on
 * Enter, on a kind press and before the report is finished. `report` is the open report's stamp, so a draft never
 * leaks into the next report.
 */
let noteDraft: { report: string; text: string; seq: number } | undefined
export const NOTE_FLUSH_MS = 700

/** Header button: capture now (full picture for Claude + a small one the pane can draw), open the report card. */
export async function openReport($: EngineInterface, options: Options): Promise<void> {
  // One report at a time: a second press while the first capture runs made a second picture (live: two per report).
  if ((await readReview($)).report?.busy) return
  const { root, cfg } = await reviewRoot($)
  const dir = reportsDir(root, cfg)
  await ensureReportsIgnored($, root, cfg)
  const t = await nowStamp($)
  const full = join(dir, `report-${t.file}.png`)
  // The small picture is only for the pane: it goes to the bridge's temp shots (cleaned there), so the reports folder
  // holds one picture per report.
  const project = (await readModel($)).project?.root
  const small = project ? join(bridgeDir(project), 'shots', `shot-report-${t.file}-klein.png`) : join(dir, `report-${t.file}-klein.png`)
  noteDraft = undefined
  await patchReview($, {
    report: { stamp: t.file, facts: [], note: '', measure: false, busy: 'Screenshot …' },
    notice: undefined,
  })
  const shot = await captureTo($, options, full)
  if (play.isPlayError(shot)) {
    await patchReview($, { report: { facts: [], note: '', measure: false, error: shot.error }, view: undefined })
    return
  }
  const preview = await captureTo($, options, small, { width: 384, height: 216 })
  const shown = play.isPlayError(preview) ? full : small
  // The capture can take seconds (Unity in the background): kind and note chosen meanwhile stay (live they were lost
  // here, the prompt said "ohne Art" without the note).
  await patchReview($, s => ({
    report: {
      stamp: t.file,
      shot: full,
      preview: shown,
      spot: shot.spot ?? null,
      spotLine: spotText(shot.spot),
      facts: captureFacts(shot),
      ...(shot.ui ? { shotUi: shot.ui } : {}),
      note: s.report?.note ?? '',
      measure: s.report?.measure ?? false,
      ...(s.report?.kind ? { kind: s.report.kind } : {}),
    } satisfies ReviewReportState,
    view: newView('report', `report-${t.file}`, 'Screenshot von eben', undefined, [
      { label: 'Screenshot', frames: [shown] },
    ]),
  }))
}

/** Writes the typed note into the open report (no-op when nothing new was typed). */
async function flushNote($: EngineInterface): Promise<void> {
  const d = noteDraft
  if (!d) return
  await patchReview($, s =>
    s.report && (s.report.stamp ?? '') === d.report && s.report.note !== d.text
      ? { report: { ...s.report, note: d.text } }
      : {},
  )
}

function typeNote($: EngineInterface, report: string, text: string): void {
  const seq = (noteDraft?.seq ?? 0) + 1
  noteDraft = { report, text, seq }
  $.clock.after(NOTE_FLUSH_MS, () => {
    if (noteDraft?.seq === seq) void flushNote($)
  })
}

async function patchReport(
  $: EngineInterface,
  fn: (r: ReviewReportState) => Partial<ReviewReportState>,
): Promise<void> {
  await patchReview($, s => (s.report ? { report: { ...s.report, ...fn(s.report) } } : {}))
}

function reportText(r: Report, marks: string[], svg: string | undefined): string {
  return [
    `Problem gemeldet im Unity-Spiel: ${r.kind || 'ohne Art'}.`,
    r.note ? `Notiz: ${r.note}` : '',
    ...marks,
    r.screenshot ? `Screenshot: ${r.screenshot}` : '',
    r.screenshot ? (play.shotUiPrompt(r.ui as play.ShotUi | undefined) ?? '') : '',
    svg ? `Markierungen (SVG über dem Bild): ${svg}` : '',
    spotText(r.spot) ? `Stelle (für unity goto): ${spotText(r.spot)}` : '',
    r.perf ? `Leistung: ${r.perf}` : '',
    marksLine(marks.length, !!r.screenshot),
  ]
    .filter(Boolean)
    .join('\n')
}

function perfLine(p: play.PerfResult): string {
  const worst = p.costs
    .slice()
    .sort((a, b) => b.hitchShare - a.hitchShare)
    .slice(0, 3)
    .map(c => `${c.name} ${Math.round(c.hitchShare * 100)}%`)
    .join(', ')
  return (
    `${p.seconds} s, ${p.frames} Bilder, Ø ${p.avgMs.toFixed(1)} ms, p95 ${p.p95.toFixed(1)} ms, ` +
    `schlechtestes ${p.worst.toFixed(1)} ms, ${p.hitches} Ruckler${worst ? ` (Anteile: ${worst})` : ''}`
  )
}

/**
 * Finishes the open report. With a measurement the 10 s recording runs as a detached job (`$.clock.after(0)`), so the
 * button's hook returns at once and the card shows "Messe 10 s Leistung …" until the report is sent or kept.
 */
export async function finishReport($: EngineInterface, options: Options, send: boolean): Promise<void> {
  await flushNote($)
  const r = (await readReview($)).report
  if (!r || r.busy) return
  if (!(r.measure || r.kind === 'Ruckelt')) return completeReport($, options, send, undefined)
  await patchReport($, () => ({
    busy: `Messe ${MEASURE_SECONDS} s Leistung …`,
    pending: send ? 'send' : 'keep',
  }))
  $.clock.after(0, () => void measureThenComplete($, options, send))
}

async function measureThenComplete($: EngineInterface, options: Options, send: boolean): Promise<void> {
  let perf: string
  try {
    const p = await perfRecord($, options, MEASURE_SECONDS)
    perf = play.isPlayError(p) ? `nicht gemessen (${p.error})` : perfLine(p)
  } catch (e) {
    perf = `nicht gemessen (${e instanceof Error ? e.message : String(e)})`
  }
  await completeReport($, options, send, perf)
}

async function completeReport(
  $: EngineInterface,
  _options: Options,
  send: boolean,
  perf: string | undefined,
): Promise<void> {
  const stamp = (await readReview($)).report?.stamp
  if (!send) {
    await buildReport($, false, perf)
    return
  }
  // Kit „ask Claude“: one lock per report (its stamp), taken before the report is written, so a second press of
  // „An Claude schicken“ only toasts and the report is neither logged nor sent twice.
  await askClaude($, {
    key: `rv-report:${stamp ?? ''}`,
    toast: 'Bericht an Claude geschickt.',
    text: () => buildReport($, true, perf),
  })
}

/** Writes the open report to the log and closes the card; the prompt text when it is sent. */
async function buildReport($: EngineInterface, send: boolean, perf: string | undefined): Promise<string | undefined> {
  const s = await readReview($)
  const r = s.report
  if (!r) return undefined
  const v = s.view?.source === 'report' ? s.view : undefined
  const saved = v
    ? await saveMarks($, { ...v, groups: [{ label: 'Screenshot', frames: [r.shot ?? r.preview ?? ''] }] })
    : {}
  const marks = v ? describeMarks(v.marks) : []
  const id = v?.id ?? `report-${(await nowStamp($)).file}`
  const report: Report = {
    id,
    kind: r.kind ?? '',
    note: r.note,
    spot: r.spot ?? null,
    screenshot: r.shot ?? null,
    ...(r.shotUi ? { ui: r.shotUi } : {}),
    ...(v?.marks.length ? { marks: v.marks } : {}),
    ...(perf ? { perf } : {}),
    time: (await nowStamp($)).iso,
    sent: send,
  }
  noteDraft = undefined
  await appendReport($, report)
  const text = reportText(report, marks, saved.svg)
  await patchReview($, {
    report: undefined,
    view: undefined,
    ...(send ? { feedback: { text, image: r.shot, svg: saved.svg, at: Date.now() } } : {}),
    notice: send ? 'An Claude geschickt.' : 'Gemerkt: steht unter Anschauen.',
  })
  return send ? text : undefined
}

/** A kept report sent later from the list: marks it sent and returns the prompt (run inside the ask lock). */
export async function storedReportPrompt($: EngineInterface, r: Report): Promise<string> {
  const marks = Array.isArray(r.marks) ? describeMarks(r.marks as never) : []
  const text = reportText(r, marks, undefined)
  await markReportSent($, r.id)
  await patchReview($, {
    feedback: { text, image: r.screenshot ?? undefined, at: Date.now() },
    notice: 'An Claude geschickt.',
  })
  return text
}

/** The error text of lib/play.ts playError for code `outdated`. */
const OUTDATED = /Update com\.denny99\.claude-bridge/

/** The report card (above the viewer that shows the picture to paint on). */
export async function reportCard(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  k: Kit,
  options: Options,
  s: ReviewUiState,
): Promise<RenderElement> {
  const r = s.report!
  const Input = ($.ui.resolve(e) as unknown as Record<string, El | undefined>).Input
  if (r.error)
    return ProblemCard(k, {
      key: 'rv-report-err',
      title: 'Kein Screenshot',
      cause: r.error,
      tone: 'warn',
      // An old bridge cannot capture: trying again changes nothing, updating it does.
      action: OUTDATED.test(r.error)
        ? bridgeUpdateAction($, options)
        : {
            key: 'rv-report-retry',
            label: 'Nochmal versuchen',
            icon: 'camera',
            onPress: () => void openReport($, options),
          },
      more: [
        { key: 'rv-report-cancel', label: 'Abbrechen', onPress: () => void patchReview($, { report: undefined }) },
      ],
    })
  const kinds: Action[] = REPORT_KINDS.map(x => ({
    key: `rv-kind-${x.id.replace(/\W+/g, '-').toLowerCase()}`,
    label: x.id,
    icon: r.kind === x.id ? 'check' : x.icon,
    variant: 'secondary',
    onPress: () => void (async () => {
      await flushNote($)
      await patchReport($, () => ({ kind: x.id }))
    })(),
  }))
  const forced = r.kind === 'Ruckelt'
  return Card(k, {
    key: 'rv-report',
    children: [
      CardTitle(k, {
        icon: 'flag',
        title: 'Problem melden',
        pill: r.busy ? { text: r.busy, tone: 'warn', glyph: '◷' } : undefined,
      }),
      r.facts.length ? Sentence(k, r.facts.join(' · '), { faint: true }) : null,
      Sentence(k, 'Was ist es?'),
      Actions(k, 'rv-kinds', kinds, 5),
      Input
        ? Input({
            key: 'rv-report-note',
            placeholder: 'Notiz',
            // the draft while typing (a redraw between two flushes keeps what was typed)
            value: noteDraft && noteDraft.report === (r.stamp ?? '') ? noteDraft.text : r.note,
            submitLabel: 'Notiz',
            onInput: (t: string) => typeNote($, r.stamp ?? '', t),
            onSubmit: (t: string) => {
              noteDraft = { report: r.stamp ?? '', text: t, seq: (noteDraft?.seq ?? 0) + 1 }
              void flushNote($)
            },
          })
        : null,
      // Two short sentences that wrap, not one long line (live it was cut: "Danach wird der Ber…").
      r.busy ? Sentence(k, r.busy, { faint: true, wrap: 'wrap' }) : null,
      r.busy
        ? Sentence(
            k,
            r.pending
              ? `Danach wird der Bericht ${r.pending === 'keep' ? 'gemerkt' : 'an Claude geschickt'}.`
              : 'Art und Notiz kannst du schon eintragen.',
            { faint: true, wrap: 'wrap' },
          )
        : null,
      r.busy
        ? null
        : Actions(
            k,
            'rv-measure',
            [
              {
                key: 'rv-measure-toggle',
                label: `${MEASURE_SECONDS} s Leistung mitmessen${forced ? ' (bei „Ruckelt“ immer)' : ''}`,
                icon: r.measure || forced ? 'check' : 'gauge',
                variant: 'secondary',
                onPress: () => void patchReport($, x => ({ measure: !x.measure })),
              },
            ],
            1,
          ),
      r.busy
        ? null
        : Actions(
            k,
            'rv-report-acts',
            [
              {
                key: 'rv-report-send',
                label: 'An Claude schicken',
                icon: 'claude',
                variant: 'primary',
                onPress: () => void finishReport($, options, true),
              },
              {
                key: 'rv-report-keep',
                label: 'Nur merken',
                icon: 'bookmark',
                variant: 'secondary',
                onPress: () => void finishReport($, options, false),
              },
              {
                key: 'rv-report-drop',
                label: 'Verwerfen',
                variant: 'link',
                onPress: () => void patchReview($, { report: undefined, view: undefined }),
              },
            ],
            3,
          ),
    ],
  })
}
