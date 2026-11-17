import { expect, test } from 'claude-code/testing'

import { BRIDGE, EDITOR, fakeWorld, PANE, PROJECT, ROOT, settle } from './world'

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

test('screenshot tool returns a text block and a base64 image block, the shape the engine takes', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const res = (await settle(world, $.tool.call({ tool: 'mcp__unity__unity_screenshot' }))) as { result?: unknown }
  expect(Array.isArray(res.result)).toBe(true)
  const blocks = res.result as { type: string; text?: string }[]
  expect(blocks).toHaveLength(2)
  expect(blocks[0]?.type).toBe('text')
  expect(blocks[0]?.text).toMatch(/^Game view screenshot: \/g\/unity\/Temp\/ClaudeBridge\/shots\/shot-\d+\.png$/)
  expect(blocks[1]).toEqual({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: btoa('PNG!') },
  })
  // Not the MCP shape the engine refuses.
  expect(JSON.stringify(res)).not.toContain('mimeType')
  expect(JSON.stringify(res)).not.toContain('"content"')
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

test('an editor run left running while the heartbeat goes stale reads as aborted; a new run can start', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${BRIDGE}/tests.json`] = JSON.stringify({
    runId: 'r9',
    state: 'running',
    mode: 'EditMode',
    results: [],
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_status' }))
  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__unity__unity_test_results' }))).toContain('running')

  // The editor closes or crashes mid-run: the heartbeat is gone, tests.json still says running.
  world.bridge.up = false
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_status' }))
  const results = JSON.stringify(await $.tool.call({ tool: 'mcp__unity__unity_test_results' }))
  expect(results).toContain('Tests aborted — editor closed or crashed')
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /aborted — editor closed or crashed/ }))?.text).toBeDefined()
  await ui.unmount()

  const again = JSON.stringify(
    await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode' })),
  )
  expect(again).toContain('background task')
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
