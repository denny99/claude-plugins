// Paket 1 der Befunde: Editor in anderem Checkout, Bridge-Version, gesperrte Aufgaben, Tests mit Wahl/Stopp/Fortschritt.
import { expect, test } from 'claude-code/testing'

import { draftConfig } from '../features/init'
import { BRIDGE_VERSION, versionOlder } from '../lib/bridge'
import { parseBridgeTests, testErrorLine } from '../lib/unity'
import { findShown } from './shown'
import { BRIDGE, fakeWorld, PANE, PROJECT, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const
const PKG = 'com.denny99.claude-bridge'

test('bridge version: BRIDGE_VERSION is the shipped package.json version; versions compare numerically', () => {
  // A test cannot import JSON: bump this together with bridge/com.denny99.claude-bridge/package.json.
  expect(BRIDGE_VERSION).toBe('0.4.0')
  expect(versionOlder('0.1.0', '0.2.0')).toBe(true)
  expect(versionOlder('0.10.0', '0.2.0')).toBe(false)
  expect(versionOlder('0.2.0', '0.2.0')).toBe(false)
  expect(versionOlder('x', '0.2.0')).toBe(false)
})

test('editor open for the main checkout: the pane says where it runs instead of only "nicht verbunden"', async ($, on) => {
  const world = fakeWorld(on, { bridge: false })
  world.git.worktrees = `worktree /main\nHEAD abc\nbranch refs/heads/main\n\nworktree ${ROOT}\nHEAD def\nbranch refs/heads/panels\n`
  world.files['/main/unity/Temp/ClaudeBridge/status.json'] = JSON.stringify({ updatedAt: 1e13, compileSeq: 1 })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect((await findShown(ui, /Editor läuft für main \(Haupt-Checkout\) — diese Session ist im Worktree g/))?.text).toBeDefined()
  expect((await findShown(ui, /Editor in Haupt-Checkout/))?.text).toBeDefined()
  expect(world.argv).toContain('git worktree list --porcelain')
  await ui.unmount()
})

test('old bridge in the project: warning instead of ✓, update frees the lock entry after a confirm', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${PROJECT}/Packages/manifest.json`] = JSON.stringify({ dependencies: { [PKG]: 'https://x/y.git' } })
  world.files[`${PROJECT}/Packages/packages-lock.json`] = JSON.stringify({
    dependencies: { [PKG]: { version: 'https://x/y.git', hash: '58a5ce9' }, 'com.unity.ugui': { version: '2.0.0' } },
  })
  world.dirs[`${PROJECT}/Library/PackageCache`] = [`${PKG}@b055521ea1a0`]
  world.files[`${PROJECT}/Library/PackageCache/${PKG}@b055521ea1a0/package.json`] = JSON.stringify({ version: '0.1.0' })
  world.statusExtra.bridgeVersion = undefined // a 0.1 bridge names no version in its heartbeat
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect((await findShown(ui, /Bridge 0\.1\.0 veraltet/))?.text).toBeDefined()
  expect((await findShown(ui, `Bridge 0.1.0 — Plugin braucht ${BRIDGE_VERSION}`))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'bridge-update' }))
  expect(world.files[`${PROJECT}/Packages/packages-lock.json`]).toContain(PKG) // first press only asks
  await settle(world, ui.press({ key: 'bridge-update' }))
  const lock = JSON.parse(world.files[`${PROJECT}/Packages/packages-lock.json`] ?? '{}')
  expect(lock.dependencies[PKG]).toBeUndefined()
  expect(lock.dependencies['com.unity.ugui']).toBeDefined()
  await ui.unmount()
})

test('project jobs with the editor holding the project: second press needed; /unity-init marks tools/unity.mjs as batch', async ($, on) => {
  const world = fakeWorld(on, {
    lock: 'held',
    config: { customJobs: [{ name: 'scene', command: 'node tools/unity.mjs scene' }] },
  })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'custom-scene' }))
  expect(world.calls.some(c => c.tool === 'Bash')).toBe(false)
  expect(await ui.find({ type: 'Button', key: 'custom-scene-cancel' })).toBeDefined() // the confirm step stands
  await settle(world, ui.press({ key: 'custom-scene' }))
  expect(world.calls.some(c => c.tool === 'Bash')).toBe(true)
  await ui.unmount()

  const files: Record<string, string> = {
    '/r/README.md': '```bash\nnode tools/unity.mjs compile\nnode tools/smoke.mjs\n```\n',
  }
  const fs = { exists: async (p: string) => p in files, read: async (p: string) => files[p] ?? '' }
  const cfg = await draftConfig('/r', { root: '/r/unity', version: '6000.0.1f1', name: 'unity' } as never, fs)
  expect(cfg.customJobs).toEqual([
    { name: 'compile', command: 'node tools/unity.mjs compile', batch: true },
    { name: 'smoke', command: 'node tools/smoke.mjs' },
  ])
})

test('tests tab: nothing preselected; "Alle Tests" asks first; no one-click full run in the overview', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect(await ui.find({ type: 'Button', key: 'edit-tests' })).toBeUndefined() // overview: only "Tests wählen"
  await settle(world, ui.press({ key: 'tests-open' }))
  expect(await ui.find({ type: 'Button', key: 'edit-tests' })).toBeUndefined()
  expect((await findShown(ui, /Erst einen Bereich wählen/))?.text).toBeDefined()
  await ui.select({ key: 'preset', value: '*all*' } as never)
  await world.clock.advance(100)
  await settle(world, ui.press({ key: 'edit-tests' }))
  const runs = () => Object.entries(world.files).filter(([p, t]) => p.includes('/cmd-') && t.includes('run-tests'))
  expect(runs().length).toBe(0)
  // the question stands in the fixed status line, the button keeps its short label
  expect((await findShown(ui, /^Alle EditMode-Tests \(die ganze Suite\)\? Der Editor ist bis zum Ende blockiert\./))?.text).toBeDefined()
  const ask = (await ui.find({ type: 'Button', key: 'edit-tests' })) as { props: { label?: string }; text?: string }
  expect(String(ask?.text).split(' ').length).toBeLessThanOrEqual(3)
  await settle(world, ui.press({ key: 'edit-tests' }))
  expect(runs().length).toBe(1)
  expect(JSON.parse(runs()[0]?.[1] ?? '{}').filter).toBeUndefined()

  // an area runs at once
  await ui.select({ key: 'preset', value: 'Core' } as never)
  await world.clock.advance(100)
  await settle(world, ui.press({ key: 'edit-tests' }))
  expect(runs().length).toBe(2)
  await ui.unmount()
})

test('setup without editor: no one-click full batch run, a way to choose an area instead', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, lock: 'none' })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect(await ui.find({ type: 'Button', key: 'edit-tests' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'play-tests' })).toBeUndefined()
  await settle(world, ui.press({ key: 'setup-choose-tests' }))
  expect((await findShown(ui, /Erst einen Bereich wählen/))?.text).toBeDefined()
  await ui.unmount()
})

test('running run: "x von N · m:ss", header pill "Tests laufen", Stopp sends cancel-tests', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${BRIDGE}/tests.json`] = JSON.stringify({
    runId: 'r9',
    state: 'running',
    mode: 'EditMode',
    total: 10,
    startedAt: 1000,
    current: 'Game.Tests.Core.Slow',
    results: [1, 2, 3].map(i => ({ fullName: `G.T${i}`, name: `T${i}`, status: 'Passed' })),
  })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await world.clock.advance(65000)
  await settle(world, ui.press({ key: 'refresh' }))
  expect((await findShown(ui, /Tests laufen/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'tab-tests' }))
  expect((await findShown(ui, /EditMode läuft · 3 von 10 · \d:\d\d/))?.text).toBeDefined()
  expect((await findShown(ui, 'Gerade: Game.Tests.Core.Slow'))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'tests-stop' }))
  await settle(world, ui.press({ key: 'tests-stop' }))
  expect(Object.values(world.files).some(t => t.includes('"cancel-tests"'))).toBe(true)
  expect((await findShown(ui, 'Testlauf abgebrochen'))?.text).toBeDefined()
  await ui.unmount()

  const run = parseBridgeTests(JSON.stringify({ state: 'done', finishedAt: 0, total: 0, results: [] }))
  expect(run?.finishedAt).toBeUndefined()
  expect(testErrorLine({ error: 'Cancelled' })).toBe('Testlauf abgebrochen')
})

test('editor busy with tests (heartbeat a little stale): run stays "läuft", pill says so, bridge calls say so', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${BRIDGE}/tests.json`] = JSON.stringify({ runId: 'r1', state: 'running', mode: 'EditMode', results: [] })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  world.bridge.up = false
  world.files[`${BRIDGE}/status.json`] = JSON.stringify({ updatedAt: -60000, compileSeq: 3 })
  await settle(world, ui.press({ key: 'refresh' }))
  expect((await findShown(ui, /Tests laufen/))?.text).toBeDefined()
  expect(await findShown(ui, /abgebrochen|aborted/)).toBeUndefined()
  const res = JSON.stringify(await settle(world, $.tool.call({ tool: 'mcp__unity__unity_screenshot' })))
  expect(res).toContain('Editor beschäftigt (Tests laufen)')
  await ui.unmount()
})
