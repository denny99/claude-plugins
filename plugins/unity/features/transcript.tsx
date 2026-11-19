/**
 * Cards in the transcript: the result of `unity_run_tests` / `unity_test_results` drawn as a card at the tool's own
 * result row (ToolResult). The pane keeps the lasting state (editor, last run, starts); the card answers the call.
 *
 * The tool.call hook records which run a call answered (per `tool_use_id`); the render reads that record and, while
 * the model still holds the same run, the live model (a run that was still going when the call returned fills in).
 * A render never writes state.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { countResults, testErrorLine, type TestRun } from '../lib/unity'
import { Card, kit, ListRow, Sentence, type Action, type Kit, type PillProps } from '../lib/ui'
import { patchModel, readModel, type Options } from './state'
import { openPane } from './pane'
import { dec } from './pane/common'

/** The tools whose result is drawn as a card. */
export const CARD_TOOLS = /^mcp__unity__unity_(run_tests|test_results)$/

/** What one call answered: enough to draw the card after the model moved on to a later run. */
export type TestsCardRecord = {
  runId: string
  mode?: 'EditMode' | 'PlayMode'
  filter?: string
  state: TestRun['state']
  passed: number
  failed: number
  skipped: number
  error?: string
  /** The red tests of the run (carried ones left out), at most `MAX_FAILED`. */
  red: { fullName: string; message?: string; duration?: number }[]
}

type CardsState = { tests: Record<string, TestsCardRecord>; order: string[] }

const EMPTY_CARDS: CardsState = { tests: {}, order: [] }
const cardsAtom = atom({ plugin: 'unity', key: 'cards' } as const, EMPTY_CARDS, { shape: 'unity-cards-1' })

const MAX_RECORDS = 30
const MAX_FAILED = 8

/** The record of a run (only this run's own results: tests carried over from an earlier run are not its own). */
export function recordOf(run: TestRun): TestsCardRecord | undefined {
  if (!run.runId) return undefined
  const own = run.results.filter(r => !r.carried)
  const c = countResults(own)
  return {
    runId: run.runId,
    ...(run.mode ? { mode: run.mode } : {}),
    ...(run.filter ? { filter: run.filter } : {}),
    state: run.state,
    passed: c.passed,
    failed: c.failed,
    skipped: c.skipped,
    ...(run.error ? { error: run.error } : {}),
    red: own
      .filter(r => r.status === 'Failed')
      .slice(0, MAX_FAILED)
      .map(r => ({
        fullName: r.fullName,
        ...(r.message ? { message: r.message.split('\n')[0] } : {}),
        ...(r.duration !== undefined ? { duration: r.duration } : {}),
      })),
  }
}

/** After the tool ran: notes which run this call answered (no run, no card: the plain result stays). */
export async function recordTestsCall(
  $: EngineInterface,
  toolUseId: string | undefined,
  opts: { notRun?: string } = {},
): Promise<void> {
  if (!toolUseId) return
  const m = await readModel($)
  const rec = m.tests ? recordOf(m.tests as TestRun) : undefined
  // `notRun`: the run that was there before the call; still the same run means the call started none
  if (!rec || (opts.notRun !== undefined && rec.runId === opts.notRun)) return
  await update($, cardsAtom, s => {
    const order = [...s.order.filter(id => id !== toolUseId), toolUseId].slice(-MAX_RECORDS)
    const tests: Record<string, TestsCardRecord> = {}
    for (const id of order) {
      const r = id === toolUseId ? rec : s.tests[id]
      if (r) tests[id] = r
    }
    return { tests, order }
  })
}

/** Draws the card at the tool's result row; anything it does not know (no record, an error, ctrl+o) stays as it was. */
export async function renderTestsResult(
  $: EngineInterface,
  e: RenderInput<'ToolResult'>,
  next: (e: RenderInput<'ToolResult'>) => Promise<RenderElement>,
  options: Options,
): Promise<RenderElement> {
  const props = e.props
  if (props.isErrored || props.isExpanded) return next(e)
  const id = props.tool_use_id || e.requestId
  const saved = (await read($, cardsAtom)).tests[id]
  if (!saved) return next(e)
  const m = await readModel($)
  // the same run still in the model: its live state (a run that was running when the call returned is done now)
  const live = m.tests && m.tests.runId === saved.runId ? recordOf(m.tests as TestRun) : undefined
  const k = await kit($, e as never, { lang: 'de' })
  return testsCard($, k, live ?? saved, id, options)
}

/** The card (exported for tests): count as pill, the red tests as rows, one main action into the pane's Tests tab. */
export function testsCard($: EngineInterface, k: Kit, r: TestsCardRecord, id: string, options: Options): RenderElement {
  const tag = id.slice(-8)
  const running = r.state === 'running'
  const total = r.passed + r.failed + r.skipped
  const pill: PillProps = running
    ? { text: 'läuft', tone: 'warn', glyph: '◷' }
    : r.state === 'error'
      ? { text: 'Fehler', tone: 'bad' }
      : r.failed
        ? { text: `${r.failed} rot`, tone: 'bad' }
        : { text: 'grün', tone: 'ok' }
  const meta = [
    r.mode,
    r.filter ? `Filter ${r.filter.length > 40 ? `${r.filter.slice(0, 39)}…` : r.filter}` : undefined,
    running ? undefined : `${r.passed} von ${total} grün`,
    !running && r.skipped ? `${r.skipped} übersprungen` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
  const acts: Action[] =
    r.failed || r.state === 'error' || running
      ? [
          {
            key: `tcard-open-${tag}`,
            label: running ? 'Im Panel verfolgen' : 'Fehler ansehen',
            icon: 'flask',
            variant: 'primary',
            onPress: () =>
              void (async () => {
                await patchModel($, { tab: 'tests' })
                await openPane($, options)
              })(),
          },
        ]
      : []
  return Card(k, {
    key: `tcard-${tag}`,
    tone: r.state === 'error' ? 'bad' : undefined,
    title: {
      icon: running ? 'clock' : r.failed || r.state === 'error' ? 'xCircle' : 'checkCircle',
      title: 'Testlauf',
      pill,
      tone: running ? 'warn' : r.failed || r.state === 'error' ? 'bad' : 'ok',
    },
    children: [
      meta ? Sentence(k, meta, { faint: true }) : null,
      r.state === 'error' ? Sentence(k, testErrorLine(r), { tone: 'bad' }) : null,
      ...r.red.map((t, i) =>
        ListRow(k, {
          key: `tcard-${tag}-red-${i}`,
          status: 'failed',
          title: t.fullName.split('.').slice(-2).join('.'),
          meta: [t.message, t.duration !== undefined ? `${dec(t.duration)} s` : undefined].filter(Boolean).join(' · '),
        }),
      ),
      r.failed > r.red.length ? Sentence(k, `und ${r.failed - r.red.length} weitere`, { faint: true }) : null,
    ],
    status: running ? { text: `${r.mode ?? ''} läuft`, running: true } : undefined,
    actions: acts,
  })
}

