/** Tab Tests (board Unity-Tests): area / filter, start EditMode / PlayMode / affected, last run with red first. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel } from '../../types'
import { batchAllowed, countResults, rankResults, testErrorLine } from '../../lib/unity'
import { Actions, Card, CardTitle, ListRow, Sentence, type Action, type Kit } from '../../lib/ui'
import { affectedTests, batchTarget, landingsLine, patchModel, runTests, type Options } from '../state'
import { FIX_ASK, ago, dec, fixWithClaude, run, stopTestsAction, testsProgress, type Extra } from './common'

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
      {resultCard($, k, m, options, now)}
    </Box>
  )
}

function startCard($: EngineInterface, k: Kit, x: Extra, m: UnityModel, options: Options): RenderElement {
  const { Input, Select } = x
  const filter = m.filterInput.trim() || undefined
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
  const preset = m.presets.find(p => p.filter === m.filterInput)
  return Card(k, {
    key: 'tests-start',
    children: [
      CardTitle(k, { icon: 'flask', title: 'Tests starten' }),
      reminder ? Sentence(k, reminder, { tone: 'warn' }) : null,
      m.affected
        ? Sentence(
            k,
            `Betroffen: ${m.affected.areas.length ? m.affected.areas.join(', ') : (m.affected.text.split('\n')[0] ?? '')}`,
            { faint: true },
          )
        : null,
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
            filterInput: m.presets.find(p => p.name === v)?.filter ?? '',
            testScope: v === ALL ? 'all' : undefined,
          })
        }
      />,
      <Input
        key="filter"
        label="Testname enthält"
        placeholder="Testname, z. B. Mahlen"
        value={m.filterInput}
        onSubmit={(v: string) => void patchModel($, { filterInput: v, testScope: undefined })}
      />,
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

function resultCard($: EngineInterface, k: Kit, m: UnityModel, options: Options, now: number): RenderElement | null {
  const t = m.tests
  if (!t) return null
  const c = countResults(t.results)
  const ranked = rankResults(t.results, m.previous).filter(r => r.status === 'Failed')
  const fresh = ranked.filter(r => r.newlyRed)
  const still = ranked.filter(r => !r.newlyRed)
  const total = c.passed + c.failed + c.skipped
  const secs = t.results.reduce((s, r) => s + (r.duration ?? 0), 0)
  const head =
    t.state === 'running'
      ? `${t.mode ?? ''} läuft${testsProgress(t, now) ? ` · ${testsProgress(t, now)}` : ' …'}`
      : t.state === 'error'
        ? testErrorLine(t)
        : `Letzter Lauf${t.finishedAt ? ` ${ago(now, t.finishedAt)}` : ''} · ${total} Tests${secs ? ` · ${dec(secs, 0)} s` : ''}`
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
      t.filter ? Sentence(k, `Filter ${t.filter}`, { faint: true }) : null,
      t.state === 'running' && t.current ? Sentence(k, `Gerade: ${t.current}`, { faint: true }) : null,
      t.state === 'running' ? Actions(k, 'tests-running-acts', [stopTestsAction($, options)]) : null,
      fresh.length ? Sentence(k, `Neu rot · ${fresh.length}`, { tone: 'bad' }) : null,
      ...fresh.slice(0, 8).flatMap((r, i) => [row(r, i, 'new'), msgLine(r)]),
      still.length ? Sentence(k, `Weiterhin rot · ${still.length}`, { faint: true }) : null,
      ...still.slice(0, 8).map((r, i) => row(r, i, 'old')),
      t.state !== 'running' && t.state !== 'error' ? Sentence(k, `${c.passed} grün`, { tone: 'ok' }) : null,
    ],
  })
}
