// Runde 3, Rest: „Unity vorn“ steht am Klang (nicht nur als Toast), „Problem melden“ sagt, wenn das Bild ohne
// UI-Toolkit-Oberfläche ist (Karte und Prompt).
import { expect, test } from 'claude-code/testing'

import { FRONT_JXA } from '../lib/front'
import { resetHostEnv } from '../lib/host'
import { findShown } from './shown'
import { fakeWorld, PANE, ROOT, settle } from './world'

type Node = { type: string; key?: string; props: Record<string, unknown> }
const keys = async (ui: unknown) =>
  ((await (ui as { findAll: (q: object) => Promise<Node[]> }).findAll({})) as Node[]).map(n => n.key ?? '')

const BOARD = {
  sounds: [{ id: 'door', name: 'Tür', group: 'SFX', duration: 1, takes: 1 }],
  mix: [{ group: 'SFX', db: 0 }],
}

test('[13] silent sound with Unity in the background: hint at the sounds and „Unity vorn“ fronts Unity by pid', async ($, on) => {
  resetHostEnv()
  const world = fakeWorld(on, { config: {}, board: BOARD })
  world.statusExtra.pid = 4242
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  await settle(world, ui.press({ key: 'rv-tab-sounds' }))
  await settle(world, ui.press({ key: 'rv-snd-load' }))
  world.bridge.soundExtra = { muted: false, focused: false, runInBackground: false }
  await settle(world, ui.press({ key: 'rv-play-door' }))
  expect((await findShown(ui, 'Unity im Hintergrund – Klang erst hörbar, wenn Unity vorn ist'))?.text).toBeDefined()
  expect(await keys(ui)).toContain('rv-front')
  await settle(world, ui.press({ key: 'rv-front' }))
  expect(world.spawns.find(a => a[0] === '/usr/bin/osascript')).toEqual([
    '/usr/bin/osascript',
    '-l',
    'JavaScript',
    '-e',
    FRONT_JXA,
    '4242',
  ])
  // played in the background with the bridge's lease: no hint, no button
  world.bridge.soundExtra = { muted: false, focused: false, runInBackground: true }
  await settle(world, ui.press({ key: 'rv-play-door' }))
  expect(await findShown(ui, /Klang erst hörbar/)).toBeUndefined()
  expect(await keys(ui)).not.toContain('rv-front')
  await ui.unmount()
})

test('[4/5] Problem melden with a picture without UI Toolkit: the card says so, the prompt tells Claude', async ($, on) => {
  const world = fakeWorld(on, { config: { review: { shots: 'docs/shots' } } })
  world.bridge.isPlaying = true
  world.bridge.shotUi = 'no-toolkit'
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  await settle(world, ui.press({ key: 'rv-report-open' }))
  expect((await findShown(ui, /Bild ohne Oberfläche: Menü\/HUD \(UI Toolkit\) fehlen/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'rv-report-keep' }))
  const saved = world.files[`${ROOT}/.claude/unity-review/reports.jsonl`] ?? ''
  const r = JSON.parse(saved.trim()) as { id: string; ui?: string }
  expect(r.ui).toBe('no-toolkit')
  await settle(world, ui.press({ key: `rv-rep-send-${r.id}` }))
  expect(world.prompts.at(-1)).toContain('Menü und HUD (UI Toolkit) fehlen darauf')
  await ui.unmount()
})
