// Paket 4a der Befunde: Konsole, Tests, Review, Leistung, Aufgaben, Zeichen auf Knöpfen.
import { expect, test } from 'claude-code/testing'

import { collapseConsole, consoleOrigin } from '../features/pane/common'
import { jobNotes } from '../features/pane/overview'
import { chartTop } from '../features/pane/perf'
import { shotToggleLabel } from '../features/review/tab'
import { ICON_GLYPHS } from '../lib/icons'
import { parseProjectConfig } from '../lib/unity'
import { findShown } from './shown'
import { BRIDGE, fakeWorld, PANE, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const

test('console origin: script file and line, package entries named as such (Befund 53)', () => {
  expect(consoleOrigin({ message: 'x', stack: 'at A.B () [0x0] in Assets/Game/A.cs:3' })).toEqual({ file: 'A.cs:3' })
  expect(
    consoleOrigin({
      message: 'NullReferenceException',
      stack: 'X.Y () (at ./Library/PackageCache/com.unity.localization@1.5.2/Editor/GameViewLanguageMenu.cs:119)',
    }),
  ).toEqual({ file: 'GameViewLanguageMenu.cs:119', pkg: 'com.unity.localization' })
  expect(consoleOrigin({ message: "Assets/Zoo/Plan.cs(12,5): warning CS0618: 'Find' is obsolete" })).toEqual({
    file: 'Plan.cs:12',
  })
  expect(consoleOrigin({ message: 'plain' })).toBeUndefined()
})

test('console collapse: same type and message once, counted, at the time of the latest (Befund 106)', () => {
  const g = collapseConsole([
    { seq: 1, type: 'Warning', message: 'Value 0 is out of range', time: 1 },
    { seq: 2, type: 'Warning', message: 'other', time: 2 },
    { seq: 3, type: 'Warning', message: 'Value 0 is out of range', time: 3 },
  ])
  expect(g.map(x => [x.entry.seq, x.count])).toEqual([
    [2, 1],
    [3, 2],
  ])
})

test('console tab: warnings go to Claude one by one and all at once, clear sits in the filter row (30, 31, 106, 116)', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${BRIDGE}/console.json`] = JSON.stringify({
    entries: [
      { seq: 1, type: 'Warning', message: 'Value 0 is out of range for TEnum' },
      { seq: 2, type: 'Warning', message: 'Value 0 is out of range for TEnum' },
      { seq: 3, type: 'Warning', message: "Assets/Zoo/Plan.cs(12,5): warning CS0618: 'Find' is obsolete: use X" },
    ],
  })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-console' }))
  await settle(world, ui.press({ key: 'con-filter-warning' }))
  expect((await ui.find({ type: 'Button', key: 'console-clear' }))?.props.label).toBe('Leeren')
  expect(await ui.find({ type: 'Button', key: 'fix-3' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'fix-1' })).toBeUndefined() // collapsed into seq 2
  expect((await findShown(ui, /^×2/))?.text).toBeDefined()
  expect((await findShown(ui, /^In Plan\.cs:12$/))?.text).toBeDefined()
  // Befund 29/105: the time / count never gets cut. The new kit's ListRow is one line (title cut at the end), the
  // wrapping row of the old unity copy is gone.
  const long = (await ui.findAll({ type: 'Text' })).find(t => String(t.text).startsWith('Assets/Zoo/Plan.cs'))
  expect(long?.props.wrap).toBe('truncate-end')
  await settle(world, ui.press({ key: 'console-fix-all' }))
  expect(world.prompts.at(-1)).toContain('[×2] Value 0 is out of range')
  await ui.unmount()
})

test('tests tab: no "neu" without a run to compare, re-run red here, then "neu" against the run before (86, 92)', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-tests' }))
  expect(await findShown(ui, /^Neu rot/)).toBeUndefined()
  expect((await findShown(ui, /^Rot · 1$/))?.text).toBeDefined()
  expect((await findShown(ui, /Kein Vergleichslauf/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'tests-rerun-red' }))
  // a second finished run is the comparison
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode' }))
  const runs = Object.entries(world.files).filter(([p, t]) => p.includes('/cmd-') && t.includes('run-tests'))
  expect(runs.some(([, t]) => t.includes('Breaks'))).toBe(true)
  expect(await findShown(ui, /Kein Vergleichslauf/)).toBeUndefined()
  expect((await findShown(ui, /^Weiterhin rot · 1$/))?.text).toBeDefined()
  await ui.unmount()
})

test('perf chart: y axis capped at 4× budget so the 16,6-ms line shows (Befund 99)', () => {
  expect(Math.abs(chartTop({ worst: 1500, budgetMs: 16.6 }) - 66.4) < 1e-9).toBe(true)
  expect(chartTop({ worst: 30, budgetMs: 16.6 })).toBe(30)
})

test('review: screenshot switch reads as a checkbox (65, 69); jobs explain themselves (14); glyphs on knobs (33, 116)', () => {
  expect(shotToggleLabel(true)).toBe('☑ Screenshot mitschicken')
  expect(shotToggleLabel(false)).toBe('☐ Screenshot mitschicken')
  const cfg = parseProjectConfig(
    JSON.stringify({
      customJobs: [
        { name: 'compile', command: 'node x', label: 'Kompilieren (Projekt)', description: 'eigenes Skript' },
      ],
    }),
  )
  expect(cfg.customJobs?.[0]).toMatchObject({ label: 'Kompilieren (Projekt)', description: 'eigenes Skript' })
  const notes = jobNotes(cfg.customJobs ?? [], true)
  expect(notes[0]).toContain('Kompilieren prüfen')
  expect(notes[1]).toBe('Kompilieren (Projekt): eigenes Skript')
  expect(jobNotes([], true)).toEqual([])
  expect(ICON_GLYPHS.pause).toBe('‖')
  for (const i of ['camera', 'gauge', 'trash', 'gear'] as const) expect(ICON_GLYPHS[i]).toBeDefined()
})

test('setup: "Bridge in einem anderen Projekt" only while this project has no bridge (Befund 15)', async ($, on) => {
  const world = fakeWorld(on, { bridge: false })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect(await ui.find({ type: 'Button', key: 'copy-bridge-url' })).toBeDefined()
  world.files[`${ROOT}/unity/Packages/manifest.json`] = JSON.stringify({
    dependencies: { 'com.denny99.claude-bridge': 'https://x/y.git' },
  })
  await settle(world, ui.press({ key: 'refresh' }))
  expect((await findShown(ui, /Bridge in einem anderen Projekt/))?.text).toBeUndefined()
  await ui.unmount()
})

test('tests tab: skipped tests counted and listed on demand (90); the affected check is a block of its own (61)', async ($, on) => {
  const world = fakeWorld(on)
  world.git.diff = 'unity/Assets/Game/Core/A.cs\n'
  await $.session.start(start)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_affected_tests', waitSeconds: 5 }))
  world.files[`${BRIDGE}/tests.json`] = JSON.stringify({
    runId: 'r9',
    state: 'done',
    mode: 'EditMode',
    results: [
      { fullName: 'Game.Tests.Core.Adds', name: 'Adds', status: 'Passed' },
      { fullName: 'Game.Tests.Core.Later', name: 'Later', status: 'Skipped', message: 'Ignored: kommt noch' },
    ],
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-tests' }))
  expect((await findShown(ui, /^Betroffene Tests · geprüft/))?.text).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'tests-skipped' }))?.props.label).toBe('1 übersprungen ▾')
  expect(await findShown(ui, /Game\.Tests\.Core\.Later/)).toBeUndefined()
  await settle(world, ui.press({ key: 'tests-skipped' }))
  expect((await findShown(ui, /Game\.Tests\.Core\.Later/))?.text).toBeDefined()
  await ui.unmount()
})
