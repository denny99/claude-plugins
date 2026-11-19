// Design rules (R1–R3, R6) on the tabs Übersicht, Tests and Leistung in their main states, plus what the rework
// changed on purpose (measuring left the overview, tasks are rows, a missing spot needs no sentence).
import { expect } from 'claude-code/testing'
import { test } from './limits'

import { kitRuleLines } from './kit-rules'
import { findShown } from './shown'
import { BRIDGE, fakeWorld, PANE, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const

type Ui = {
  drawn: () => Promise<unknown>
  findAll: (q: { type: string }) => Promise<{ props: { key?: string; label?: string; variant?: string } }[]>
}
const rules = async (ui: Ui): Promise<string[]> => kitRuleLines(await ui.drawn())
const buttons = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).map(b => b.props)

const RED = {
  runId: 'r1',
  state: 'done',
  mode: 'EditMode',
  results: [
    { fullName: 'Game.Tests.Core.Adds', name: 'Adds', status: 'Passed' },
    {
      fullName: 'Game.Tests.Core.Mill.Grinds',
      name: 'Grinds',
      status: 'Failed',
      message: 'Expected: 3\n  But was: 2',
      stack: 'at Game.Tests.Core.Mill.Grinds () in Assets/Tests/Mill.cs:12',
    },
    { fullName: 'Game.Tests.Core.Later', name: 'Later', status: 'Skipped', message: 'Ignored: kommt noch' },
  ],
}

test('Übersicht: edit mode with compile errors, red tests and project tasks; then Play mode', async ($, on) => {
  const world = fakeWorld(on, {
    config: {
      customJobs: [
        { name: 'smoke', command: 'node tools/unity.mjs smoke' },
        { name: 'scene', command: 'node tools/unity.mjs scene' },
      ],
    },
  })
  world.files[`${BRIDGE}/tests.json`] = JSON.stringify(RED)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect(await rules(ui as never)).toEqual([])
  let b = await buttons(ui as never)
  // editor card: one primary „Starten“, the screenshot names where it goes, measuring lives in the Leistung tab
  expect(b.find(x => x.key === 'play')).toMatchObject({ label: '▶︎ Starten', variant: 'primary' })
  expect(b.find(x => x.key === 'shot')?.label).toBe('Screenshot an Claude')
  expect(b.find(x => x.key === 'report')?.label).toBe('Problem melden')
  expect(b.find(x => x.key === 'perf-quick')).toBeUndefined()
  // tab jumps are text actions with the fixed words
  expect(b.find(x => x.key === 'tests-open')?.label).toBe('Zu Tests')
  expect(b.find(x => x.key === 'console-open')?.label).toBe('Zur Konsole')
  // tasks are rows: the name, what it does as meta, „Starten“ on the right; no block of notes
  expect((await findShown(ui, 'Smoke-Test'))?.text).toBeDefined()
  expect(b.find(x => x.key === 'custom-smoke')?.label).toBe('▶︎ Starten')
  expect(await findShown(ui, /^Smoke-Test: /)).toBeUndefined()
  expect(await findShown(ui, /„Kompilieren prüfen“ kompiliert/)).toBeUndefined()

  world.bridge.isPlaying = true
  await settle(world, ui.press({ key: 'refresh' }))
  expect(await rules(ui as never)).toEqual([])
  b = await buttons(ui as never)
  expect(b.find(x => x.key === 'stop')).toMatchObject({ label: 'Stoppen', variant: 'primary' })
  // at most two secondary beside the primary: „Problem melden“ is a text action here
  const editor = ['stop', 'pause', 'shot', 'report'].map(key => b.find(x => x.key === key)?.variant)
  expect(editor.filter(v => v === 'secondary')).toHaveLength(2)
  await ui.unmount()
})

test('Tests: nothing chosen, a finished red run with its details, a running run', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${BRIDGE}/tests.json`] = JSON.stringify(RED)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-tests' }))
  expect(await rules(ui as never)).toEqual([])
  const b = await buttons(ui as never)
  // the two starts look the same
  expect(b.find(x => x.key === 'edit-tests')?.variant).toBe(b.find(x => x.key === 'play-tests')?.variant)
  expect(b.find(x => x.key === 'affected-tests')?.label).toBe('Betroffene prüfen')
  // the title is a name, the red test is cut like in the overview, the assertion stands behind „Details“
  expect((await findShown(ui, 'Letzter Lauf'))?.text).toBeDefined()
  expect((await findShown(ui, 'Mill.Grinds'))?.text).toBeDefined()
  expect(await findShown(ui, /But was: 2/)).toBeUndefined()
  expect(b.find(x => x.key === 'tfix-old-0')?.label).toBe('Reparieren')
  await settle(world, ui.press({ key: 'tf-old-0-details' }))
  expect((await findShown(ui, /But was: 2/))?.text).toBeDefined()
  expect(await rules(ui as never)).toEqual([])
  await settle(world, ui.press({ key: 'tests-skipped-details' }))
  expect(await rules(ui as never)).toEqual([])

  world.files[`${BRIDGE}/tests.json`] = JSON.stringify({ runId: 'r2', state: 'running', mode: 'EditMode', results: [] })
  await settle(world, ui.press({ key: 'refresh' }))
  expect(await rules(ui as never)).toEqual([])
  expect((await buttons(ui as never)).find(x => x.key === 'tests-stop')?.label).toBe('Stoppen')
  await ui.unmount()
})

test('Leistung: outside Play, in Play, and a recording without a spot', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-perf' }))
  expect(await rules(ui as never)).toEqual([])
  await settle(world, ui.press({ key: 'play' }))
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_status' }))
  expect(await rules(ui as never)).toEqual([])
  const b = await buttons(ui as never)
  expect(b.find(x => x.key === 'perf-10')?.variant).toBe('primary')
  expect(b.find(x => x.key === 'perf-30')).toMatchObject({ label: '30 s messen', variant: 'secondary' })
  await ui.press({ key: 'perf-10' })
  for (let i = 0; i < 80 && !(await findShown(ui, /^Messung \d\d:\d\d$/)); i++) await world.clock.advance(250)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_status' }))
  expect((await findShown(ui, /^Messung \d\d:\d\d$/))?.text).toBeDefined()
  expect(await rules(ui as never)).toEqual([])
  expect((await buttons(ui as never)).find(x => x.key === 'perf-ask')?.label).toBe('Analysieren')
  // a missing button needs no sentence
  expect(await findShown(ui, /Stelle unbekannt/)).toBeUndefined()
  await ui.unmount()
})
