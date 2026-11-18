/**
 * "Problem melden": the header button captures the running game through the bridge (picture + spot), the Review tab
 * then shows the picture to paint on, the kind, a note and an optional 10 s performance sample. "An Claude schicken"
 * hands it to Claude (text + feedback tool for the picture); "Nur merken" keeps it in the review list.
 */
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { ReviewReportState, ReviewUiState } from '../../types'
import { Actions, Card, CardTitle, ProblemCard, Sentence, type Action, type Kit } from '../../lib/ui'
import type { IconName } from '../../lib/icons'
import { join } from '../../lib/path'
import * as play from '../../lib/play'
import { perfRecord, type Options } from '../state'
import { spotFacts, spotText, type Report } from './data'
import {
  appendReport,
  captureTo,
  markReportSent,
  nowStamp,
  patchReview,
  readReview,
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

/** Header button: capture now (full picture for Claude + a small one the pane can draw), open the report card. */
export async function openReport($: EngineInterface, options: Options): Promise<void> {
  const { root, cfg } = await reviewRoot($)
  const dir = reportsDir(root, cfg)
  const t = await nowStamp($)
  const full = join(dir, `report-${t.file}.png`)
  const small = join(dir, `report-${t.file}-klein.png`)
  await patchReview($, { report: { facts: [], note: '', measure: false, busy: 'Screenshot …' }, notice: undefined })
  const shot = await captureTo($, options, full)
  if (play.isPlayError(shot)) {
    await patchReview($, { report: { facts: [], note: '', measure: false, error: shot.error }, view: undefined })
    return
  }
  const preview = await captureTo($, options, small, { width: 384, height: 216 })
  const shown = play.isPlayError(preview) ? full : small
  const report: ReviewReportState = {
    shot: full,
    preview: shown,
    spot: shot.spot ?? null,
    spotLine: spotText(shot.spot),
    facts: spotFacts(shot.spot),
    note: '',
    measure: false,
  }
  await patchReview($, {
    report,
    view: newView('report', `report-${t.file}`, 'Screenshot von eben', undefined, [
      { label: 'Screenshot', frames: [shown] },
    ]),
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
  const s = await readReview($)
  const r = s.report
  if (!r) return
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
    ...(v?.marks.length ? { marks: v.marks } : {}),
    ...(perf ? { perf } : {}),
    time: (await nowStamp($)).iso,
    sent: send,
  }
  await appendReport($, report)
  const text = reportText(report, marks, saved.svg)
  await patchReview($, {
    report: undefined,
    view: undefined,
    ...(send ? { feedback: { text, image: r.shot, svg: saved.svg, at: Date.now() } } : {}),
    notice: send ? 'An Claude geschickt.' : 'Gemerkt: steht unter Anschauen.',
  })
  if (send) await $.prompt.submit({ text })
}

/** A kept report sent later from the list. */
export async function sendStoredReport($: EngineInterface, _options: Options, r: Report): Promise<void> {
  const marks = Array.isArray(r.marks) ? describeMarks(r.marks as never) : []
  const text = reportText(r, marks, undefined)
  await markReportSent($, r.id)
  await patchReview($, {
    feedback: { text, image: r.screenshot ?? undefined, at: Date.now() },
    notice: 'An Claude geschickt.',
  })
  await $.prompt.submit({ text })
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
    onPress: () => void patchReport($, () => ({ kind: x.id })),
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
            value: r.note,
            submitLabel: 'Notiz',
            onInput: (t: string) => void patchReport($, () => ({ note: t })),
            onSubmit: (t: string) => void patchReport($, () => ({ note: t })),
          })
        : null,
      r.busy
        ? Sentence(
            k,
            `${r.busy} Danach wird der Bericht ${r.pending === 'keep' ? 'gemerkt' : 'an Claude geschickt'}.`,
            { faint: true },
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
