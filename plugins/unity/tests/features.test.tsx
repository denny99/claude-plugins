import { expect, test } from 'claude-code/testing'
import { findShown, shownTexts } from './shown'

import { bashVerdictReason } from '../features/bash'
import { launcherStatus } from '../features/launcher'
import { LauncherChip, showsStatus } from '../lib/ui'
import type { UnityModel } from '../types'
import { BRIDGE, fakeWorld, PANE, PROJECT, ROOT, settle, type World } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const
const check = (command: string) => ({ tool: 'Bash', input: { command } })

async function finishBash(world: World, id: string, code: number, log = 'Unity batch log\n'): Promise<void> {
  world.files[`/tmp/t/${id}.output`] = `${log}[unity-run] exit ${code}\n`
  await world.clock.advance(1600)
}

test('restoreBeforeCommit: git commit denied while the file is modified, with the exact checkout; allowed when clean', async ($, on) => {
  const world = fakeWorld(on, { config: { restoreBeforeCommit: ['Packages/packages-lock.json'] } })
  await $.session.start(start)
  world.git.status = ' M unity/Packages/packages-lock.json\n'
  const denied = await settle(world, $.tool.check(check('git add -A && git commit -m "feat: x"')))
  expect(denied.decision).toBe('deny')
  expect(denied.reason).toContain('git checkout -- unity/Packages/packages-lock.json')
  expect(
    world.argv.some(a =>
      a.includes(
        'status --porcelain --untracked-files=no -- :(top)Packages/packages-lock.json :(top)unity/Packages/packages-lock.json',
      ),
    ),
  ).toBe(true)

  // not a commit → no git status at all; toggle off → no verdict
  const n = world.argv.length
  expect((await settle(world, $.tool.check(check('git status')))).decision).not.toBe('deny')
  expect(world.argv.length).toBe(n)
  expect(await bashVerdictReason($ as never, { commitGuard: false }, 'git commit -m x')).toBeUndefined()

  world.git.status = ''
  expect((await settle(world, $.tool.check(check('git commit -m x')))).decision).not.toBe('deny')

  // clean now, but the same line writes the lock file before committing (git status cannot see that yet)
  const sameLine = await settle(
    world,
    $.tool.check(check('echo "// x" >> unity/Packages/packages-lock.json && git add -A && git commit -m t')),
  )
  expect(sameLine.decision).toBe('deny')
  expect(sameLine.reason).toContain('changes unity/Packages/packages-lock.json and commits in the same line')
})

test('.meta guard: mv/rm of an asset without its .meta is denied with the corrected command; allowed cases pass', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${PROJECT}/Assets/Game/A.cs.meta`] = 'guid: 1'
  world.files[`${PROJECT}/Assets/Game/Old.meta`] = 'guid: 2'
  await $.session.start(start)
  const mv = await settle(world, $.tool.check(check('git mv unity/Assets/Game/A.cs unity/Assets/Game/B.cs')))
  expect(mv.decision).toBe('deny')
  expect(mv.reason).toContain(
    'git mv unity/Assets/Game/A.cs unity/Assets/Game/B.cs && git mv unity/Assets/Game/A.cs.meta unity/Assets/Game/B.cs.meta',
  )
  const rm = await settle(world, $.tool.check(check('cd unity && rm -r Assets/Game/Old')))
  expect(rm.decision).toBe('deny')
  expect(rm.reason).toContain('cd unity && rm -r Assets/Game/Old Assets/Game/Old.meta')
  const ps = await settle(world, $.tool.check(check('Remove-Item unity/Assets/Game/A.cs')))
  expect(ps.reason).toContain('Remove-Item unity/Assets/Game/A.cs; Remove-Item unity/Assets/Game/A.cs.meta')
  for (const ok of [
    'git mv unity/Assets/Game/A.cs unity/Assets/Game/A.cs.meta unity/Assets/Other/',
    'rm unity/Assets/Game/New.cs', // never imported: no .meta on disk
    'mv README.md docs/README.md',
  ])
    expect((await settle(world, $.tool.check(check(ok)))).decision).not.toBe('deny')
  expect(await bashVerdictReason($ as never, { metaGuard: false }, 'rm unity/Assets/Game/A.cs')).toBeUndefined()
})

test('worktree: git worktree add, Library cloned in the background, then batch runs go there', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, lock: 'stale', config: { worktreeDir: '.worktrees' } })
  world.files[`${PROJECT}/Library`] = ''
  await $.session.start(start)
  const res = JSON.stringify(await settle(world, $.tool.call({ tool: 'mcp__unity__unity_worktree', name: 'wt1' })))
  expect(res).toContain('Worktree /g/.worktrees/wt1 angelegt; Library/ wird im Hintergrund kopiert')
  expect(world.argv).toContain('git -C /g worktree add /g/.worktrees/wt1')
  const copy = world.calls.find(c => c.tool === 'Bash') as { command: string; run_in_background: boolean }
  expect(copy.run_in_background).toBe(true)
  expect(copy.command).toContain('cp -c -R /g/unity/Library /g/.worktrees/wt1/unity/Library')
  await finishBash(world, 'b1', 0)
  expect(JSON.stringify(await settle(world, $.tool.call({ tool: 'mcp__unity__unity_status' })))).toContain(
    'Worktree wt1: ready — batch runs go to /g/.worktrees/wt1/unity',
  )
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode' }))
  const batch = world.calls.filter(c => c.tool === 'Bash')[1] as { command: string }
  expect(batch.command).toContain('-projectPath /g/.worktrees/wt1/unity')
  expect(batch.command).toContain('-logFile /g/.worktrees/wt1/unity/Logs/claude-tests-')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'settings' }))
  expect((await findShown(ui, /Worktree wt1/))?.text).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'worktree-main' })).toBeDefined()
  await ui.unmount()
  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__unity__unity_worktree', name: '../x' }))).toContain(
    'Ungültiger Worktree-Name',
  )
})

test('worktree on Windows copies with robocopy', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, platform: 'windows' })
  world.files[`${PROJECT}/Library`] = ''
  await $.session.start(start)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_worktree', name: 'w' }))
  const copy = world.calls.find(c => c.tool === 'Bash') as { command: string }
  expect(copy.command).toContain(
    "MSYS2_ARG_CONV_EXCL='*' robocopy '\\g\\unity\\Library' '\\g\\.worktrees\\w\\unity\\Library' /E /NFL /NDL",
  )
})

test('affected tests: changed files → area run through the bridge; reminder after N landings', async ($, on) => {
  const world = fakeWorld(on, { store: { fullRun: { [ROOT]: 'old' } }, config: { fullSuiteEvery: 5 } })
  world.git.diff = 'unity/Assets/Game/Core/Adder.cs\nREADME.md\n'
  world.git.untracked = 'unity/Assets/Game/Ui/Hud.cs\n'
  world.git.count = '6'
  await $.session.start(start)
  const res = JSON.stringify(
    await settle(world, $.tool.call({ tool: 'mcp__unity__unity_affected_tests', waitSeconds: 5 })),
  )
  expect(res).toContain('Core (1 Datei): unity/Assets/Game/Core/Adder.cs')
  expect(res).toContain('1 geänderte Datei gehört zu keinem Test-Bereich: unity/Assets/Game/Ui/Hud.cs')
  expect(res).toContain('6 Commits seit dem letzten vollen Testlauf')
  expect(world.argv).toContain('git rev-list --count old..HEAD')
  const cmd = Object.entries(world.files).find(([f, t]) => f.includes('/cmd-') && t.includes('run-tests'))
  expect(JSON.parse(cmd?.[1] ?? '{}')).toMatchObject({ cmd: 'run-tests', filter: 'Game.Tests.Core' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(world, ui.press({ key: 'tab-tests' }))
  expect((await findShown(ui, /6 Commits seit dem letzten/))?.text).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'affected-tests' })).toBeDefined()
  await ui.unmount()
})

test('a green full batch run records HEAD as the last full suite', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, lock: 'none' })
  await $.session.start(start)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode' }))
  const bash = world.calls.find(c => c.tool === 'Bash') as { command: string }
  const xml = /-testResults (\S+)/.exec(bash.command)?.[1] ?? ''
  world.files[xml] = '<test-case name="T" fullname="G.T" result="Passed"></test-case>'
  await finishBash(world, 'b1', 0)
  await world.clock.advance(100)
  expect(world.argv).toContain('git rev-list --count abc123..HEAD')
  expect(JSON.stringify(await settle(world, $.tool.call({ tool: 'mcp__unity__unity_status' })))).toContain(
    'Commits since the last full test run: 0 (reminder at 5)',
  )
})

test('failed batch job: last 60 lines of its -logFile in the pane and in unity_status', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, lock: 'none' })
  await $.session.start(start)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode', filter: 'X' }))
  const bash = world.calls.find(c => c.tool === 'Bash') as { command: string }
  const logFile = /-logFile (\S+)/.exec(bash.command)?.[1] ?? ''
  expect(logFile).toMatch(/^\/g\/unity\/Logs\/claude-tests-\d+\.log$/)
  world.files[logFile] = Array.from({ length: 100 }, (_, i) => `log ${i}\x1b[31m!\x1b[0m`).join('\n')
  await finishBash(world, 'b1', 3, '')
  const status = JSON.stringify(await settle(world, $.tool.call({ tool: 'mcp__unity__unity_status' })))
  expect(status).toContain('Last failed job')
  expect(status).toContain('log 99!')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await findShown(ui, /^Letzte 60 Log-Zeilen · EditMode-Tests/))?.text).toBeDefined()
  expect((await findShown(ui, /^log 99!$/))?.text).toBeDefined()
  await ui.unmount()
})

test('compile gate without a bridge falls back to Editor.log while an editor holds the project', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, lock: 'held' })
  world.files['/Users/d/Library/Logs/Unity/Editor.log'] = [
    'Assets/Old.cs(1,1): error CS0001: before',
    '- Starting script compilation',
    'Assets/Game/A.cs(7,2): error CS0103: The name x does not exist',
  ].join('\n')
  await $.session.start(start)
  const ran = JSON.stringify(
    await settle(
      world,
      $.tool.call({ tool: 'Edit', file_path: `${PROJECT}/Assets/Game/A.cs`, old_string: 'a', new_string: 'b' }),
    ),
  )
  expect(ran).toContain('Assets/Game/A.cs(7,2): error CS0103')
  expect(ran).toContain('from Editor.log')
  expect(ran).not.toContain('CS0001')
  expect(Object.keys(world.files).some(f => f.includes('/cmd-'))).toBe(false)
})

test('render check: every pane section on every surface at 40x15 and 120x40 stays inside the body width', async ($, on) => {
  const world = fakeWorld(on, {
    store: { fullRun: { [ROOT]: 'old' } },
    config: {
      worktreeDir: '.worktrees',
      restoreBeforeCommit: ['Packages/packages-lock.json'],
      buildMethod: 'Build.Mac',
    },
  })
  world.git.diff = 'unity/Assets/Game/Core/A.cs\n'
  world.git.count = '9'
  world.files[`${PROJECT}/Library`] = ''
  world.files[`${BRIDGE}/console.json`] = JSON.stringify({
    entries: [
      {
        seq: 1,
        type: 'Error',
        message: `NullReferenceException: ${'very long '.repeat(20)}\x1b[31m`,
        stack: 'at A.B () [0x0] in Assets/Game/A.cs:3',
      },
      { seq: 2, type: 'Warning', message: 'tab\there' },
    ],
  })
  await $.session.start(start)
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  await settle(
    world,
    $.tool.call({ tool: 'Edit', file_path: `${PROJECT}/Assets/Game/A.cs`, old_string: 'a', new_string: 'b' }),
  )
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_affected_tests', waitSeconds: 5 }))
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_worktree', name: 'wt' }))
  await finishBash(world, 'b1', 1, `${'robocopy says something rather long '.repeat(5)}\r\n`)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_screenshot' }))
  // Every tab, reached the way a person does: tab buttons, the console card's link, the header's settings knob.
  const VIEWS: { press?: string; expect: RegExp }[] = [
    { expect: /Kompilierfehler|Kompiliert/ },
    { press: 'tab-tests', expect: /Tests starten/ },
    { press: 'tab-perf', expect: /Es ruckelt gerade/ },
    { press: 'tab-review', expect: /./ },
    { press: 'tab-overview', expect: /Aufgaben/ },
    { press: 'console-open', expect: /NullReferenceException/ },
    { press: 'settings', expect: /Worauf Claude arbeitet/ },
  ]
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const)
    for (const [cols, rows] of [
      [40, 15],
      [120, 40],
    ] as const) {
      const ui = await $.ui.mount({
        ...PANE,
        surface,
        viewport: { columns: cols, rows },
        props: { ...PANE.props, bodyColumns: cols, scroll: { offset: 0, bodyRows: rows } },
      })
      await settle(world, ui.press({ key: 'tab-overview' }))
      for (const view of VIEWS) {
        if (view.press && !(await ui.find({ type: 'Button', key: view.press })))
          await settle(world, ui.press({ key: 'tab-more' }))
        if (view.press) await settle(world, ui.press({ key: view.press }))
        const texts = await ui.findAll({ type: 'Text' })
        expect((await shownTexts(ui)).length).toBeGreaterThan(3)
        for (const t of texts) {
          expect(t.text).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f]/)
          // Graphical surfaces wrap text natively; the terminal draws strings as they are.
          if (surface === 'terminal')
            for (const line of t.text.split('\n'))
              if ([...line].length > cols)
                throw new Error(`${surface}/${cols}/${view.press ?? 'overview'}: "${line}" is wider than ${cols}`)
        }
        if (!texts.some(t => view.expect.test(t.text)))
          throw new Error(`${surface}/${cols}/${view.press ?? 'overview'}: nothing matches ${view.expect}`)
      }
      await settle(world, ui.press({ key: 'tab-overview' }))
      await ui.unmount()
    }
})

const BAND = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10, totalRows: 0 },
  view: {},
} as never

const EMPTY_STATUS: UnityModel = {
  phase: 'ok',
  editorTried: [],
  configFound: false,
  config: {},
  presets: [],
  lock: 'free',
  bridge: { up: true },
  console: [],
  previous: {},
  filterInput: '',
  jobs: [],
}

test('starter strip: chip "Unity" in a Unity project with the editor state; opens the pane', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  for (const surface of ['desktop', 'terminal'] as const) {
    const band = await $.ui.mount({ plugin: 'unity', surface, component: 'AbovePrompt', props: BAND })
    expect(((await band.drawn()) as { props?: { key?: string } }).props?.key).toBe('launch:unity@4')
    expect(await band.find({ type: 'Button', key: 'launch-unity' })).toBeDefined()
    await band.unmount()
  }
  expect(launcherStatus({ ...EMPTY_STATUS, bridge: { up: true, isPlaying: true } })).toEqual({
    status: 'Play läuft',
    tone: 'info',
  })
  expect(
    launcherStatus({ ...EMPTY_STATUS, tests: { state: 'running', results: [] }, bridge: { up: true, isPlaying: true } })
      .status,
  ).toBe('Tests laufen')
  expect(
    launcherStatus({
      ...EMPTY_STATUS,
      compile: { seq: 1, at: 0, source: 'bridge', messages: [{ severity: 'error', message: 'x' }] },
    }),
  ).toEqual({ status: '1 Fehler', tone: 'bad' })
  // Band v4: an editor open here whose bridge does not answer is a warn; a closed editor and a ready one say nothing.
  expect(launcherStatus({ ...EMPTY_STATUS, lock: 'held', bridge: { up: false, why: 'missing' } })).toEqual({
    status: 'nicht verbunden',
    tone: 'warn',
  })
  expect(launcherStatus({ ...EMPTY_STATUS, lock: 'held', bridge: { up: false, why: 'stale' } })).toEqual({
    status: 'antwortet nicht',
    tone: 'warn',
  })
  expect(launcherStatus({ ...EMPTY_STATUS, bridge: { up: false, why: 'missing' } })).toEqual({})
  expect(launcherStatus({ ...EMPTY_STATUS, lock: 'stale', bridge: { up: false, why: 'missing' } })).toEqual({})
  expect(launcherStatus({ ...EMPTY_STATUS, bridge: { up: true, version: '0.3.0' } })).toEqual({})
  expect(launcherStatus({ ...EMPTY_STATUS, bridge: { up: true } })).toEqual({ status: 'Bridge veraltet', tone: 'warn' })
  const band = await $.ui.mount({ plugin: 'unity', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await settle(world, band.press({ key: 'launch-unity' }))
  await band.unmount()
})

test('starter status (Band v4): the editor state in a few words, colour only for warn/bad', () => {
  const errs = (n: number): UnityModel => ({
    ...EMPTY_STATUS,
    compile: {
      seq: 1,
      at: 0,
      source: 'bridge',
      messages: Array.from({ length: n }, () => ({ severity: 'error' as const, message: 'x' })),
    },
  })
  expect(launcherStatus(errs(3))).toEqual({ status: '3 Fehler', tone: 'bad' })
  expect(launcherStatus({ ...EMPTY_STATUS, bridge: { up: true, isCompiling: true } })).toEqual({
    status: 'kompiliert …',
    tone: 'info',
  })
  expect(launcherStatus({ ...EMPTY_STATUS, bridge: { up: true, isPlaying: true, isPaused: true } }).status).toBe(
    'Play pausiert',
  )
  expect(
    launcherStatus({ ...EMPTY_STATUS, tests: { state: 'running', results: [] }, bridge: { up: true, isCompiling: true } }),
  ).toEqual({ status: 'Tests laufen', tone: 'info' })
  // errors beat everything; every status stays short for line 1
  expect(launcherStatus({ ...errs(1), bridge: { up: false } }).tone).toBe('bad')
  for (const m of [errs(12), EMPTY_STATUS, { ...EMPTY_STATUS, lock: 'held' as const, bridge: { up: false } }])
    expect([...(launcherStatus(m).status ?? '')].length).toBeLessThanOrEqual(16)
})

test('starter (Band v4): ready shows only the name, a test run shows its text, compile errors are bad', () => {
  const k = {
    Box: 'Box',
    Text: 'Text',
    Button: 'Button',
    graphical: true,
    brand: 'neutral',
    cols: 80,
    t: { faint: 'inactive', tones: { ok: { fg: 'success' }, warn: { fg: 'warning' }, bad: { fg: 'error' }, info: { fg: 'suggestion' } } },
  } as never
  type N = { children?: unknown[] }
  const texts = (m: UnityModel): string[] => {
    const out: string[] = []
    const walk = (n: N | undefined): void => {
      for (const c of n?.children ?? []) typeof c === 'string' ? out.push(c) : walk(c as N)
    }
    walk(LauncherChip(k, { key: 'launch-unity', label: 'Unity', ...launcherStatus(m), onPress: () => {} }) as never)
    return out
  }
  const ready: UnityModel = { ...EMPTY_STATUS, bridge: { up: true, version: '0.3.0' } }
  expect(texts(ready)).toEqual(['Unity'])
  expect(texts({ ...ready, bridge: { up: false, why: 'missing' } })).toEqual(['Unity']) // editor closed
  expect(texts({ ...ready, tests: { state: 'running', results: [] } })).toEqual(['Unity', '· Tests laufen'])
  const bad = launcherStatus({
    ...ready,
    compile: { seq: 1, at: 0, source: 'bridge', messages: [{ severity: 'error', message: 'x' }] },
  })
  expect(bad).toEqual({ status: '1 Fehler', tone: 'bad' })
  expect(showsStatus(bad)).toBe(true)
})
