// A test run's result as a card at the tool's own result row (ToolResult); foreign tools and unknown calls stay as
// they were, the main action leads into the pane's Tests tab.
import { expect } from 'claude-code/testing'
import { test } from './limits'

import { kitRuleLines } from './kit-rules'
import { findShown } from './shown'
import { fakeWorld, PANE, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const

const resultRow = (tool: string, id: string) =>
  ({
    plugin: 'unity',
    component: 'ToolResult',
    requestId: id,
    props: { tool_use_id: id, tool, output: 'text', isErrored: false },
  }) as const

test('unity_run_tests: the run as a card at its result row, red tests listed, one main action', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', tool_use_id: 'toolu_run1', mode: 'EditMode' }))
  for (const surface of ['desktop', 'terminal', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...resultRow('mcp__unity__unity_run_tests', 'toolu_run1'), surface })
    expect(await findShown(ui as never, 'Testlauf')).toBeDefined()
    expect(await findShown(ui as never, /1 rot/)).toBeDefined()
    expect(await findShown(ui as never, /EditMode · 1 von 2 grün/)).toBeDefined()
    expect(await findShown(ui as never, /Core\.Breaks/)).toBeDefined()
    const main = await ui.find({ type: 'Button', key: 'tcard-open-olu_run1' })
    expect((main as { props: { label?: string } }).props.label).toContain('Fehler ansehen')
    if (surface === 'desktop') expect(kitRuleLines(await ui.drawn())).toEqual([])
    await ui.unmount()
  }
  // the main action opens the pane on its Tests tab
  const ui = await $.ui.mount({ ...resultRow('mcp__unity__unity_run_tests', 'toolu_run1'), surface: 'desktop' })
  await settle(world, ui.press({ key: 'tcard-open-olu_run1' }))
  await ui.unmount()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Button', key: 'edit-tests' })).toBeDefined()
  await pane.unmount()
})

test('unity_test_results gets the same card; a call without a record and a foreign tool stay untouched', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', mode: 'EditMode' }))
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_test_results', tool_use_id: 'toolu_res1' }))
  const card = await $.ui.mount({ ...resultRow('mcp__unity__unity_test_results', 'toolu_res1'), surface: 'desktop' })
  expect(await findShown(card as never, 'Testlauf')).toBeDefined()
  await card.unmount()
  // no record for this call (e.g. a refusal): no card
  const plain = await $.ui.mount({ ...resultRow('mcp__unity__unity_run_tests', 'toolu_none'), surface: 'desktop' })
  expect(await findShown(plain as never, 'Testlauf')).toBeUndefined()
  await plain.unmount()
  // a foreign tool's result is never drawn by unity
  const foreign = await $.ui.mount({ ...resultRow('mcp__other__run_tests', 'toolu_res1'), surface: 'desktop' })
  expect(await findShown(foreign as never, 'Testlauf')).toBeUndefined()
  await foreign.unmount()
})

test('ctrl+o (expanded) keeps the plain result', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  await settle(world, $.tool.call({ tool: 'mcp__unity__unity_run_tests', tool_use_id: 'toolu_g', mode: 'EditMode' }))
  const row = resultRow('mcp__unity__unity_run_tests', 'toolu_g')
  const open = await $.ui.mount({ ...row, props: { ...row.props, isExpanded: true }, surface: 'desktop' })
  expect(await findShown(open as never, 'Testlauf')).toBeUndefined()
  await open.unmount()
})
