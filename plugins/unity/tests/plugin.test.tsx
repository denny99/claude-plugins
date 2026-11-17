import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const VERSION = 'm_EditorVersion: 6000.6.7f1\n'
const ROOT = '/g'
const PROJECT = '/g/unity'
const BRIDGE = `${PROJECT}/Temp/ClaudeBridge`
const EDITOR = '/Applications/Unity/Hub/Editor/6000.6.7f1/Unity.app/Contents/MacOS/Unity'

type World = {
  files: Record<string, string>
  calls: Record<string, unknown>[]
  argv: string[]
  prompts: string[]
  bridge: { up: boolean; isPlaying: boolean; compileSeq: number; errors: boolean }
  clock: { advance(ms: number): Promise<void> }
}

/** Engine stand-ins: an in-memory disk, a faked editor bridge reacting to cmd files, Bash/TaskStop, lsof. */
function fakeWorld(on: On, opts: { bridge?: boolean; lock?: 'held' | 'stale' | 'none' } = {}): World {
  const files: Record<string, string> = {
    [`${PROJECT}/ProjectSettings/ProjectVersion.txt`]: VERSION,
    [EDITOR]: '',
    [`${ROOT}/.claude/unity.json`]: JSON.stringify({
      tests: { areas: { Core: 'Game.Tests.Core' } },
      customJobs: [{ name: 'Smoke', command: 'node tools/smoke.mjs', batch: true }],
      editorEnv: { GAME_MUTE: '1' },
    }),
  }
  if (opts.lock && opts.lock !== 'none') files[`${PROJECT}/Temp/UnityLockfile`] = ''
  const world: World = {
    files,
    calls: [],
    argv: [],
    prompts: [],
    bridge: { up: opts.bridge ?? true, isPlaying: false, compileSeq: 3, errors: true },
    clock: mock.clock(on, { now: 1000 }),
  }
  const statusText = () =>
    JSON.stringify({
      updatedAt: 1e13,
      unityVersion: '6000.6.7f1',
      isCompiling: false,
      isPlaying: world.bridge.isPlaying,
      isPaused: false,
      compileSeq: world.bridge.compileSeq,
      scene: 'Assets/Scenes/Main.unity',
    })
  const read = (p: string): string | undefined =>
    p === `${BRIDGE}/status.json` && world.bridge.up ? statusText() : files[p]
  mock.store(on, {})
  mock.env(on, { HOME: '/Users/d', PATH: '/usr/bin' })
  on('session.info', () => ({ value: { transcriptPath: '', platform: 'macos' as const } }))
  on('session.root', () => ({ value: ROOT }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: read(e.path) !== undefined }))
  on('fs.read', (_, e) => {
    const text = read(e.path)
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    if (e.as === 'bytes') return { value: { base64: btoa(text) } }
    return { value: e.offset !== undefined ? text.slice(e.offset, e.offset + (e.length ?? text.length)) : text }
  })
  on('fs.stat', (_, e) => {
    const text = read(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: { size: text.length, mtimeMs: 1, isFile: true, isDirectory: false, isLink: false } as never }
  })
  on('fs.list', (_, e) => ({
    value:
      e.path === ROOT ? [{ name: 'unity', kind: 'dir' as const, size: 0, mtimeMs: 1, isLink: false } as never] : [],
  }))
  on('fs.write', (_, e) => {
    files[e.path] = String(e.text ?? '')
    const m = /cmd-([^/]+)\.json$/.exec(e.path)
    if (m && world.bridge.up) {
      const cmd = JSON.parse(files[e.path] ?? '{}') as Record<string, unknown>
      const done = (data: Record<string, unknown>) => {
        files[`${BRIDGE}/result-${m[1]}.json`] = JSON.stringify({ id: m[1], ok: true, ...data })
      }
      if (cmd.cmd === 'refresh') {
        world.bridge.compileSeq++
        files[`${BRIDGE}/compile.json`] = JSON.stringify({
          seq: world.bridge.compileSeq,
          finishedAt: 2000,
          messages: world.bridge.errors
            ? [
                {
                  severity: 'Error',
                  message: 'Assets/Game/A.cs(3,1): error CS1002: ; expected',
                  file: 'Assets/Game/A.cs',
                  line: 3,
                  column: 1,
                },
              ]
            : [],
        })
        done({})
      } else if (cmd.cmd === 'run-tests') {
        files[`${BRIDGE}/tests.json`] = JSON.stringify({
          runId: 'r1',
          state: 'done',
          mode: cmd.mode,
          filter: cmd.filter,
          results: [
            { fullName: 'Game.Tests.Core.Adds', name: 'Adds', status: 'Passed' },
            { fullName: 'Game.Tests.Core.Breaks', name: 'Breaks', status: 'Failed', message: 'Expected 1 but was 2' },
          ],
        })
        done({ runId: 'r1' })
      } else if (cmd.cmd === 'screenshot') {
        files[String(cmd.path)] = 'PNG!'
        done({ path: cmd.path })
      } else if (cmd.cmd === 'play') {
        world.bridge.isPlaying = true
        done({})
      } else done({})
    }
    return { value: undefined }
  })
  on('process.spawn', async function* (_, e) {
    world.argv.push(e.argv.join(' '))
    if (e.argv[0] === 'lsof' && opts.lock === 'held') {
      yield { stream: 'stdout' as const, text: '4242\n' }
      return { value: { code: 0, signal: null } }
    }
    return { value: { code: 1, signal: null } }
  })
  on('tool.call', (_, e) => {
    world.calls.push(e as unknown as Record<string, unknown>)
    if (e.tool === 'Bash') {
      files['/tmp/t/b1.output'] = 'Unity batch log\n'
      return {
        result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' },
        text: 'Command running in background with ID: b1. Output is being written to: /tmp/t/b1.output.',
      }
    }
    return { result: {} }
  })
  on('prompt.submit', (_, e) => {
    world.prompts.push(e.text)
    return { text: e.text } as never
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__unity__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  return world
}

/** Resolves a call that sleeps on the mocked clock. */
async function settle<T>(world: World, p: Promise<T>, steps = 80): Promise<T> {
  let done = false
  void p.then(() => (done = true))
  for (let i = 0; i < steps && !done; i++) await world.clock.advance(250)
  return p
}

const PANE = {
  plugin: 'unity',
  component: 'Pane',
  requestId: 'unity',
  props: {
    title: 'UNITY',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 80 },
    view: {},
  },
} as const

test('compile gate: an Edit of a .cs gets the compile errors appended; a .md edit gets nothing', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const ran = await settle(
    world,
    $.tool.call({ tool: 'Edit', file_path: `${PROJECT}/Assets/Game/A.cs`, old_string: 'a', new_string: 'b' }),
  )
  const text = JSON.stringify(ran)
  expect(text).toContain('Unity compile: 1 error(s)')
  expect(text).toContain('Assets/Game/A.cs(3,1): error CS1002')
  expect(Object.keys(world.files).some(f => /Temp\/ClaudeBridge\/cmd-.*\.json$/.test(f))).toBe(true)

  world.bridge.errors = false
  const ok = await settle(
    world,
    $.tool.call({ tool: 'Edit', file_path: `${PROJECT}/Assets/Game/A.cs`, old_string: 'b', new_string: 'c' }),
  )
  expect(JSON.stringify(ok)).toContain('Unity compile: OK.')

  const md = await settle(
    world,
    $.tool.call({ tool: 'Edit', file_path: `${ROOT}/docs/x.md`, old_string: 'a', new_string: 'b' }),
  )
  expect(JSON.stringify(md)).not.toContain('Unity')
})

test('compile gate never refreshes an editor in Play mode; tells to restart Play', async ($, on) => {
  const world = fakeWorld(on)
  world.bridge.isPlaying = true
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const ran = JSON.stringify(
    await settle(
      world,
      $.tool.call({ tool: 'Edit', file_path: `${PROJECT}/Assets/Game/A.cs`, old_string: 'a', new_string: 'b' }),
    ),
  )
  expect(ran).toContain('Unity is in Play mode: not refreshed')
  expect(ran).toContain('needs a Play restart')
  expect(Object.keys(world.files).some(f => f.includes('/cmd-'))).toBe(false)
})

test('Write of a new asset notes the missing .meta files', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, lock: 'none' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const ran = JSON.stringify(
    await settle(
      world,
      $.tool.call({ tool: 'Write', file_path: `${PROJECT}/Assets/New/Thing.cs`, content: 'class Thing {}' }),
    ),
  )
  expect(ran).toContain('New asset without .meta: Assets/New/Thing.cs, Assets/New')
  expect(ran).toContain('no editor bridge running')
})

test('tests through the bridge: area name resolves, failures first', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const res = JSON.stringify(
    await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode', filter: 'core' })),
  )
  expect(res).toContain('EditMode (filter Game.Tests.Core): 1 passed, 1 failed, 0 skipped of 2.')
  expect(res).toContain('NEW FAIL Game.Tests.Core.Breaks')
  const cmd = Object.entries(world.files).find(
    ([f]) => f.includes('/cmd-') && f.endsWith('.json') && world.files[f]?.includes('run-tests'),
  )
  expect(JSON.parse(cmd?.[1] ?? '{}')).toMatchObject({ cmd: 'run-tests', mode: 'EditMode', filter: 'Game.Tests.Core' })
})

test('screenshot tool returns an image block and the path', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const res = (await settle(world, $.tool.call({ tool: 'mcp__unity__unity_screenshot' }))) as {
    result?: { content?: { type: string; data?: string; text?: string }[] }
  }
  const content = res.result?.content ?? []
  expect(content[0]).toMatchObject({ type: 'image', data: btoa('PNG!'), mimeType: 'image/png' })
  expect(content[1]?.text).toMatch(/^Game view screenshot: \/g\/unity\/Temp\/ClaudeBridge\/shots\/shot-\d+\.png$/)
})

test('lockfile rule: batch tests refused while an editor holds the lock, started as background Bash when free', async ($, on) => {
  const held = fakeWorld(on, { bridge: false, lock: 'held' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const refused = JSON.stringify(
    await settle(held, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode' })),
  )
  expect(refused).toContain('An editor holds Temp/UnityLockfile')
  expect(held.calls.some(c => c.tool === 'Bash')).toBe(false)
  expect(held.argv.some(a => a.startsWith('lsof -t /g/unity/Temp/UnityLockfile'))).toBe(true)
})

test('batch tests start as a background shell with the editor env; exit 2 parses NUnit results', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, lock: 'stale' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const started = JSON.stringify(
    await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode', filter: 'A;B' })),
  )
  expect(started).toContain('background task b1')
  const bash = world.calls.find(c => c.tool === 'Bash') as { command: string; run_in_background: boolean }
  expect(bash.run_in_background).toBe(true)
  expect(bash.command).toContain(
    `export GAME_MUTE=1 && ${EDITOR} -batchmode -nographics -projectPath /g/unity -runTests -testPlatform EditMode`,
  )
  expect(bash.command).toContain("-testFilter 'A;B'")
  const xmlPath = /-testResults (\S+)/.exec(bash.command)?.[1] ?? ''
  world.files[xmlPath] =
    '<test-case name="T" fullname="G.T" result="Failed"><failure><message>boom</message></failure></test-case>'
  world.files['/tmp/t/b1.output'] = 'Unity batch log\n[unity-run] exit 2\n'
  await world.clock.advance(1600)
  const results = JSON.stringify(await $.tool.call({ tool: 'mcp__unity__unity_test_results' }))
  expect(results).toContain('0 passed, 1 failed')
  expect(results).toContain('FAIL G.T')
})

test('the pane renders on every surface; Play and Fix with Claude work', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  await settle(
    world,
    $.tool.call({ tool: 'Edit', file_path: `${PROJECT}/Assets/Game/A.cs`, old_string: 'a', new_string: 'b' }),
  )
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^UNITY/ }))?.text).toBeDefined()
    if (surface !== 'mobile')
      expect((await ui.find({ type: 'Text', text: /unity · 6000\.6\.7f1/ }))?.text).toContain('unity · 6000.6.7f1')
    expect((await ui.find({ type: 'Text', text: /Unity 6000\.6\.7f1 · edit mode/ }))?.text).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /error CS1002/ }))?.text).toContain('✗ Assets/Game/A.cs(3,1)')
    expect(await ui.find({ type: 'Button', key: 'edit-tests' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'play' }))
  expect(world.bridge.isPlaying).toBe(true)
  await settle(world, ui.press({ key: 'cfix-0' }))
  expect(world.prompts[0]).toContain('Fix this Unity compile error')
  await ui.unmount()
})

test('the pane without a bridge shows the install hint', async ($, on) => {
  const world = fakeWorld(on, { bridge: false })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  for (const surface of ['terminal', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Editor bridge not installed/ }))?.text).toBeDefined()
    await ui.unmount()
  }
})
