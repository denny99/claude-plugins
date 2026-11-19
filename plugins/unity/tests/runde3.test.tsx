// Runde 3 aus dem Live-Test: ein Knopfdruck in Claude schickt Unity in den Hintergrund. Messen lief gedrosselt (4/5),
// Klänge blieben stumm oder wurden auf Englisch abgelehnt (6), Screenshots ohne UI-Toolkit-Oberfläche (13).
import { expect, test } from 'claude-code/testing'

import { BRIDGE_VERSION, readStatus } from '../lib/bridge'
import { activatePid, FRONT_JXA } from '../lib/front'
import { resetHostEnv } from '../lib/host'
import { capture, parsePerf, perfTimeoutMs, soundHints, soundRefusedText, type Send } from '../lib/play'
import { perfBackground, perfPrompt, THROTTLED_TEXT } from '../features/pane/perf'
import { shotPrompt } from '../features/pane/overview'
import { stopLive } from '../features/state'
import type { ModelPerf, UnityModel } from '../types'
import { findShown } from './shown'
import { BRIDGE, fakeWorld, PANE, PROJECT, ROOT, settle } from './world'

type Node = { type: string; key?: string; props: Record<string, unknown> }
const keys = async (ui: unknown) =>
  ((await (ui as { findAll: (q: object) => Promise<Node[]> }).findAll({})) as Node[]).map(n => n.key ?? '')

const BOARD = {
  sounds: [{ id: 'door', name: 'Tür', group: 'SFX', duration: 1, takes: 1 }],
  mix: [{ group: 'SFX', db: 0 }],
}

// --- Bridge 0.4.0 ---

test('[0.4] BRIDGE_VERSION 0.4.0; heartbeat reads pid, focused, runInBackground and stays fine without them', async () => {
  expect(BRIDGE_VERSION).toBe('0.4.0')
  const fs = (text: string) => ({ exists: async () => true, read: async () => text })
  const beat = { updatedAt: 1000, isCompiling: false, isPlaying: true, isPaused: false, compileSeq: 1 }
  const now = await readStatus(fs(JSON.stringify({ ...beat, pid: 4242, focused: false, runInBackground: true })), PROJECT, 1000)
  expect(now.status).toMatchObject({ pid: 4242, focused: false, runInBackground: true })
  const old = await readStatus(fs(JSON.stringify(beat)), PROJECT, 1000)
  expect(old.status && 'focused' in old.status).toBe(false)
  expect(old.status && 'pid' in old.status).toBe(false)
})

// --- [4/5] Messen im Hintergrund ---

const perf = (extra: Partial<ModelPerf>): ModelPerf => ({
  seconds: 10,
  requestedSeconds: 10,
  frames: 600,
  budgetMs: 16.6,
  avgMs: 16,
  p50: 16,
  p95: 20,
  p99: 25,
  worst: 30,
  hitches: 2,
  seriesStep: 1,
  series: [16, 30],
  costs: [],
  ...extra,
})

test('[4/5] background run: throttled under 20 fps or clearly short, a quiet note when it ran on; timeout seconds + 10 s', () => {
  // the live case: „10 s messen“ gave 1,0 s / 9 frames
  expect(perfBackground(perf({ background: true, frames: 9, wallSeconds: 1 }))).toBe('throttled')
  expect(perfBackground(perf({ background: true, frames: 150, wallSeconds: 10 }))).toBe('throttled')
  expect(perfBackground(perf({ background: true, frames: 600, wallSeconds: 10, runInBackground: true }))).toBe('kept')
  expect(perfBackground(perf({ frames: 9, wallSeconds: 1 }))).toBeUndefined()
  expect(perfPrompt(0, perf({ background: true, frames: 9, wallSeconds: 1 }))).toContain('nicht aussagekräftig')
  expect(perfPrompt(0, perf({ background: true, frames: 9, wallSeconds: 1 }))).not.toContain('Finde die wahrscheinliche Ursache')
  // bridge 0.4 stops after seconds + 5 s; older bridges (or none named) after 2 × seconds + 5 s
  expect(perfTimeoutMs(10, '0.4.0')).toBe(20000)
  expect(perfTimeoutMs(10, '0.3.0')).toBe(30000)
  expect(perfTimeoutMs(10)).toBe(30000)
  expect(parsePerf({ perf: { ...perf({}), background: true, runInBackground: false } })).toMatchObject({
    background: true,
    runInBackground: false,
  })
  expect(parsePerf({ perf: perf({}) })).not.toHaveProperty('background')
})

test('[4/5] throttled result: warning instead of a normal result; „Unity vorn messen“ fronts Unity by pid and gives the focus back', async ($, on) => {
  resetHostEnv()
  const world = fakeWorld(on)
  world.bridge.isPlaying = true
  world.statusExtra.pid = 4242
  world.bridge.perfExtra = { background: true, runInBackground: false, frames: 9, wallSeconds: 1 }
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-perf' }))
  await ui.press({ key: 'perf-10' })
  for (let i = 0; i < 12 && !(await findShown(ui, /^Messung \d\d:\d\d$/)); i++) await world.clock.advance(500)
  expect((await findShown(ui, new RegExp(`^${THROTTLED_TEXT} \\(9 Bilder/s`)))?.text).toBeDefined()
  expect((await findShown(ui, 'nicht aussagekräftig'))?.text).toBeDefined()
  expect(await findShown(ui, /Ruckler$/)).toBeUndefined()
  // the figures stay as rows; that they do not hold is said once, by the pill and the status line
  expect((await findShown(ui, 'Median'))?.text).toBeDefined()
  expect(await keys(ui)).toContain('perf-front-run')

  // the fallback: Unity to the front (pid only as an argument, the script text fixed), record, focus back to 777
  world.bridge.perfExtra = { background: false, frames: 600, wallSeconds: 10 }
  await ui.press({ key: 'perf-front-run' })
  for (let i = 0; i < 12 && world.spawns.filter(a => a[0] === '/usr/bin/osascript').length < 2; i++)
    await world.clock.advance(500)
  const jxa = world.spawns.filter(a => a[0] === '/usr/bin/osascript')
  expect(jxa[0]).toEqual(['/usr/bin/osascript', '-l', 'JavaScript', '-e', FRONT_JXA, '4242'])
  expect(jxa[1]).toEqual(['/usr/bin/osascript', '-l', 'JavaScript', '-e', FRONT_JXA, '777'])
  expect(FRONT_JXA).not.toMatch(/4242|777/)
  for (let i = 0; i < 6 && (await findShown(ui, 'nicht aussagekräftig')); i++) await world.clock.advance(500)
  expect(await findShown(ui, 'nicht aussagekräftig')).toBeUndefined()
  await ui.unmount()
  stopLive()
})

test('[4/5] not macOS: no „Unity vorn messen“, only the hint to bring the window to the front', async ($, on) => {
  resetHostEnv()
  const world = fakeWorld(on, { platform: 'windows' })
  world.bridge.isPlaying = true
  world.bridge.perfExtra = { background: true, frames: 9, wallSeconds: 1 }
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-perf' }))
  await ui.press({ key: 'perf-10' })
  for (let i = 0; i < 12 && !(await findShown(ui, /^Messung \d\d:\d\d$/)); i++) await world.clock.advance(500)
  expect((await findShown(ui, 'Unity-Fenster nach vorn holen und neu messen.'))?.text).toBeDefined()
  expect((await keys(ui)).filter(x => x.startsWith('perf-front'))).toEqual([])
  expect(world.spawns.some(a => a[0] === '/usr/bin/osascript')).toBe(false)
  await ui.unmount()
  stopLive()
  resetHostEnv()
})

// --- [6] Klänge ---

async function soundTab($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<typeof fakeWorld>[0]) {
  const world = fakeWorld(on, { config: {}, board: BOARD })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  await settle(world, ui.press({ key: 'rv-tab-sounds' }))
  await settle(world, ui.press({ key: 'rv-snd-load' }))
  return { world, ui }
}

test('[6] refused sound: German text, the main-menu case named; shown at the sound tab', async ($, on) => {
  expect(soundRefusedText('Playing a sound needs the running game: start Play mode first.')).toBe(
    'Erst eine Welt betreten – im Hauptmenü gibt es keine Klangbühne.',
  )
  expect(soundRefusedText('No listener\u0007 in scene')).toBe('Das Spiel hat den Klang abgelehnt: No listener in scene')
  const { world, ui } = await soundTab($, on)
  world.bridge.soundRefused = 'Playing a sound needs the running game: start Play mode first.'
  await settle(world, ui.press({ key: 'rv-play-door' }))
  expect((await findShown(ui, /Erst eine Welt betreten – im Hauptmenü gibt es keine Klangbühne\.$/))?.text).toBeDefined()
  expect(await findShown(ui, /running game/)).toBeUndefined()
  world.bridge.soundRefused = 'No AudioListener in the scene.'
  await settle(world, ui.press({ key: 'rv-play-door' }))
  expect((await findShown(ui, /Das Spiel hat den Klang abgelehnt: No AudioListener in the scene\.$/))?.text).toBeDefined()
  await ui.unmount()
})

test('[6] sound played but silent: muted, background without runInBackground, or an old bridge raise a toast', async ($, on) => {
  expect(soundHints({ muted: true, focused: true, runInBackground: true })).toEqual([
    { text: 'Ton ist im Game-Tab stumm geschaltet (Mute Audio)' },
  ])
  expect(soundHints({ focused: false, runInBackground: false })).toEqual([
    { text: 'Unity im Hintergrund – Klang erst hörbar, wenn Unity vorn ist', front: true },
  ])
  expect(soundHints({ focused: false, runInBackground: true })).toEqual([])
  expect(soundHints({})).toHaveLength(1) // bridge < 0.4 says nothing about focus

  const { world, ui } = await soundTab($, on)
  world.bridge.soundExtra = { muted: true, focused: true, runInBackground: true }
  await settle(world, ui.press({ key: 'rv-play-door' }))
  expect(world.toasts.at(-1)).toBe('Ton ist im Game-Tab stumm geschaltet (Mute Audio)')
  const n = world.toasts.length
  world.bridge.soundExtra = { muted: false, focused: true, runInBackground: false }
  await settle(world, ui.press({ key: 'rv-play-door' }))
  expect(world.toasts.length).toBe(n)
  world.bridge.soundExtra = { muted: false, focused: false, runInBackground: false }
  await settle(world, ui.press({ key: 'rv-play-door' }))
  expect(world.toasts.at(-1)).toBe('Unity im Hintergrund – Klang erst hörbar, wenn Unity vorn ist')
  world.bridge.soundExtra = undefined // bridge 0.3: no focus field
  await settle(world, ui.press({ key: 'rv-play-door' }))
  expect(world.toasts.at(-1)).toBe('Unity im Hintergrund – Klang erst hörbar, wenn Unity vorn ist')
  await ui.unmount()
})

test('[6] „Unity vorn“ helper: osascript JXA with the pid as argument, macOS only, the app in front before answered', async () => {
  const calls: { cmd: string; args: string[] }[] = []
  const run = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args })
    return { code: 0, stdout: '777\n', stderr: '' }
  }
  expect(await activatePid({ platform: 'macos', home: '/Users/d', run }, 4242)).toEqual({ ok: true, prev: 777 })
  expect(calls).toEqual([{ cmd: '/usr/bin/osascript', args: ['-l', 'JavaScript', '-e', FRONT_JXA, '4242'] }])
  expect(FRONT_JXA).toContain("ObjC.import('AppKit')")
  expect(FRONT_JXA).toContain('activateWithOptions(2)')
  expect(await activatePid({ platform: 'windows', home: 'C:/U', run }, 4242)).toMatchObject({ ok: false })
  expect(await activatePid({ platform: 'macos', home: '/', run }, 0)).toMatchObject({ ok: false })
  expect(await activatePid({ platform: 'macos', home: '/', run }, 4.5)).toMatchObject({ ok: false })
  expect(calls).toHaveLength(1)
})

// --- [13] Screenshot ohne UI Toolkit ---

test('[13] picture without UI Toolkit: the human sees it, the prompt tells Claude how to read the picture', async ($, on) => {
  const send: Send = async c => ({ ok: true, data: { path: (c as { path: string }).path, playing: true, ui: 'no-toolkit' } })
  expect(await capture(send, { path: '/p/a.png' })).toMatchObject({ ui: 'no-toolkit' })
  const bare: Send = async c => ({ ok: true, data: { path: (c as { path: string }).path, ui: 'weird' } })
  expect(await capture(bare, { path: '/p/a.png' })).not.toHaveProperty('ui')
  const m = { bridge: { up: true, isPlaying: true, sceneName: 'Main' } } as UnityModel
  expect(shotPrompt(m, '/p/a.png', 'game')).not.toContain('UI Toolkit')

  const world = fakeWorld(on)
  world.bridge.isPlaying = true
  world.bridge.shotUi = 'no-toolkit'
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'shot' }))
  expect(world.toasts).toContain('Bild ohne Oberfläche: Menü/HUD (UI Toolkit) fehlen – Unity war im Hintergrund')
  const prompt = world.prompts.at(-1) ?? ''
  expect(prompt).toContain(`${BRIDGE}/shots/shot-`)
  expect(prompt).toContain('Menü und HUD (UI Toolkit) fehlen darauf')
  await ui.unmount()

  const text = (await settle(world, $.command.run({ command: 'unity-screenshot', args: '' } as never))) as { text?: string }
  expect(text.text).toContain('Bild ohne Oberfläche')
})
