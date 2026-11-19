// Runde 2 aus dem Live-Test: Klangliste friert die App ein (a), Bridge-Version (b), Testfortschritt (c),
// Screenshot ohne Fokus + deutsche Fehler (d), Problem melden verliert die Notiz (e), Bereichsfilter als Kommandozeile (f).
import { expect } from 'claude-code/testing'
import { test } from './limits'

import { parseSounds } from '../lib/play'
import { keptSound, SOUND_PAGE, soundGroups } from '../features/review/tab'
import { BRIDGE_VERSION, germanBridgeError } from '../lib/bridge'
import { staleShot } from '../lib/play'
import { normalizeFilter, testReport, unmatchedParts } from '../lib/unity'
import { BRIDGE_GIT_URL_TAGGED, testsProgress } from '../features/pane/common'
import type { UnityModel } from '../types'
import type { Kit } from '../lib/ui'
import { bridgeOutdated, editorActivity, ensureLive, liveOn, liveSignature, stopLive } from '../features/state'
import { consolePrompt, runLength, runSeconds } from '../features/pane/common'
import { consoleWarningsLine } from '../features/pane/overview'
import { perfLength } from '../features/pane/perf'
import { launcherStatus } from '../features/launcher'
import { statusPill } from '../features/pane'
import { jobDescription, jobLabel, jobTasks } from '../features/pane/overview'
import { findShown, reveal } from './shown'
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
  expect((await ui.find({ type: 'Button', key: 'rv-snd-more' }))?.props.label).toBe('Weitere 18')
  await settle(world, ui.press({ key: 'rv-snd-more' }))
  expect(await plays()).toBe(38)
  await settle(world, ui.press({ key: 'rv-sgrp-1-details' }))
  expect(await plays()).toBe(SOUND_PAGE)
  expect((await nodes()).some(n => n.text === 'Ambience – Klang Nummer 1 · Variante „lang“' || n.text === 'Wind böig lang')).toBe(true)
  await settle(world, ui.press({ key: 'rv-music-toggle' }))
  const mus = async () => (await nodes()).filter(n => String(n.key ?? n.props.key).startsWith('rv-mplay-')).length
  expect(await mus()).toBe(SOUND_PAGE)
  await settle(world, ui.press({ key: 'rv-music-more' }))
  expect(await mus()).toBe(37)
  await ui.unmount()
})

test('(b) bridge version: copied address pins the tag; a running bridge without bridgeVersion counts as old', () => {
  expect(BRIDGE_VERSION).toBe('0.4.0')
  expect(BRIDGE_GIT_URL_TAGGED.endsWith('#unity-bridge-v0.4.0')).toBe(true)
  expect(bridgeOutdated({ bridgeInstalled: undefined, bridge: { up: true } as never })).toBe(true)
  expect(bridgeOutdated({ bridgeInstalled: '0.4.0', bridge: { up: true, version: '0.4.0' } as never })).toBe(false)
  expect(bridgeOutdated({ bridgeInstalled: '0.3.0', bridge: { up: true, version: '0.3.0' } as never })).toBe(true)
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

// --- (d) Screenshot ohne Fokus: deutsche Fehler mit Weg, kein altes Bild als neues ---

test('(d) bridge errors in German with the way out; English texts of old bridges are mapped', () => {
  const shot = germanBridgeError('The Game view wrote no screenshot (is it visible?).')
  expect(shot).toContain('Unity hat kein Bild geschrieben')
  expect(shot).toContain('Game-Tab sichtbar')
  expect(germanBridgeError('No camera in the open scene.')).toContain('keine Kamera')
  expect(germanBridgeError('perf_record needs Play mode.')).toBe('Das geht nur im Play-Modus. Erst Play starten.')
  // already German or unknown: unchanged
  expect(germanBridgeError('Unity nimmt gerade auf.')).toBe('Unity nimmt gerade auf.')
})

test('(d) a picture that is not the one asked for does not pass as new', () => {
  expect(staleShot({ path: '/p/Temp/ClaudeBridge/shots/shot-1.png' }, '/p/Temp/ClaudeBridge/shots/shot-1.png', 5000)).toBeUndefined()
  expect(staleShot({ path: 'C:/p/shot-1.png' }, 'C:\\p\\shot-1.png', 5000)).toBeUndefined()
  expect(staleShot({ path: '/p/shots/shot-0.png' }, '/p/shots/shot-1.png', 5000)).toContain('anderes Bild')
  expect(staleShot({ path: '/p/a.png', takenAt: 1000 }, '/p/a.png', 9000)).toContain('altes Bild')
  expect(staleShot({ path: '/p/a.png', takenAt: 8500 }, '/p/a.png', 9000)).toBeUndefined()
})

test('(d) overview screenshot: Game-view error comes in German with the way; an old picture is refused', async ($, on) => {
  const world = fakeWorld(on)
  world.bridge.isPlaying = true
  world.bridge.shotError = 'The Game view wrote no screenshot (is it visible?).'
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'shot' }))
  const last = () => world.toasts.at(-1) ?? ''
  expect(last()).toMatch(/^Screenshot fehlgeschlagen: Unity hat kein Bild geschrieben\. Unity-Fenster nach vorn holen/)
  expect(world.toasts.join('\n')).not.toContain('Game view wrote')
  world.bridge.shotError = undefined
  world.bridge.shotPath = `${BRIDGE}/shots/shot-alt.png`
  const before = world.prompts.length
  await settle(world, ui.press({ key: 'shot' }))
  expect(last()).toContain('anderes Bild geliefert')
  expect(world.prompts.length).toBe(before)
  await ui.unmount()
})

// --- (e) Problem melden: Art und Notiz bleiben, ein Bild je Meldung ---

test('(e) kind and note chosen while Unity is still capturing survive; a second press makes no second picture', async ($, on) => {
  const world = fakeWorld(on, { config: {} })
  world.bridge.isPlaying = true
  world.bridge.holdCaptures = true
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  const opening = ui.press({ key: 'rv-report-open' })
  for (let i = 0; i < 4; i++) await world.clock.advance(250)
  // the card is there while Unity captures: the sentence wraps and says what can be done meanwhile
  expect((await findShown(ui, 'Art und Notiz kannst du schon eintragen.'))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'rv-kind-sieht-falsch-aus' }))
  await settle(world, ui.input({ key: 'rv-report-note', text: 'Baum schwebt', kind: 'change' } as never))
  // impatient second press (header button of the overview) while the first capture runs
  await settle(world, ui.press({ key: 'tab-overview' }))
  void ui.press({ key: 'report' }).catch(() => undefined)
  for (let i = 0; i < 4; i++) await world.clock.advance(250)
  const captures = () => Object.values(world.files).filter(t => t.includes('"cmd":"capture"')).length
  expect(captures()).toBe(1)
  for (let i = 0; i < 40 && world.held.length + 1; i++) {
    world.held.splice(0).forEach(f => f())
    await world.clock.advance(250)
  }
  await settle(world, opening)
  await settle(world, ui.press({ key: 'tab-review' }))
  expect(captures()).toBe(2) // the full picture + the pane's small copy, both for one report
  const inReports = Object.keys(world.files).filter(p => /\.claude\/unity-review\/.*\.png$/.test(p))
  expect(inReports).toHaveLength(1)
  await settle(world, ui.press({ key: 'rv-report-send' }))
  const prompt = world.prompts.at(-1) ?? ''
  expect(prompt).toContain('Problem gemeldet im Unity-Spiel: Sieht falsch aus.')
  expect(prompt).toContain('Notiz: Baum schwebt')
  const log = JSON.parse((world.files[`${ROOT}/.claude/unity-review/reports.jsonl`] ?? '').trim())
  expect(log).toMatchObject({ kind: 'Sieht falsch aus', note: 'Baum schwebt', sent: true })
  expect(log.screenshot).toBe(inReports[0])
  await ui.unmount()
})

test('(e) a note typed and sent at once (no pause, no Enter) still reaches the prompt', async ($, on) => {
  const world = fakeWorld(on, { config: {} })
  world.bridge.isPlaying = true
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  await settle(world, ui.press({ key: 'rv-report-open' }))
  await ui.input({ key: 'rv-report-note', text: 'Wasser flackert', kind: 'change' } as never)
  await settle(world, ui.press({ key: 'rv-report-send' }))
  expect(world.prompts.at(-1)).toContain('Notiz: Wasser flackert')
  // the next report starts empty
  await settle(world, ui.press({ key: 'rv-report-open' }))
  const note = (await ui.find({ key: 'rv-report-note' } as never)) as { props: { value?: string } } | undefined
  expect(note?.props.value ?? '').toBe('')
  await ui.unmount()
})

// --- (f) Bereichsfilter in Kommandozeilen-Syntax ---

test('(f) area filters written as a command line are cleaned; empty parts and quotes go', () => {
  const raw = '-testFilter "Cozy.Presentation.Tests.ClaudeProvidersTests;Cozy.Presentation.Tests.ReviewSpotTests"'
  expect(normalizeFilter(raw)).toMatchObject({
    filter: 'Cozy.Presentation.Tests.ClaudeProvidersTests;Cozy.Presentation.Tests.ReviewSpotTests',
    changed: true,
  })
  expect(normalizeFilter(raw).note).toContain('-testFilter')
  expect(normalizeFilter('--testFilter=A.B').filter).toBe('A.B')
  expect(normalizeFilter("-testFilter='A; ;B;'").filter).toBe('A;B')
  expect(normalizeFilter(' "A" ; "B" ').filter).toBe('A;B')
  expect(normalizeFilter('Game.Tests.Core')).toMatchObject({ filter: 'Game.Tests.Core', changed: false })
  expect(unmatchedParts('A\\.X;B', ['A.X.T1', 'C.T2'])).toEqual(['B'])
  expect(unmatchedParts('Game[', ['Game[1]'])).toEqual([]) // no valid regex: taken literally
  const report = testReport(
    { state: 'done', mode: 'EditMode', filter: 'A;B', results: [{ fullName: 'A.T', name: 'T', status: 'Passed' }] } as never,
    {},
  )
  expect(report).toContain('WARNING: filter part(s) matched no test in this run: B.')
})

test('(f) area choice: field stays free, the cleaned filter runs, the run card names the area and warns about a miss', async ($, on) => {
  const area = '18b. Prüfliste und Claude-Panel'
  const world = fakeWorld(on, {
    config: { tests: { areas: { [area]: '-testFilter "Game.Tests.Core;Game.Tests.Fehlt"' } } },
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'tab-tests' }))
  await ui.select({ key: 'preset', value: area } as never)
  await world.clock.advance(100)
  const field = (await ui.find({ key: 'filter' } as never)) as { props: { value?: string } } | undefined
  expect(field?.props.value ?? '').toBe('')
  expect((await findShown(ui, /als Kommandozeile geschrieben/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'edit-tests' }))
  const cmd = Object.entries(world.files).find(([f, t]) => f.includes('/cmd-') && t.includes('run-tests'))
  expect(JSON.parse(cmd?.[1] ?? '{}').filter).toBe('Game.Tests.Core;Game.Tests.Fehlt')
  await settle(world, ui.press({ key: 'refresh' }))
  expect((await findShown(ui, new RegExp(`^Bereich ${area} · `)))?.text).toBeDefined()
  expect(await findShown(ui, /-testFilter "/)).toBeUndefined()
  expect((await findShown(ui, /Bereich trifft Game\.Tests\.Fehlt nicht/))?.text).toBeDefined()
  await ui.unmount()
})

// --- Runde 2, Paket „hält nicht“: Messdauer (1), Messergebnis von selbst (2), Band/Panel folgen dem Heartbeat (3),
// Entscheidungskarte schmal (4), „Mehr“ schließt nach der Wahl (5), Aufgaben mit verständlichen Namen (6).

test('(1) 9 of 10 s: advice to update only for a bridge older than 0.3.0; under 5 % short stays quiet', () => {
  const p = { seconds: 9, requestedSeconds: 10, wallSeconds: 8.9 }
  expect(perfLength(p, '0.3.0')).toBe('9 s von 10 s (kürzer als angefragt)')
  expect(perfLength(p, '0.3.0')).not.toContain('aktualisieren')
  expect(perfLength(p, '0.2.0')).toContain('Bridge aktualisieren')
  expect(perfLength(p)).toContain('Bridge aktualisieren') // a bridge that names no version is from before 0.3.0
  expect(perfLength({ ...p, wallSeconds: 9.6 }, '0.2.0')).toBe('10 s')
  expect(perfLength({ ...p, wallSeconds: 9.5 }, '0.3.0')).toBe('10 s')
})

test('(2) the measurement result is drawn by itself, without Aktualisieren or another tool call', async ($, on) => {
  const world = fakeWorld(on)
  world.bridge.isPlaying = true
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-perf' }))
  await ui.press({ key: 'perf-10' })
  expect((await findShown(ui, /Messe 10 s Leistung/))?.text).toBeDefined()
  // only the clock runs: the live watch fetches the result file and patches the model
  for (let i = 0; i < 12 && !(await findShown(ui, /^Messung \d\d:\d\d$/)); i++) await world.clock.advance(500)
  expect((await findShown(ui, /^Messung \d\d:\d\d$/))?.text).toBeDefined()
  expect(await findShown(ui, /Messe 10 s Leistung/)).toBeUndefined()
  await ui.unmount()
  stopLive()
})

test('(3) band and pill read one activity: Play wins over the domain reload, a heartbeat change is drawn within a second', async ($, on) => {
  const base = { tests: undefined, jobs: [], compile: undefined } as never as UnityModel
  const reload = { ...base, bridge: { up: true, isPlaying: true, isCompiling: true, isPaused: false } } as UnityModel
  expect(editorActivity(reload)).toBe('playing')
  expect(launcherStatus(reload).status).toBe('Play läuft')
  expect(statusPill({ ...reload, phase: 'ok' } as UnityModel).text).toBe('Play-Modus')
  const compiling = { ...base, bridge: { up: true, isPlaying: false, isCompiling: true } } as UnityModel
  expect(launcherStatus(compiling).status).toBe('kompiliert …')
  expect(liveSignature(reload.bridge)).not.toBe(liveSignature({ ...reload.bridge, isPlaying: false }))

  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await world.clock.advance(1100)
  expect((await findShown(ui, 'Editor bereit'))?.text).toBeDefined()
  world.bridge.isPlaying = true // Play started in Unity, nobody touches the panel
  await world.clock.advance(1100)
  expect((await findShown(ui, 'Play-Modus'))?.text).toBeDefined()
  world.bridge.isPlaying = false
  await world.clock.advance(1100)
  expect((await findShown(ui, 'Editor bereit'))?.text).toBeDefined()
  await ui.unmount()
  stopLive()
})

type El = { type?: unknown; props?: Record<string, unknown>; children?: El[] }
const walkEl = (n: El | undefined, out: El[] = []): El[] => {
  if (!n || typeof n !== 'object') return out
  out.push(n)
  for (const c of n.children ?? []) walkEl(c as El, out)
  return out
}
const textOf = (n: El): string =>
  (n.children ?? []).map(c => (typeof c === 'string' || typeof c === 'number' ? String(c) : textOf(c))).join('')

test('(4) decision: options are list rows with „Wählen“; a long option wraps under its row, no option text twice', async ($, on) => {
  const long = 'Fackel an der Wand lassen, aber wärmer und etwas heller machen'
  const world = fakeWorld(on, { config: { review: { questions: 'docs/fragen.json', answers: 'docs/antworten.jsonl' } } })
  world.files[`${ROOT}/docs/fragen.json`] = JSON.stringify({
    version: 1,
    items: [{ id: 'fackel', kind: 'entscheiden', title: 'Welche Fackel?', options: [long, 'warmes Orange', 'so lassen'] }],
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  await reveal(ui, 'rv-tab-decide', 'rv-tab-')
  await settle(world, ui.press({ key: 'rv-tab-decide' }))
  await settle(world, ui.press({ key: 'rv-choice-fackel-1' }))
  const choose = (await ui.findAll({ type: 'Button' })).filter(b => String(b.props.key ?? '').startsWith('rv-choice-fackel-'))
  // the marked option (B) has no button, the others one short „Wählen“ each
  expect(choose.map(b => [b.props.key, b.props.label])).toEqual([
    ['rv-choice-fackel-0', 'Wählen'],
    ['rv-choice-fackel-2', 'Wählen'],
  ])
  const texts = (await ui.findAll({ type: 'Text' })).map(t => String(t.text))
  expect(texts.filter(t => t === long).length).toBe(1)
  expect(texts).toContain('Option A')
  expect(texts).toContain('B · warmes Orange')
  expect(texts.filter(t => t.includes('so lassen')).length).toBe(1)
  // the long option wraps (a Sentence under its row), it is never a Button label
  expect((await ui.findAll({ type: 'Text' })).find(t => String(t.text) === long)?.props.wrap).toBe('wrap')
  expect((await ui.find({ type: 'Button', key: 'rv-answer-fackel' }))?.props).toMatchObject({ label: 'Antwort schicken', variant: 'primary' })
  await ui.unmount()
})

test('(5) narrow strip pages like the band: „+N“ on, „‹“ back; a choice shows its own page, also from the header', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    viewport: { columns: 29, rows: 30 },
    props: { ...PANE.props, bodyColumns: 29, scroll: { offset: 0, bodyRows: 30 } },
  })
  const btn = (key: string) => ui.find({ type: 'Button', key })
  expect(await btn('tab-tests')).toBeDefined() // ~300 px: Übersicht, Tests, +N
  expect(await btn('tab-console')).toBeUndefined()
  expect(String((await btn('tab-more'))?.props.label)).toMatch(/^\+\d+$/)
  await reveal(ui, 'tab-target')
  await settle(world, ui.press({ key: 'tab-target' }))
  expect((await btn('tab-target'))?.props.variant).toBe('primary') // the page with the chosen tab stays
  expect(await btn('tab-overview')).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'settings' })).toBeUndefined()
  await reveal(ui, 'tab-overview')
  await settle(world, ui.press({ key: 'tab-overview' }))
  expect(await btn('tab-tests')).toBeDefined() // back on the first page, no „‹“
  expect(await btn('tab-prev')).toBeUndefined()
  await ui.unmount()
})

test('(6) project tasks without label/description: German names for known ones, readable name and command otherwise', async ($, on) => {
  expect(jobLabel({ name: 'smoke-timing' })).toBe('Smoke: Zeiten')
  expect(jobLabel({ name: 'warm-stop' })).toBe('Warmen Editor beenden')
  expect(jobLabel({ name: 'setup' })).toBe('Einrichten')
  expect(jobLabel({ name: 'build-windows' })).toBe('Build Windows')
  expect(jobLabel({ name: 'bake_light-maps' })).toBe('Bake light maps')
  expect(jobLabel({ name: 'smoke', label: 'Eigener Name' })).toBe('Eigener Name')
  expect(jobDescription({ name: 'smoke' })).toContain('prüft')
  expect(jobDescription({ name: 'bake', command: 'node tools/unity.mjs bake' })).toBe('führt „node tools/unity.mjs bake“ aus.')
  expect(jobDescription({ name: 'x', description: 'eigen' })).toBe('eigen')
  // a task is a row: its name, what it does as the row's meta (a sentence of its own)
  const tasks = jobTasks({ customJobs: [{ name: 'smoke-timing', command: 'node tools/unity.mjs smoke-timing' }] }, true)
  expect(tasks.map(t => t.title)).toEqual(['Kompilieren prüfen', 'Smoke: Zeiten'])
  expect(tasks[1]!.meta).toBe('Misst die Ladezeiten beim Lauf durch die Welt; wird nie wegen der Zeit rot.')

  const world = fakeWorld(on, {
    config: { customJobs: [{ name: 'warm-stop', command: 'node tools/unity.mjs warm-stop' }, { name: 'bake', command: 'node bake.mjs' }] },
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // each task is a row: its name as the title, what it does as the meta, „Starten“ on the right
  expect((await findShown(ui, 'Warmen Editor beenden'))?.text).toBeDefined()
  expect((await findShown(ui, 'Bake'))?.text).toBeDefined()
  expect((await findShown(ui, 'Führt „node bake.mjs“ aus.'))?.text).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'custom-warm-stop' }))?.props.label).toBe('▶︎ Starten')
  expect((await ui.find({ type: 'Button', key: 'custom-bake' }))?.props.label).toBe('▶︎ Starten')
  await ui.unmount()
})

// --- Runde 2, Paket „Zahlen und Herkunft“: Warnungen (1), Ziel einmal (2), Wanduhr (3), Paket-Prompt (4),
// Ziel-Tab schmal (5), Live-Watch nach Neuladen (6).

test('(r1) console warnings say what they count: compiler warnings Unity logged twice are named as such', () => {
  const cw = (n: number) => ({ type: 'Warning', message: `Assets/A${n}.cs(${n},1): warning CS0414: unused field` })
  const twice = [...[1, 2, 3].map(cw), ...[1, 2, 3].map(cw), { type: 'Warning', message: 'Shader warning' }]
  expect(consoleWarningsLine(twice)).toBe(
    '7 Warnungen in der Konsole, davon 6 vom Compiler (3 verschiedene, Unity meldet sie mehrfach).',
  )
  expect(consoleWarningsLine([cw(1)])).toBe('1 Warnung in der Konsole, davon 1 vom Compiler.')
  expect(consoleWarningsLine([{ type: 'Warning', message: 'x' }])).toBe('1 Warnung in der Konsole.')
  expect(consoleWarningsLine([{ type: 'Log', message: 'x' }])).toBeUndefined()
})

test('(r2) "Ziel" only as a tab: no header knob, the narrow pane reaches it by paging', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    viewport: { columns: 29, rows: 30 },
    props: { ...PANE.props, bodyColumns: 29, scroll: { offset: 0, bodyRows: 30 } },
  })
  expect(await ui.find({ type: 'Button', key: 'settings' })).toBeUndefined()
  await reveal(ui, 'tab-target')
  await settle(world, ui.press({ key: 'tab-target' }))
  expect((await findShown(ui, /Worauf Claude arbeitet/))?.text).toBeDefined()
  await ui.unmount()
  stopLive()
})

test('(r3) the result card shows the run wall clock, not the sum of test durations', () => {
  const results = [{ duration: 0.1 }, { duration: 0.2 }]
  expect(runSeconds({ startedAt: 1_000, finishedAt: 13_000, results })).toBe(12)
  expect(runLength(12)).toBe('12 s')
  expect(runLength(runSeconds({ results })!)).toBe('0,3 s') // fallback: the sum, never "0 s"
  expect(runSeconds({ results: [] })).toBeUndefined()
  expect(runLength(125)).toBe('2 min 5 s')
  expect(runLength(0.02)).toBe('0,02 s')
})

test('(r4) "An Claude geben": package messages carry their origin and ask to judge, not to patch the package', () => {
  const hdrp = {
    type: 'Error' as const,
    message: 'Shader error in HDRP/Lit: undeclared identifier',
    stack: 'X () (at ./Library/PackageCache/com.unity.render-pipelines.high-definition@17.0.3/Runtime/Lit.cs:42)',
  }
  const ours = { type: 'Exception' as const, message: 'NullReferenceException', stack: 'Player.Update () (at Assets/Scripts/Player.cs:12)' }
  const one = consolePrompt([{ entry: hdrp, count: 1 }])
  expect(one).toContain('Fehler aus Paket com.unity.render-pipelines.high-definition')
  expect(one).toContain('ordne ein, ob unser Code ihn auslöst')
  expect(one).toContain('Das Paket selbst nicht ändern')
  expect(one).toContain('Herkunft: Paket com.unity.render-pipelines.high-definition · Lit.cs:42')
  expect(one).not.toContain('behebe die Ursache')
  expect(consolePrompt([{ entry: ours, count: 1 }])).toMatch(/^Kläre diese Meldung .* behebe die Ursache \(Exception\):\n\nHerkunft: Player\.cs:12/)
  const mixed = consolePrompt([
    { entry: ours, count: 2 },
    { entry: hdrp, count: 1 },
  ])
  const [mine, theirs] = mixed.split('\n\n---\n\n')
  expect(mine).toContain('(1 Fehler aus unserem Code)')
  expect(mine).toContain('[×2] NullReferenceException')
  expect(mine).not.toContain('HDRP')
  expect(theirs).toContain('Shader error in HDRP/Lit')
  expect(theirs).not.toContain('NullReferenceException')
})

test('(r5) Ziel tab narrow: the pill goes below a one-word title, the restore list wraps instead of being cut', async ($, on) => {
  const restore = ['unity/Packages/manifest.json', 'unity/Packages/packages-lock.json', 'unity/ProjectSettings/x.asset']
  const world = fakeWorld(on, { config: { restoreBeforeCommit: restore } })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  for (const cols of [29, 60]) {
    const ui = await $.ui.mount({
      ...PANE,
      surface: 'desktop',
      viewport: { columns: cols, rows: 40 },
      props: { ...PANE.props, bodyColumns: cols, scroll: { offset: 0, bodyRows: 40 } },
    })
    await reveal(ui, 'tab-target')
    await settle(world, ui.press({ key: 'tab-target' }))
    const value = (await ui.findAll({ type: 'Text' })).find(t => t.text === restore.join(', '))
    expect(value).toBeDefined()
    expect(value!.props.wrap).toBe('wrap') // a list this long wraps at any width; before, it was cut in the middle
    // the title row: narrow → title and pill are not siblings in one row
    const nodes = (await (ui as unknown as { findAll: (q: object) => Promise<Node[]> }).findAll({})) as Node[]
    expect(nodes.some(n => n.text === 'Projekt-Einstellungen')).toBe(true)
    await ui.unmount()
  }
  stopLive()
})

test('(r6) live watch: the band/pane call start it once per loaded copy and retry after a refusal', () => {
  // session start alone: tests/live-start.test.tsx (own file = own process, no watch left over from other tests)
  stopLive()
  let started = 0
  let refuse = true
  const fake = {
    clock: {
      every: () => {
        if (refuse) throw new Error('refused while drawing')
        started++
        return { cancel() {} }
      },
    },
  } as never
  ensureLive(fake, {} as never)
  expect(liveOn()).toBe(false) // refused: no flag set, the next draw retries
  refuse = false
  ensureLive(fake, {} as never)
  ensureLive(fake, {} as never)
  expect(started).toBe(1)
  expect(liveOn()).toBe(true)
  stopLive()
})
