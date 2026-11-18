/** Tab Tests (board Unity-Tests): area / filter, start EditMode / PlayMode / affected, last run with red first. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel } from '../../types'
import { batchAllowed, countResults, rankResults, testErrorLine, unmatchedParts } from '../../lib/unity'
import { ActionButton, Actions, Card, CardTitle, ListRow, Sentence, type Action, type Kit } from '../../lib/ui'
import { affectedTests, batchTarget, landingsLine, patchModel, runTests, type Options } from '../state'
import {
  FIX_ASK,
  ago,
  dec,
  exactFilter,
  fixWithClaude,
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
  const start = (mode: 'EditMode' | 'PlayMode'): (() => void) =>
    run($, `${mode} tests`, () => runTests($, options, mode, filter, 0))
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
  const startActs: Action[] = chosen
    ? [
        {
          key: 'edit-tests',
          label: 'EditMode',
          icon: 'play',
          variant: 'primary',
          primary: true,
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
      ]
    : []
  const acts: Action[] = canRun
    ? [
        ...startActs,
        {
          key: 'affected-tests',
          label: 'Betroffene',
          icon: 'diff',
          variant: 'secondary',
          onPress: run($, 'affected tests', () => affectedTests($, options, { run: true, waitMs: 0 })),
        },
      ]
    : []
  return Card(k, {
    key: 'tests-start',
    children: [
      CardTitle(k, { icon: 'flask', title: 'Tests starten' }),
      reminder ? Sentence(k, reminder, { tone: 'warn' }) : null,
      <Select
        key="preset"
        label="Bereich"
        value={preset?.name ?? (all ? ALL : '')}
        options={[
          { value: '', label: 'Bereich wählen …' },
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
        placeholder="Testname, z. B. Mahlen"
        value={m.filterInput}
        onSubmit={(v: string) => void patchModel($, { filterInput: v, testScope: undefined, testArea: undefined })}
      />,
      preset?.note ? Sentence(k, preset.note, { faint: true }) : null,
      canRun
        ? Sentence(
            k,
            !chosen
              ? 'Erst einen Bereich wählen oder einen Filter eingeben — dann lassen sich die Tests starten.'
              : m.bridge.up
                ? 'Läuft im offenen Editor und blockiert ihn bis zum Ende.'
                : 'Läuft im Hintergrund ohne Editor-Fenster.',
            { faint: true },
          )
        : Sentence(k, 'Tests brauchen die Verbindung zum Unity-Editor oder ein Projekt, das kein Editor offen hat.', {
            tone: 'warn',
          }),
      acts.length ? Actions(k, 'tests-start-acts', acts, 3) : null,
    ],
  })
}

const ALL = '*all*'

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
    children: [
      CardTitle(k, {
        icon: 'diff',
        title: `Betroffene Tests · geprüft ${ago(now, a.at)}`,
        pill: a.areas.length
          ? { text: `${a.areas.length} ${a.areas.length === 1 ? 'Bereich' : 'Bereiche'}`, tone: 'info', glyph: false }
          : { text: 'nichts betroffen', tone: 'ok', glyph: false },
      }),
      a.areas.length ? Sentence(k, a.areas.join(', ')) : Sentence(k, lines[0] ?? '', { faint: true }),
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
  const skippedOpen = k.isMore('tests-skipped')
  const done = t.state !== 'running' && t.state !== 'error'
  const total = c.passed + c.failed + c.skipped
  const secs = runSeconds(t)
  const head =
    t.state === 'running'
      ? `${t.mode ?? ''} läuft${testsProgress(t, now) ? ` · ${testsProgress(t, now)}` : ' …'}`
      : t.state === 'error'
        ? testErrorLine(t)
        : `Letzter Lauf${t.finishedAt ? ` ${ago(now, t.finishedAt)}` : ''} · ${total} Tests${secs !== undefined ? ` · ${runLength(secs)}` : ''}`
  const row = (r: (typeof ranked)[number], i: number, group: string): RenderElement =>
    ListRow(k, {
      key: `tf-${group}-${i}`,
      status: 'failed',
      title: r.fullName,
      meta: r.duration !== undefined ? `${dec(r.duration)} s` : undefined,
      actions: [
        {
          key: group === 'new' ? `tfix-${i}` : `tfix-old-${i}`,
          label: 'Claude reparieren lassen',
          icon: 'claude',
          variant: 'secondary',
          onPress: () => void fixWithClaude($, FIX_ASK.test, `${r.fullName}\n${r.message ?? ''}\n${r.stack ?? ''}`),
        },
      ],
    })
  const msgLine = (r: (typeof ranked)[number]): RenderElement | null =>
    r.message ? Sentence(k, r.message.split('\n')[0] ?? '', { faint: true }) : null
  return Card(k, {
    key: 'tests-result',
    tone: t.state === 'error' ? 'bad' : undefined,
    children: [
      CardTitle(k, {
        icon: t.state === 'running' ? 'clock' : c.failed || t.state === 'error' ? 'xCircle' : 'checkCircle',
        title: head,
        tone: t.state === 'running' ? 'warn' : c.failed || t.state === 'error' ? 'bad' : 'ok',
      }),
      t.filter ? Sentence(k, filterLine(m, t.filter), { faint: true }) : null,
      ...missedLine(k, t),
      t.state === 'running' && t.current?.trim() ? Sentence(k, `Gerade: ${t.current.trim()}`, { faint: true }) : null,
      t.state === 'running' ? Actions(k, 'tests-running-acts', [stopTestsAction($, options)]) : null,
      fresh.length ? Sentence(k, `Neu rot gegenüber dem Lauf davor · ${fresh.length}`, { tone: 'bad' }) : null,
      ...fresh.slice(0, 8).flatMap((r, i) => [row(r, i, 'new'), msgLine(r)]),
      still.length
        ? Sentence(k, compared ? `Weiterhin rot · ${still.length}` : `Rot · ${still.length}`, {
            tone: compared ? undefined : 'bad',
            faint: compared,
          })
        : null,
      ...still.slice(0, 8).flatMap((r, i) => (compared ? [row(r, i, 'old')] : [row(r, i, 'old'), msgLine(r)])),
      ranked.length && !compared && done
        ? Sentence(k, 'Kein Vergleichslauf in dieser Sitzung — „neu rot“ zeigt sich ab dem nächsten Lauf.', {
            faint: true,
          })
        : null,
      done ? Sentence(k, `${c.passed} grün`, { tone: 'ok' }) : null,
      done && skipped.length
        ? ActionButton(k, {
            key: 'tests-skipped',
            label: `${skipped.length} übersprungen ${skippedOpen ? '▴' : '▾'}`,
            variant: 'link',
            onPress: () => k.toggleMore('tests-skipped'),
          })
        : null,
      ...(done && skippedOpen
        ? skipped
            .slice(0, 20)
            .map((r, i) =>
              ListRow(k, { key: `tskip-${i}`, status: 'idle', title: r.fullName, meta: r.message?.split('\n')[0] }),
            )
        : []),
      done && ranked.length
        ? Actions(k, 'tests-result-acts', [
            {
              key: 'tests-rerun-red',
              label: 'Rote erneut ausführen',
              icon: 'rerun',
              variant: 'secondary',
              onPress: run($, 'rerun red', () =>
                runTests($, options, t.mode ?? 'EditMode', exactFilter(ranked.map(r => r.fullName)), 0),
              ),
            },
          ])
        : null,
    ],
  })
}
