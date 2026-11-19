// Paket 4b der Befunde: Konsole nach Kompilieren, Szene vor Play, Screenshots, Betroffene, Guards, rote Tests bleiben.
import { expect, test } from 'claude-code/testing'

import { statusPill } from '../features/pane'
import { noSceneOpen, sceneLabel, shotPrompt } from '../features/pane/overview'
import { hasOutlier, outlierNote, perfLength, perfPrompt } from '../features/pane/perf'
import { captureFacts } from '../features/review/report'
import { isCompileErrorLine, parseStartScene, parseWorktreeList } from '../features/state'
import { affectedAreas, affectedText } from '../lib/affected'
import { commitReason, lockDiffEntries, metaReason, metaFindings } from '../lib/command'
import { mergeRuns, type TestRun } from '../lib/unity'
import type { ModelPerf, UnityModel } from '../types'
import { findShown } from './shown'
import { BRIDGE, fakeWorld, PANE, PROJECT, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const

test('27: a compile error leaves the console after a clean compile', async ($, on) => {
  expect(isCompileErrorLine({ type: 'Error', message: 'Assets/Zoo/Plan.cs(5,6): error CS1001: Identifier expected' })).toBe(
    true,
  )
  expect(isCompileErrorLine({ type: 'Error', message: 'NullReferenceException' })).toBe(false)
  const world = fakeWorld(on)
  world.bridge.errors = false
  world.files[`${BRIDGE}/compile.json`] = JSON.stringify({ seq: 3, finishedAt: 500, messages: [] })
  world.files[`${BRIDGE}/console.json`] = JSON.stringify({
    entries: [
      { seq: 1, type: 'Error', message: 'Assets/Zoo/Plan.cs(5,6): error CS1001: Identifier expected', time: 100 },
      { seq: 2, type: 'Error', message: 'NullReferenceException: boom', time: 200 },
    ],
  })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-console' }))
  expect(await ui.find({ type: 'Button', key: 'fix-1' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'fix-2' })).toBeDefined()
})

test('32: entering Play while the domain reloads shows Play mode, not "kompiliert gerade"', async ($, on) => {
  const b = { up: true, isCompiling: true, isPlaying: true, isPaused: false } as UnityModel['bridge']
  expect(statusPill({ phase: 'ok', bridge: b, jobs: [], editorTried: [] } as unknown as UnityModel).text).toBe(
    'Play-Modus',
  )
  const world = fakeWorld(on)
  world.bridge.isPlaying = true
  world.statusExtra = { isCompiling: true }
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect(await findShown(ui, /Kompiliert gerade/)).toBeUndefined()
  expect(await findShown(ui, /Play-Modus/)).toBeDefined()
})

test('34/35: no scene open → hint and "Startszene öffnen"; scene name shown', async ($, on) => {
  expect(sceneLabel({ up: true, scene: 'Assets/Scenes/World.unity' })).toBe('World')
  expect(sceneLabel({ up: true, scene: '', sceneName: 'World' })).toBe('World')
  expect(noSceneOpen({ up: true, isPlaying: false, scene: undefined })).toBe(true)
  expect(noSceneOpen({ up: true, isPlaying: true, scene: undefined })).toBe(false)
  const yaml =
    'EditorBuildSettings:\n  m_Scenes:\n  - enabled: 0\n    path: Assets/Scenes/Old.unity\n    guid: a\n  - enabled: 1\n    path: Assets/Scenes/World.unity\n    guid: b\n'
  expect(parseStartScene(yaml)).toBe('Assets/Scenes/World.unity')
  const world = fakeWorld(on)
  world.bridge.errors = false
  world.statusExtra = { scene: '' }
  world.files[`${PROJECT}/ProjectSettings/EditorBuildSettings.asset`] = yaml
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect(await findShown(ui, /Keine Szene offen/)).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'open-start-scene' })).toBeDefined()
})

test('45: the report folder gets a .gitignore; 48: the overview screenshot goes to Claude', async ($, on) => {
  const world = fakeWorld(on)
  world.bridge.isPlaying = true
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'shot' }))
  expect(world.prompts.some(p => p.startsWith('Screenshot aus dem Unity-Editor (Play-Modus, Szene Main)'))).toBe(true)
  await settle(world, ui.press({ key: 'tab-overview' }))
  await settle(world, ui.press({ key: 'report' }))
  expect(world.files[`${ROOT}/.claude/unity-review/.gitignore`]).toContain('*')
  expect(shotPrompt({ bridge: { up: true, isPlaying: false } } as UnityModel, '/x.png')).toContain('/x.png')
})

test('47: report facts fall back to scene and camera, and say why there is no spot', () => {
  expect(
    captureFacts({
      path: 'p',
      playing: true,
      provider: false,
      scene: 'Assets/Scenes/World.unity',
      camera: { name: 'c', position: [1.2, 2, 3.7], rotation: [0, 0, 0], fov: 60 },
    }),
  ).toEqual(['Szene World', 'Kamera 1 / 2 / 4', 'Stelle unbekannt (Projekt meldet keine Stelle)'])
  expect(captureFacts({ path: 'p', playing: true, provider: true, spot: { x: 1, z: 2 } })).toEqual(['1 / 2'])
})

test('60: lock file, notes and restore-before-commit files affect no tests', () => {
  const presets = [{ name: 'Core', filter: 'Game.Tests.Core', source: 'config' as const }]
  const files = ['unity/Packages/packages-lock.json', 'unity/Assets/Notes.md', 'unity/Packages/manifest.json']
  const a = affectedAreas(files, presets, 'unity', ['Packages/manifest.json'])
  expect(a.uncovered).toEqual([])
  expect(a.areas).toEqual([])
  expect(affectedText(a)).toContain('Nichts betroffen')
  expect(affectedAreas(['unity/Assets/Core/A.cs'], presets, 'unity').areas.length).toBe(1)
})

test('76: the .meta guard names git mv and the Project window', () => {
  const line = 'mv Assets/A.cs Assets/B.cs'
  const text = metaReason(line, metaFindings(line)) ?? ''
  expect(text).toContain('git mv')
  expect(text).toContain('Project window')
})

test('78: a bridge update in the lock may be committed; mixed with churn only that entry', () => {
  const bridgeOnly = [
    '@@ -1,12 +1,12 @@',
    ' {',
    '   "dependencies": {',
    '     "com.denny99.claude-bridge": {',
    '       "version": "https://x.git#unity-bridge-v0.2.0",',
    '       "depth": 0,',
    '-      "hash": "aaa"',
    '+      "hash": "bbb"',
    '     },',
    '     "com.unity.eos": {',
    '       "version": "1.0.0"',
    '     },',
  ].join('\n')
  expect(lockDiffEntries(bridgeOnly)).toEqual({ bridge: true, other: false })
  const mixed = `${bridgeOnly}\n     "com.unity.x": {\n-      "version": "1.0.0"\n+      "version": "1.0.1"\n     }`
  expect(lockDiffEntries(mixed)).toEqual({ bridge: true, other: true })
  const reason = commitReason([{ staged: false, path: 'unity/Packages/packages-lock.json' }], undefined, [
    'unity/Packages/packages-lock.json',
  ])
  expect(reason).toContain('bridge update')
  expect(reason).toContain('git add -p')
})

const perf: ModelPerf = {
  seconds: 7,
  requestedSeconds: 10,
  frames: 1765,
  budgetMs: 16.7,
  avgMs: 4,
  p50: 3,
  p95: 4,
  p99: 5.3,
  worst: 1533.7,
  hitches: 4,
  seriesStep: 1,
  series: [],
  costs: [],
}

test('94/96/101/102: real length, outlier with its place and Play-start distance, no spot named', () => {
  expect(perfLength(perf)).toContain('7 s von 10 s')
  expect(perfLength({ ...perf, wallSeconds: 10 })).toBe('10 s')
  expect(hasOutlier(perf)).toBe(true)
  expect(outlierNote({ ...perf, sincePlay: 1, worstAt: 2.3 })).toContain('vermutlich Lade-/Startruckler')
  expect(outlierNote({ ...perf, sincePlay: 30, worstAt: 2.3 })).not.toContain('Lade')
  const prompt = perfPrompt(0, { ...perf, sincePlay: 1.5, worstAt: 3 })
  expect(prompt).toContain('1,5 s nach dem Play-Start')
  expect(prompt).toContain('Ladephase')
  expect(perfPrompt(0, perf)).toContain('unbekannt')
})

test('97: a narrow run adds to the last one: earlier reds stay until a run containing them turns them green', () => {
  const full: TestRun = {
    state: 'done',
    mode: 'EditMode',
    results: [
      { fullName: 'A.Red', name: 'Red', status: 'Failed' },
      { fullName: 'B.Red', name: 'Red', status: 'Failed' },
      { fullName: 'C.Ok', name: 'Ok', status: 'Passed' },
    ],
  }
  const narrow: TestRun = {
    state: 'done',
    mode: 'EditMode',
    filter: 'A',
    results: [{ fullName: 'A.Red', name: 'Red', status: 'Passed' }],
  }
  const merged = mergeRuns(full, narrow)
  expect(merged.results.map(r => [r.fullName, r.status, !!r.carried])).toEqual([
    ['A.Red', 'Passed', false],
    ['B.Red', 'Failed', true],
  ])
  expect(mergeRuns(merged, narrow).results.length).toBe(2) // idempotent on re-read
  expect(mergeRuns(merged, { ...full, results: [] }).results).toEqual([]) // a full run replaces
})

test('111: existing worktrees are offered on the target tab', async ($, on) => {
  const list = `worktree ${ROOT}\nHEAD abc\nbranch refs/heads/main\n\nworktree /w/game-panels\nHEAD def\nbranch refs/heads/feat/panels\n`
  expect(parseWorktreeList(list)).toEqual([
    { path: ROOT, branch: 'main' },
    { path: '/w/game-panels', branch: 'feat/panels' },
  ])
  const world = fakeWorld(on)
  world.git.worktrees = list
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-more' }).catch(() => undefined))
  await settle(world, ui.press({ key: 'tab-target' }))
  await settle(world, ui.press({ key: 'refresh' }))
  expect(await findShown(ui, /Worktree game-panels/)).toBeDefined()
  await settle(world, ui.press({ key: 'target-use-0' }))
  expect(await findShown(ui, /Worktree game-panels \(aktiv\)/)).toBeDefined()
})
