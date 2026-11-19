import { expect } from 'claude-code/testing'
import { test } from './limits'
import { findShown } from './shown'

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

test('compile gate: a refresh with nothing new to compile still reports the standing errors', async ($, on) => {
  const world = fakeWorld(on)
  world.bridge.nothingToCompile = true
  world.files[`${BRIDGE}/compile.json`] = JSON.stringify({
    seq: 3,
    finishedAt: 900,
    messages: [
      {
        severity: 'Error',
        message: 'Assets/Game/B.cs(7,2): error CS0103: The name x does not exist',
        file: 'Assets/Game/B.cs',
        line: 7,
        column: 2,
      },
    ],
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const text = JSON.stringify(
    await settle(
      world,
      $.tool.call({ tool: 'Edit', file_path: `${PROJECT}/Assets/Game/A.cs`, old_string: 'a', new_string: 'b' }),
    ),
  )
  expect(text).toContain('nothing new to compile; the last compile still stands')
  expect(text).toContain('Assets/Game/B.cs(7,2): error CS0103')
  expect(text).not.toContain('Unity refreshed: nothing to compile.')
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
  expect(refused).toContain('Ein Editor hat das Projekt offen (Sperrdatei)')
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
  expect(results).toContain('Testlauf abgebrochen: Editor geschlossen oder abgestürzt')
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await findShown(ui, /Testlauf abgebrochen: Editor geschlossen oder abgestürzt/))?.text).toBeDefined()
  await ui.unmount()

  const again = JSON.stringify(
    await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode' })),
  )
  expect(again).toContain('Hintergrund-Task')
})

test('batch tests start as a background shell with the editor env; exit 2 parses NUnit results', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, lock: 'stale' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const started = JSON.stringify(
    await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode', filter: 'A;B' })),
  )
  expect(started).toContain('Hintergrund-Task b1')
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
    expect((await findShown(ui, /Editor bereit/))?.text).toBeDefined()
    expect((await findShown(ui, /Edit-Modus · Unity 6000\.6\.7f1/))?.text).toBeDefined()
    // the row names file, line and code; the whole compiler line stands behind „Details“
    expect((await findShown(ui, /CS1002/))?.text).toContain('A.cs:3 · CS1002')
    expect(await ui.find({ type: 'Button', key: 'play' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'tab-tests' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'play' }))
  expect(world.bridge.isPlaying).toBe(true)
  await settle(world, ui.press({ key: 'cfix-0' }))
  expect(world.prompts[0]).toContain('Behebe diesen Unity-Kompilierfehler')
  await ui.unmount()
})

test('the pane without a bridge shows the install hint', async ($, on) => {
  const world = fakeWorld(on, { bridge: false })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  for (const surface of ['terminal', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await findShown(ui, /Claude sieht den Unity-Editor nicht/))?.text).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'copy-bridge-url' })).toBeDefined()
    await ui.unmount()
  }
})

test('Leistung: 10 s messen in Play mode keeps the recording; outside Play a problem card with Play', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-perf' }))
  expect((await findShown(ui, /^Messen geht nur im Play-Modus\.$/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'play' }))
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_status' }))
  // the button only starts the recording (detached on the clock) and returns at once
  await ui.press({ key: 'perf-10' })
  expect((await findShown(ui, /Messe 10 s Leistung/))?.text).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'perf-10' })).toBeUndefined()
  for (let i = 0; i < 80 && (await findShown(ui, /Messe 10 s Leistung/)); i++) await world.clock.advance(250)
  expect(await findShown(ui, /Messe 10 s Leistung/)).toBeUndefined()
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_status' }))
  expect((await findShown(ui, /^Messung \d\d:\d\d$/))?.text).toBeDefined()
  // the figures are label/value rows
  expect((await findShown(ui, 'Median'))?.text).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await findShown(term, /[▁▂▃▄▅▆▇█]/))?.text).toBeDefined()
  await term.unmount()
})

test('auto-open: a session started in a Unity project opens the pane, autoOpen false does not', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle(world, Promise.resolve())
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await findShown(ui, /Editor bereit/))?.text).toBeDefined()
  await ui.unmount()
})
