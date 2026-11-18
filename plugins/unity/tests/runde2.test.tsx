// Runde 2 aus dem Live-Test: Klangliste friert die App ein (a), Bridge-Version (b), Testfortschritt (c).
import { expect, test } from 'claude-code/testing'

import { parseSounds } from '../lib/play'
import { keptSound, SOUND_PAGE, soundGroups } from '../features/review/tab'
import { BRIDGE_VERSION } from '../lib/bridge'
import { BRIDGE_GIT_URL_TAGGED, testsProgress } from '../features/pane/common'
import { bridgeOutdated } from '../features/state'
import { findShown } from './shown'
import { BRIDGE, fakeWorld, PANE, ROOT, settle } from './world'

type Node = { type: string; key?: string; text?: string; props: Record<string, unknown> }

const GROUPS = ['Crafting', 'Ambience', 'Footsteps', 'UI', 'Creatures', 'Weather', 'Water', 'Music']
function bigBoard(n: number) {
  const sounds = Array.from({ length: n }, (_, i) => {
    const group = GROUPS[i % GROUPS.length]!
    return {
      id: group === 'Music' ? `music:${i}` : `sfx/${group.toLowerCase()}/klang_${i}`,
      name: `${group} – Klang Nummer ${i} · Variante „lang“`,
      group,
      duration: 1 + (i % 7) * 0.5,
      takes: 1 + (i % 3),
      path: `Assets/Audio/${group}/klang_${i}.wav`, // extra bridge field: not kept
    }
  })
  // what a real board can carry: a control character in a name, a doubled id
  sounds[1] = { ...sounds[1]!, name: 'Wind\u0007 böig\r\nlang' }
  sounds.push({ ...sounds[0]!, name: 'doppelt' })
  return { sounds, mix: GROUPS.map(g => ({ group: g, db: 0 })) }
}

async function soundsOpen($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<typeof fakeWorld>[0]) {
  const world = fakeWorld(on, { config: {}, board: bigBoard(300) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  await settle(world, ui.press({ key: 'rv-tab-sounds' }))
  await settle(world, ui.press({ key: 'rv-snd-load' }))
  const nodes = async () => (await (ui as unknown as { findAll: (q: object) => Promise<Node[]> }).findAll({})) as Node[]
  return { world, ui, nodes }
}

test('(a) board parse: control characters out, each id once, only the drawn fields', () => {
  const list = parseSounds(bigBoard(300) as never)
  expect(list.length).toBe(300)
  expect(list[1]!.name).toBe('Wind böig lang')
  expect(Object.keys(list[0]!).sort()).toEqual(['duration', 'group', 'id', 'name', 'takes'])
  expect(parseSounds({ sounds: [{ id: 'a\nb', name: 'x' }, { id: 'ok', name: 'y'.repeat(500) }] })).toEqual([
    { id: 'ok', name: `${'y'.repeat(119)}…`, duration: 0, takes: 1 },
  ])
  // the atom keeps only these fields: 300 sounds stay well under 40 KB
  const kept = list.map(x => keptSound({ ...x, path: 'Assets/x.wav' } as never))
  expect(Object.keys(kept[0]!).sort()).toEqual(['duration', 'group', 'id', 'name', 'takes'])
  expect(JSON.stringify(kept).length).toBeLessThan(40000)
  const groups = soundGroups(kept, () => false)
  expect(groups.map(g => g.name)).toEqual(GROUPS.filter(g => g !== 'Music'))
})

test('(a) 300 sounds: small tree (one group, 20 per page), unique keys, no control characters, small atom', async ($, on) => {
  const { ui, nodes } = await soundsOpen($, on)
  const all = await nodes()
  const buttons = all.filter(n => n.type === 'Button')
  // before: 2758 nodes, 824 buttons for the same board
  expect(all.length).toBeLessThan(500)
  expect(buttons.length).toBeLessThan(110)
  const keys = all.map(n => n.key ?? n.props.key).filter((x): x is string => typeof x === 'string')
  expect(keys.length).toBe(new Set(keys).size)
  // eslint-disable-next-line no-control-regex
  expect(all.filter(n => n.type === 'Text' && /[\x00-\x08\x0b-\x1f\x7f]/.test(n.text ?? '')).length).toBe(0)
  // a second drawing changes nothing (no state written while drawing)
  const before = JSON.stringify(all)
  const ui2 = await $.ui.mount({ ...PANE, requestId: 'unity-2', surface: 'desktop' })
  await ui2.unmount()
  expect(JSON.stringify(await nodes())).toBe(before)
  await ui.unmount()
})

test('(a) paging: "Weitere" adds 20 rows, another group unfolds, music pages too', async ($, on) => {
  const { world, ui, nodes } = await soundsOpen($, on)
  const plays = async () => (await nodes()).filter(n => String(n.key ?? n.props.key).startsWith('rv-play-')).length
  // Crafting holds 38 sounds (300 / 8 groups, music aside)
  expect(await plays()).toBe(SOUND_PAGE)
  expect((await ui.find({ type: 'Button', text: /Weitere 18 \(noch 18\)/ } as never)) as unknown).toBeDefined()
  await settle(world, ui.press({ key: 'rv-snd-more' }))
  expect(await plays()).toBe(38)
  await settle(world, ui.press({ key: 'rv-sgrp-open-1' }))
  expect(await plays()).toBe(SOUND_PAGE)
  expect((await nodes()).some(n => n.text === 'Ambience – Klang Nummer 1 · Variante „lang“' || n.text === 'Wind böig lang')).toBe(true)
  await settle(world, ui.press({ key: 'rv-music-toggle' }))
  const mus = async () => (await nodes()).filter(n => String(n.key ?? n.props.key).startsWith('rv-mplay-')).length
  expect(await mus()).toBe(SOUND_PAGE)
  await settle(world, ui.press({ key: 'rv-music-more' }))
  expect(await mus()).toBe(37)
  await ui.unmount()
})

test('(b) bridge 0.3.0: copied address pins the tag; a running bridge without bridgeVersion counts as old', () => {
  expect(BRIDGE_VERSION).toBe('0.3.0')
  expect(BRIDGE_GIT_URL_TAGGED.endsWith('#unity-bridge-v0.3.0')).toBe(true)
  expect(bridgeOutdated({ bridgeInstalled: undefined, bridge: { up: true } as never })).toBe(true)
  expect(bridgeOutdated({ bridgeInstalled: '0.3.0', bridge: { up: true, version: '0.3.0' } as never })).toBe(false)
  expect(bridgeOutdated({ bridgeInstalled: '0.2.0', bridge: { up: true, version: '0.2.0' } as never })).toBe(true)
  // editor closed, version unknown: no warning
  expect(bridgeOutdated({ bridgeInstalled: undefined, bridge: { up: false } as never })).toBe(false)
})

test('(b) heartbeat without bridgeVersion: warning card "älter als 0.3.0" with the update way, pill "Bridge veraltet"', async ($, on) => {
  const world = fakeWorld(on)
  world.statusExtra.bridgeVersion = undefined
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect((await findShown(ui, 'Bridge veraltet'))?.text).toBeDefined()
  expect((await findShown(ui, `Bridge älter als ${BRIDGE_VERSION} — bitte aktualisieren`))?.text).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'bridge-update' })).toBeDefined()
  await ui.unmount()
})

test('(c) progress: "x von N" only with a plausible N, else "x Tests fertig"; no "Gerade" while it is empty', async ($, on) => {
  const run = (total: number, done: number) =>
    ({
      state: 'running',
      total,
      results: Array.from({ length: done }, (_, i) => ({ fullName: `G.T${i}`, name: `T${i}`, status: 'Passed' })),
    }) as never
  expect(testsProgress(run(30, 3), 0)).toBe('3 von 30')
  expect(testsProgress(run(0, 5), 0)).toBe('5 Tests fertig')
  expect(testsProgress(run(2, 5), 0)).toBe('5 Tests fertig')
  expect(testsProgress(run(0, 1), 0)).toBe('1 Test fertig')
  expect(testsProgress(run(0, 0), 0)).toBe('')

  const world = fakeWorld(on)
  world.files[`${BRIDGE}/tests.json`] = JSON.stringify({
    runId: 'r1',
    state: 'running',
    mode: 'EditMode',
    total: 0,
    startedAt: 1000,
    current: '',
    results: [1, 2].map(i => ({ fullName: `G.T${i}`, name: `T${i}`, status: 'Passed' })),
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-tests' }))
  expect((await findShown(ui, /EditMode läuft · 2 Tests fertig/))?.text).toBeDefined()
  expect(await findShown(ui, /^Gerade:/)).toBeUndefined()
  await ui.unmount()
})
