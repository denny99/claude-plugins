/** Tab Tests (board Unity-Tests): area / filter, start EditMode / PlayMode / affected, last run with red first. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel } from '../../types'
import { batchAllowed, countResults, rankResults, testErrorLine, unmatchedParts } from '../../lib/unity'
import { Card, ListRow, LogBox, Sentence, type Action, type Kit, type PillProps } from '../../lib/ui'
import { affectedTests, batchTarget, landingsLine, patchModel, runTests, type Options } from '../state'
import {
  FIX_ASK,
  ago,
  dec,
  exactFilter,
  fixAction,
  run,
  runLength,
  runSeconds,
  stopTestsAction,
  testsProgress,
  type Extra,
} from './common'

export function testsTab(
  $: EngineInterface,
  k: Kit,
  x: Extra,
  m: UnityModel,
  options: Options,
  now: number,
): RenderElement {
  const { Box } = k
  return (
    <Box flexDirection="column" gap={1}>
      {startCard($, k, x, m, options)}
      {affectedCard(k, m, now)}
      {resultCard($, k, m, options, now)}
    </Box>
  )
}

function startCard($: EngineInterface, k: Kit, x: Extra, m: UnityModel, options: Options): RenderElement {
  const { Input, Select } = x
  const preset = m.testArea ? m.presets.find(p => p.name === m.testArea) : undefined
  const filter = preset?.filter || m.filterInput.trim() || undefined
  // Nothing is preselected: a filter, an area or "Alle Tests" chosen on purpose (that one asks once more).
  const all = !filter && m.testScope === 'all'
  const chosen = !!filter || all
  // The start buttons always stand (R4): with nothing chosen a press only says what is missing.
  const start = (mode: 'EditMode' | 'PlayMode'): (() => void) =>
    chosen
      ? run($, `${mode} tests`, () => runTests($, options, mode, filter, 0))
      : () => void $.ui.toast(NOTHING_CHOSEN)
  const target = batchTarget(m)
  const canRun = m.bridge.up || batchAllowed({ lock: target.lock, bridgeUp: false }).ok
  const reminder = landingsLine(m)
  const lastAll = (mode: 'EditMode' | 'PlayMode'): string => {
    const t = m.tests
    const n = t && !t.filter && t.mode === mode && t.state !== 'running' ? t.results.length : 0
    return n ? `${n} Tests` : 'die ganze Suite'
  }
  const askAll = (mode: 'EditMode' | 'PlayMode'): string =>
    m.bridge.up
      ? `Alle ${mode}-Tests (${lastAll(mode)})? Der Editor ist bis zum Ende blockiert.`
      : `Alle ${mode}-Tests (${lastAll(mode)}) im Hintergrund? Kann lange dauern.`
  // Two starts of the same rank look the same (R1): both secondary, the card has no main action.
  const acts: Action[] = canRun
    ? [
        {
          key: 'edit-tests',
          label: 'EditMode',
          icon: 'play',
          variant: 'secondary',
          ...(all ? { confirm: askAll('EditMode') } : {}),
          onPress: start('EditMode'),
        },
        {
          key: 'play-tests',
          label: 'PlayMode',
          icon: 'play',
          variant: 'secondary',
          ...(all ? { confirm: askAll('PlayMode') } : {}),
          onPress: start('PlayMode'),
        },
        {
          key: 'affected-tests',
          label: 'Betroffene prüfen',
          icon: 'diff',
          variant: 'secondary',
          onPress: run($, 'affected tests', () => affectedTests($, options, { run: true, waitMs: 0 })),
        },
      ]
    : []
  return Card(k, {
    key: 'tests-start',
    title: { icon: 'flask', title: 'Tests starten' },
    children: [
      reminder ? Sentence(k, reminder, { tone: 'warn' }) : null,
      <Select
        key="preset"
        label="Bereich"
        value={preset?.name ?? (all ? ALL : '')}
        options={[
          { value: '', label: '–' },
          ...m.presets.map(p => ({ value: p.name, label: p.name })),
          { value: ALL, label: 'Alle Tests' },
        ]}
        onSelect={(v: string) =>
          void patchModel($, {
            testArea: m.presets.some(p => p.name === v) ? v : undefined,
            // an area replaces typed text: the run uses one or the other, never the area's raw filter in the field
            ...(m.presets.some(p => p.name === v) ? { filterInput: '' } : {}),
            testScope: v === ALL ? 'all' : undefined,
          })
        }
      />,
      <Input
        key="filter"
        label="Testname enthält"
        placeholder="z. B. Mahlen"
        value={m.filterInput}
        onSubmit={(v: string) => void patchModel($, { filterInput: v, testScope: undefined, testArea: undefined })}
      />,
    ],
    hint: preset?.note,
    status: !canRun
      ? { text: 'Braucht den verbundenen Editor oder ein Projekt ohne offenen Editor', tone: 'warn' }
      : !chosen
        ? NOTHING_CHOSEN
        : m.bridge.up
          ? 'Läuft im offenen Editor und blockiert ihn bis zum Ende'
          : 'Läuft im Hintergrund ohne Editor-Fenster',
    actions: acts,
    keepOrder: true,
  })
}

const ALL = '*all*'

/** What the start card says (status line, and a press on a start button) while neither area nor filter is set. */
export const NOTHING_CHOSEN = 'Noch kein Bereich und kein Filter gewählt'

/** The last "Betroffene" check as a block of its own: which areas, or the check's own sentence. */
function affectedCard(k: Kit, m: UnityModel, now: number): RenderElement | null {
  const a = m.affected
  if (!a) return null
  const lines = a.text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  return Card(k, {
    key: 'tests-affected',
    title: {
      icon: 'diff',
      title: 'Betroffene Tests',
      pill: a.areas.length
        ? { text: `${a.areas.length} ${a.areas.length === 1 ? 'Bereich' : 'Bereiche'}`, tone: 'info', glyph: false }
        : { text: 'nichts betroffen', tone: 'ok', glyph: false },
    },
    children: [
      a.areas.length ? Sentence(k, a.areas.join(', ')) : Sentence(k, lines[0] ?? '', { faint: true }),
      Sentence(k, `Geprüft ${ago(now, a.at)}`, { faint: true }),
    ],
  })
}

/** "Bereich <name>" when the run's filter is an area's, else "Filter <filter>". */
export function filterLine(m: Pick<UnityModel, 'presets'>, filter: string): string {
  const area = m.presets.find(p => p.filter === filter)
  return area ? `Bereich ${area.name}` : `Filter ${filter}`
}

/** A finished filtered run: filter parts that hit no test at all (the area misses them, green or not). */
function missedLine(k: Kit, t: NonNullable<UnityModel['tests']>): RenderElement[] {
  if (t.state !== 'done' || !t.filter || !t.results.length) return []
  const missed = unmatchedParts(t.filter, t.results.map(r => r.fullName))
  if (!missed.length) return []
  return [
    Sentence(
      k,
      `Bereich trifft ${missed.join(', ')} nicht: kein Test in diesem ${t.mode ?? ''}-Lauf passt dazu. Filter in .claude/unity.json prüfen.`,
      { tone: 'warn' },
    ),
  ]
}

function resultCard($: EngineInterface, k: Kit, m: UnityModel, options: Options, now: number): RenderElement | null {
  const t = m.tests
  if (!t) return null
  const c = countResults(t.results)
  const ranked = rankResults(t.results, m.previous).filter(r => r.status === 'Failed')
  // "neu" needs a run to compare with: without one every red test would be "neu".
  const compared = Object.keys(m.previous).length > 0
  const fresh = compared ? ranked.filter(r => r.newlyRed) : []
  const still = compared ? ranked.filter(r => !r.newlyRed) : ranked
  const skipped = t.results.filter(r => r.status === 'Skipped' || r.status === 'Inconclusive')
  const done = t.state !== 'running' && t.state !== 'error'
  const running = t.state === 'running'
  const total = c.passed + c.failed + c.skipped
  const secs = runSeconds(t)
  const pill: PillProps = running
    ? { text: 'läuft', tone: 'warn', glyph: '◷' }
    : t.state === 'error'
      ? { text: 'Fehler', tone: 'bad' }
      : c.failed
        ? { text: `${c.failed} rot${fresh.length ? ` · ${fresh.length} neu` : ''}`, tone: 'bad' }
        : { text: 'grün', tone: 'ok' }
  // The run as one sentence under the title (the title is a name, R2).
  const meta = [
    t.filter ? filterLine(m, t.filter) : undefined,
    ...(done
      ? [
          t.finishedAt ? ago(now, t.finishedAt) : undefined,
          `${c.passed} von ${total} grün`,
          secs !== undefined ? runLength(secs) : undefined,
        ]
      : []),
  ]
    .filter(Boolean)
    .join(' · ')
  const progress = running ? testsProgress(t, now) : ''
  const row = (r: (typeof ranked)[number], i: number, group: string): RenderElement =>
    ListRow(k, {
      key: `tf-${group}-${i}`,
      status: 'failed',
      // as in the overview: class and test; the full name and the assertion stand behind „Details“
      title: r.fullName.split('.').slice(-2).join('.'),
      meta: r.duration !== undefined ? `${dec(r.duration)} s` : undefined,
      details: () => [
        LogBox(k, {
          key: `tf-${group}-${i}-log`,
          lines: [r.fullName, ...(r.message ? r.message.split('\n') : []), ...(r.stack ? r.stack.split('\n') : [])],
        }),
      ],
      actions: [
        fixAction(
          $,
          k,
          group === 'new' ? `tfix-${i}` : `tfix-old-${i}`,
          FIX_ASK.test,
          `${r.fullName}\n${r.message ?? ''}\n${r.stack ?? ''}`,
        ),
      ],
    })
  const acts: Action[] = []
  if (running) acts.push(stopTestsAction($, options))
  if (done && ranked.length)
    acts.push({
      key: 'tests-rerun-red',
      label: 'Rote erneut ausführen',
      icon: 'rerun',
      variant: 'secondary',
      onPress: run($, 'rerun red', () =>
        runTests($, options, t.mode ?? 'EditMode', exactFilter(ranked.map(r => r.fullName)), 0),
      ),
    })
  return Card(k, {
    key: 'tests-result',
    tone: t.state === 'error' ? 'bad' : undefined,
    title: {
      icon: running ? 'clock' : c.failed || t.state === 'error' ? 'xCircle' : 'checkCircle',
      title: running ? 'Lauf' : 'Letzter Lauf',
      pill,
      tone: running ? 'warn' : c.failed || t.state === 'error' ? 'bad' : 'ok',
    },
    children: [
      meta ? Sentence(k, meta, { faint: true }) : null,
      t.state === 'error' ? Sentence(k, testErrorLine(t), { tone: 'bad' }) : null,
      running && t.current?.trim() ? Sentence(k, `Gerade: ${t.current.trim()}`, { faint: true }) : null,
      ...missedLine(k, t),
      fresh.length ? Sentence(k, `Neu rot gegenüber dem Lauf davor · ${fresh.length}`, { tone: 'bad' }) : null,
      ...fresh.slice(0, 8).map((r, i) => row(r, i, 'new')),
      still.length
        ? Sentence(k, compared ? `Weiterhin rot · ${still.length}` : `Rot · ${still.length}`, {
            tone: compared ? undefined : 'bad',
            faint: compared,
          })
        : null,
      ...still.slice(0, 8).map((r, i) => row(r, i, 'old')),
      done && skipped.length
        ? ListRow(k, {
            key: 'tests-skipped',
            status: 'idle',
            title: `${skipped.length} übersprungen`,
            details: () =>
              skipped.slice(0, 20).map((r, i) =>
                ListRow(k, {
                  key: `tskip-${i}`,
                  status: 'idle',
                  title: r.fullName.split('.').slice(-2).join('.'),
                  meta: r.message?.split('\n')[0],
                }),
              ),
          })
        : null,
    ],
    hint:
      ranked.length && !compared && done
        ? 'Kein Vergleichslauf in dieser Sitzung: „neu rot“ zeigt sich ab dem nächsten Lauf.'
        : undefined,
    status: running
      ? {
          text: `${t.mode ?? ''} läuft${progress ? ` · ${progress}` : ''}`,
          running: true,
        }
      : undefined,
    actions: acts,
  })
}
