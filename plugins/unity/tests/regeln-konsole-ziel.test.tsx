// Design rules (kit-rules.ts) on the tabs Konsole and Ziel, the setup view and the pane's empty state.
import { expect } from 'claude-code/testing'
import { test } from './limits'

import { kitRuleLines } from './kit-rules'
import { findShown } from './shown'
import { BRIDGE, fakeWorld, PANE, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const

test('Konsole: one card, filter as a switch, rows with one action, clear asks first; no rule broken in any state', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${BRIDGE}/console.json`] = JSON.stringify({
    entries: [
      { seq: 1, type: 'Error', message: 'NullReferenceException: boom\nsecond line', stack: 'at A.B () in Assets/Game/A.cs:3', time: 100 },
      { seq: 2, type: 'Error', message: 'IndexOutOfRangeException: off', time: 200 },
      { seq: 3, type: 'Warning', message: "Assets/Zoo/Plan.cs(12,5): warning CS0618: 'Find' is obsolete: use X" },
      { seq: 4, type: 'Log', message: 'hello' },
    ],
  })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-console' }))
  expect(kitRuleLines(await ui.drawn())).toEqual([])
  // play control is the overview's: nothing of it here
  expect(await ui.find({ type: 'Button', key: 'stop' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'console-fix-all' }))?.props.label).toBe('Fehler an Claude')
  // details: the whole message first, then the origin, then the stack
  await settle(world, ui.press({ key: 'con-row-1-details' }))
  const texts = (await ui.findAll({ type: 'Text' })).map(t => String(t.text))
  const second = texts.indexOf('second line')
  expect(second).toBeGreaterThan(-1)
  expect(texts.indexOf('In A.cs:3')).toBeGreaterThan(second)
  expect(kitRuleLines(await ui.drawn())).toEqual([])
  for (const f of ['warning', 'all'] as const) {
    await settle(world, ui.press({ key: `con-filter-${f}` }))
    expect(kitRuleLines(await ui.drawn())).toEqual([])
  }
  // a log line is not handed to Claude
  expect(await ui.find({ type: 'Button', key: 'fix-4' })).toBeUndefined()
  // clearing asks first: one press sends nothing
  const sent = () => Object.values(world.files).some(t => t.includes('"clear-console"'))
  await settle(world, ui.press({ key: 'console-clear' }))
  expect(sent()).toBe(false)
  expect(kitRuleLines(await ui.drawn())).toEqual([])
  await settle(world, ui.press({ key: 'console-clear' }))
  expect(sent()).toBe(true)
  await ui.unmount()
})

test('Konsole empty: one calm sentence in the card, no action row', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${BRIDGE}/console.json`] = JSON.stringify({ entries: [] })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-console' }))
  expect((await findShown(ui, /^Keine Fehler seit dem letzten Kompilieren\.$/))?.text).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'console-clear' })).toBeUndefined()
  expect(kitRuleLines(await ui.drawn())).toEqual([])
  await ui.unmount()
})

test('Ziel: facts without a card in the card, guards as rows with „an“/„aus“; with and without a project config', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-target' }))
  expect(kitRuleLines(await ui.drawn())).toEqual([])
  expect((await findShown(ui, 'vorhanden'))?.text).toBeDefined()
  expect(await findShown(ui, /Compile gate|Restore-before-commit/)).toBeUndefined()
  await ui.unmount()

  delete world.files[`${ROOT}/.claude/unity.json`]
  const ui2 = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui2.press({ key: 'refresh' }))
  expect((await findShown(ui2, 'fehlt'))?.text).toBeDefined()
  expect(kitRuleLines(await ui2.drawn())).toEqual([])
  await ui2.unmount()
})

test('Einrichtung (no bridge): one action row per card, tab jump „Zu Tests“, copy and guide as text actions', async ($, on) => {
  const world = fakeWorld(on, { bridge: false, lock: 'none' })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect(kitRuleLines(await ui.drawn())).toEqual([])
  expect((await ui.find({ type: 'Button', key: 'setup-choose-tests' }))?.props.label).toBe('Zu Tests')
  expect((await ui.find({ type: 'Button', key: 'copy-bridge-url' }))?.props.label).toBe('Adresse kopieren')
  await ui.unmount()
})

test('no project: the empty state offers „Neu laden“, the header knob has the same word', async ($, on) => {
  const world = fakeWorld(on)
  for (const f of Object.keys(world.files)) if (f.includes('ProjectVersion.txt')) delete world.files[f]
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect((await ui.find({ type: 'Button', key: 'refresh-empty' }))?.props.label).toBe('Neu laden')
  expect((await ui.find({ type: 'Button', key: 'refresh' }))?.props.label).toBe('Neu laden')
  expect(kitRuleLines(await ui.drawn())).toEqual([])
  await ui.unmount()
})

test('terminal: Konsole and Ziel draw there too (same code, no frames)', async ($, on) => {
  const world = fakeWorld(on)
  world.files[`${BRIDGE}/console.json`] = JSON.stringify({
    entries: [{ seq: 1, type: 'Error', message: 'NullReferenceException: boom', stack: 'at A.B () in Assets/Game/A.cs:3' }],
  })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-console' }))
  expect(await ui.find({ type: 'Button', key: 'fix-1' })).toBeDefined()
  await settle(world, ui.press({ key: 'con-row-1-details' }))
  expect((await findShown(ui, /^In A\.cs:3$/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'tab-target' }))
  expect((await findShown(ui, /Schutz/))?.text).toBeDefined()
  await ui.unmount()
})
