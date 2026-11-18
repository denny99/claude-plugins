// Kit „ask Claude“: every button that hands Claude a prompt toasts at once, sends a task once and stays locked until
// the main loop answered *that* prompt (not just any turn end); an interrupt frees it.
import type { On } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

import { BRIDGE, fakeWorld, PANE, PROJECT, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'desktop', isInteractive: true } as const

type Turns = {
  turn: { start: (e: never) => Promise<unknown>; complete: (e: never) => Promise<unknown> }
}
async function turnStart($: Turns, id: string, text = ''): Promise<void> {
  await $.turn.start({ text, turnId: id } as never)
}
async function turnEnd($: Turns, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: id, reason: 'answer', ...extra } as never)
}
/** The engine frames a plugin's prompt before the turn carries it. */
const framed = (prompt: string) => `The unity plugin sent a message:\n\n${prompt}`

/** A pane with one compile error (button `cfix-0`, overview). */
async function compileErrorPane($: Engine, on: On) {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const world = fakeWorld(on)
  await $.session.start(start)
  await settle(
    world,
    $.tool.call({ tool: 'Edit', file_path: `${PROJECT}/Assets/Game/A.cs`, old_string: 'a', new_string: 'b' }),
  )
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const label = async (key = 'cfix-0') => String((await ui.find({ type: 'Button', key }))?.props.label ?? '')
  return { world, ui, label }
}

test('two presses across a turn end that is not the answer give exactly one prompt; the answer frees the button', async ($, on) => {
  const { world, ui, label } = await compileErrorPane($, on)
  expect(await label()).toMatch(/Claude reparieren lassen/)

  await turnStart($, 'busy', 'Denny fragt etwas anderes') // Claude works on something else
  await settle(world, ui.press({ key: 'cfix-0' }))
  // the toast comes at once, before Claude has seen anything
  expect(world.prompts).toHaveLength(1)
  expect(world.toasts).toContain('An Claude geschickt – kommt nach der laufenden Antwort.')
  expect(await label()).toMatch(/Wartet auf Claude/)

  await turnEnd($, 'busy') // the running turn ends, the task still waits in the queue
  await settle(world, ui.press({ key: 'cfix-0' }))
  expect(world.prompts).toHaveLength(1)
  expect(world.toasts).toContain('Schon an Claude geschickt – kommt mit der Antwort darauf.')
  await world.clock.advance(5 * 60_000) // longer than the old 2-min fallback
  await settle(world, ui.press({ key: 'cfix-0' }))
  expect(world.prompts).toHaveLength(1)

  // the turn that carries the prompt: bound, a subagent's end releases nothing, its own end answers it
  await turnStart($, 't1', framed(world.prompts[0] ?? ''))
  expect(await label()).toMatch(/An Claude geschickt/)
  await turnEnd($, 'sub', { agentId: 'a1' })
  expect(await label()).toMatch(/An Claude geschickt/)
  await turnEnd($, 't1')
  expect(await label()).toMatch(/Nochmal schicken/)
  await settle(world, ui.press({ key: 'cfix-0' })) // sending again is a choice
  expect(world.prompts).toHaveLength(2)
  await ui.unmount()
})

test('a double press while Claude is idle sends once and toasts „An Claude geschickt.“ at once', async ($, on) => {
  const { world, ui, label } = await compileErrorPane($, on)
  await Promise.all([ui.press({ key: 'cfix-0' }), ui.press({ key: 'cfix-0' })])
  expect(world.prompts).toHaveLength(1)
  expect(world.toasts).toContain('An Claude geschickt.')
  expect(await label()).toMatch(/An Claude geschickt/)
  await ui.unmount()
})

test('an interrupt frees a queued task: it never arrived, the button is back to normal', async ($, on) => {
  const { world, ui, label } = await compileErrorPane($, on)
  await turnStart($, 'busy', 'etwas anderes')
  await settle(world, ui.press({ key: 'cfix-0' }))
  await turnEnd($, 'sub', { agentId: 'a1', isAborted: true, reason: 'aborted' }) // a subagent's abort: nothing
  expect(await label()).toMatch(/Wartet auf Claude/)
  await turnEnd($, 'busy', { isAborted: true, reason: 'aborted', answer: '' })
  expect(world.toasts).toContain('Abgebrochen – nicht bei Claude angekommen. Der Knopf ist wieder frei.')
  expect(await label()).toMatch(/Claude reparieren lassen/)
  await settle(world, ui.press({ key: 'cfix-0' }))
  expect(world.prompts).toHaveLength(2)
  await ui.unmount()
})

test('screenshot (prompt made after the capture) and console „all to Claude“ are locked the same way', async ($, on) => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const world = fakeWorld(on)
  world.bridge.isPlaying = true
  world.files[`${BRIDGE}/console.json`] = JSON.stringify({
    entries: [
      { seq: 1, type: 'Warning', message: 'Value 0 is out of range for TEnum' },
      { seq: 3, type: 'Warning', message: "Assets/Zoo/Plan.cs(12,5): warning CS0618: 'Find' is obsolete: use X" },
    ],
  })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'editor-acts-more' }))
  await settle(world, ui.press({ key: 'shot' }))
  await settle(world, ui.press({ key: 'shot' }))
  expect(world.prompts.filter(p => p.startsWith('Screenshot aus dem Unity-Editor'))).toHaveLength(1)
  expect(world.toasts).toContain('Screenshot an Claude geschickt.')

  await settle(world, ui.press({ key: 'tab-console' }))
  await settle(world, ui.press({ key: 'con-filter-warning' }))
  await settle(world, ui.press({ key: 'console-fix-all' }))
  await settle(world, ui.press({ key: 'console-fix-all' }))
  expect(world.prompts.filter(p => p.includes('Value 0 is out of range'))).toHaveLength(1)
  expect(String((await ui.find({ type: 'Button', key: 'console-fix-all' }))?.props.label)).toMatch(/An Claude geschickt/)
  await turnStart($, 't', framed(world.prompts.join('\n\n'))) // the engine merges both waiting prompts
  await turnEnd($, 't')
  expect(String((await ui.find({ type: 'Button', key: 'console-fix-all' }))?.props.label)).toMatch(/Nochmal schicken/)
  await ui.unmount()
})

test('perf „Claude analysieren lassen“ and Ziel „Entwurf erstellen“ use the lock too', async ($, on) => {
  const world = fakeWorld(on)
  world.bridge.isPlaying = true
  delete world.files[`${ROOT}/.claude/unity.json`]
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-perf' }))
  await ui.press({ key: 'perf-10' })
  for (let i = 0; i < 12 && !(await ui.find({ type: 'Button', key: 'perf-ask' })); i++) await world.clock.advance(500)
  await settle(world, ui.press({ key: 'perf-ask' }))
  await settle(world, ui.press({ key: 'perf-ask' }))
  expect(world.prompts).toHaveLength(1)
  expect(String((await ui.find({ type: 'Button', key: 'perf-ask' }))?.props.label)).toMatch(/An Claude geschickt/)

  if (!(await ui.find({ type: 'Button', key: 'tab-target' }))) await settle(world, ui.press({ key: 'tab-more' }))
  await settle(world, ui.press({ key: 'tab-target' }))
  await settle(world, ui.press({ key: 'config-draft' }))
  await settle(world, ui.press({ key: 'config-draft' }))
  expect(world.prompts.filter(p => p.includes('/unity-init'))).toHaveLength(1)
  expect(world.toasts.filter(t => t === 'An Claude geschickt.')).toHaveLength(2)
  await ui.unmount()
})
