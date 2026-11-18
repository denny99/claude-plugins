/**
 * Typed client of the bridge's provider-backed commands (bridge 0.2+, `Editor/BridgePlay.cs`): capture, goto,
 * perf_record, sound_list / sound_play / sound_stop, mix_get / mix_set. Pure: every function takes a `send` (in the mod
 * `features/state.ts` binds it to bridgeCommand, which checks project + heartbeat first) and returns the parsed data or
 * `{ error, code? }`. Never throws.
 *
 * What the data means comes from the project: a spot is whatever its IClaudeSpotProvider writes (free-form JSON), sound
 * ids and mix groups are its IClaudeSoundBoard's. Without a provider the bridge answers `code: 'no-provider'`.
 */
import { BRIDGE_VERSION, SHOT_WAY, versionOlder, type BridgeCommand, type BridgeResult } from './bridge'

export type Send = (command: BridgeCommand, timeoutMs: number) => Promise<BridgeResult>

/**
 * `no-provider` the project registered no provider for this · `not-playing` needs Play mode · `busy` one already runs ·
 * `batchmode` no Game view in a batchmode editor · `aborted` / `no-frames` perf_record ended without (full) data ·
 * `bad-input` · `outdated` the installed bridge does not know the command · `timeout` · `no-project` · `bridge-down` · `bridge-busy` the editor is busy running tests (stale heartbeat).
 * `sound-refused` (bridge 0.4+) the project refused to play the sound (e.g. no world loaded); the text is the project's.
 */
export type PlayErrorCode =
  | 'no-provider'
  | 'not-playing'
  | 'busy'
  | 'batchmode'
  | 'aborted'
  | 'no-frames'
  | 'bad-input'
  | 'outdated'
  | 'timeout'
  | 'no-project'
  | 'bridge-down'
  | 'bridge-busy'
  | 'sound-refused'

export type PlayError = { error: string; code?: PlayErrorCode | (string & {}) }

/** Free-form JSON object from the project's IClaudeSpotProvider.Capture(). */
export type Spot = Record<string, unknown>

export type Vec3 = [number, number, number]

/**
 * What a picture shows (bridge 0.4+): `game` the Game view's own frame (all UI), `cameras` cameras + uGUI (no UI
 * Toolkit panel on screen), `no-toolkit` cameras only although UI Toolkit panels are on screen (menu/HUD missing,
 * Unity was in the background), `camera` Edit mode. Absent from older bridges.
 */
export type ShotUi = 'game' | 'cameras' | 'no-toolkit' | 'camera'

export interface CaptureResult {
  /** PNG of the Game view (Play mode, UI included) or of the main camera (Edit mode). */
  path: string
  playing: boolean
  scene?: string
  /** A spot provider is registered (else `spot` is absent and only the camera says where). */
  provider: boolean
  camera?: { name: string; position: Vec3; rotation: Vec3; fov: number }
  spot?: Spot
  /** Bridge 0.4+: what the picture shows (see {@link ShotUi}). */
  ui?: ShotUi
}

/** The bridge's `ui` field, if it is one of the known values. */
export function parseShotUi(v: unknown): ShotUi | undefined {
  return v === 'game' || v === 'cameras' || v === 'no-toolkit' || v === 'camera' ? v : undefined
}

/** For the human: a picture without its UI Toolkit menu/HUD; undefined for every complete picture. */
export function shotUiNote(ui: ShotUi | undefined): string | undefined {
  return ui === 'no-toolkit'
    ? 'Bild ohne Oberfläche: Menü/HUD (UI Toolkit) fehlen – Unity war im Hintergrund'
    : undefined
}

/** For Claude's prompt: how to read a picture without its UI Toolkit layer; undefined for every complete picture. */
export function shotUiPrompt(ui: ShotUi | undefined): string | undefined {
  return ui === 'no-toolkit'
    ? 'Hinweis zum Bild: Unity war im Hintergrund, das Bild zeigt nur, was die Kameras zeichnen. Menü und HUD (UI Toolkit) fehlen darauf, obwohl sie im Spiel zu sehen sind. Fehlende Oberfläche ist hier kein Fehler des Spiels.'
    : undefined
}

export interface PerfCost {
  name: string
  /** Mean over all recorded frames (frames the source did not report count as 0). */
  avgMs: number
  maxMs: number
  /** Mean over the hitch frames (> budgetMs) only. */
  hitchAvgMs: number
  hitchMaxMs: number
  /** Share of the total hitch-frame time, 0..1. */
  hitchShare: number
}

export interface PerfResult {
  /** Recorded frame time in seconds (less than requested when `aborted`). */
  seconds: number
  requestedSeconds: number
  frames: number
  /** 16.6 ms: a frame above it is a hitch. */
  budgetMs: number
  avgMs: number
  p50: number
  p95: number
  p99: number
  worst: number
  /** Frames above budgetMs. */
  hitches: number
  /** Frames per series point; each point is the WORST frame of its bucket (≤ 200 points). */
  seriesStep: number
  series: number[]
  /** Named costs from the project's IClaudePerfSource(s), biggest share of the hitches first. Empty without source. */
  costs: PerfCost[]
  /** How many cost sources the project registered (missing from older bridges; untested in the editor). */
  sources?: number
  /** Why the recording stopped early (Play mode ended). */
  aborted?: string
  /** Wall-clock length of the recording (newer bridges; ungetestet im Editor). */
  wallSeconds?: number
  /** Seconds since Play mode started when the recording began (newer bridges). */
  sincePlay?: number
  /** Seconds into the recording at which the worst frame ended (newer bridges). */
  worstAt?: number
  /** The spot at the start of the recording, if the project has a spot provider. */
  spot?: Spot
  /** Bridge 0.4+: Unity was not the frontmost app during the recording. */
  background?: boolean
  /** Bridge 0.4+: Application.runInBackground during the recording. */
  runInBackground?: boolean
}

export interface SoundInfo {
  id: string
  name: string
  group?: string
  /** Seconds. */
  duration: number
  takes: number
}

export interface MixGroup {
  group: string
  db: number
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const obj = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
const vec = (v: unknown): Vec3 => (Array.isArray(v) ? [num(v[0]), num(v[1]), num(v[2])] : [0, 0, 0])

/** A failed result with a sentence the panel can show as is. */
export function playError(res: { error: string; code?: string }, what: string): PlayError {
  if (/unknown command/i.test(res.error))
    return {
      code: 'outdated',
      error: `Das Unity-Paket Claude Bridge im Projekt kann ${what} noch nicht. Aktualisieren: Unity → Package Manager → Claude Bridge → Update (Version ${BRIDGE_VERSION} oder neuer).`,
    }
  if (res.code === 'timeout') return { code: 'timeout', error: `${res.error} (${what}).` }
  return res.code ? { error: res.error, code: res.code } : { error: res.error }
}

export function parseCapture(d: Record<string, unknown>): CaptureResult {
  const cam = obj(d.camera)
  const spot = obj(d.spot)
  const scene = str(d.scene)
  const ui = parseShotUi(d.ui)
  return {
    path: String(d.path ?? ''),
    playing: d.playing === true,
    ...(scene ? { scene } : {}),
    provider: d.provider === true,
    ...(cam
      ? {
          camera: {
            name: String(cam.name ?? ''),
            position: vec(cam.position),
            rotation: vec(cam.rotation),
            fov: num(cam.fov),
          },
        }
      : {}),
    ...(spot ? { spot } : {}),
    ...(ui ? { ui } : {}),
  }
}

export function parsePerf(d: Record<string, unknown>): PerfResult | undefined {
  const p = obj(d.perf)
  if (!p) return undefined
  const spot = obj(d.spot)
  const aborted = str(p.aborted)
  return {
    seconds: num(p.seconds),
    requestedSeconds: num(p.requestedSeconds),
    frames: num(p.frames),
    budgetMs: num(p.budgetMs, 16.6),
    avgMs: num(p.avgMs),
    p50: num(p.p50),
    p95: num(p.p95),
    p99: num(p.p99),
    worst: num(p.worst),
    hitches: num(p.hitches),
    seriesStep: num(p.seriesStep, 1),
    series: Array.isArray(p.series) ? p.series.map(v => num(v)) : [],
    costs: (Array.isArray(p.costs) ? p.costs : []).map(c => {
      const o = obj(c) ?? {}
      return {
        name: String(o.name ?? ''),
        avgMs: num(o.avgMs),
        maxMs: num(o.maxMs),
        hitchAvgMs: num(o.hitchAvgMs),
        hitchMaxMs: num(o.hitchMaxMs),
        hitchShare: num(o.hitchShare),
      }
    }),
    ...(typeof p.sources === 'number' ? { sources: p.sources } : {}),
    ...(typeof p.wallSeconds === 'number' && p.wallSeconds > 0 ? { wallSeconds: p.wallSeconds } : {}),
    ...(typeof p.sincePlay === 'number' ? { sincePlay: p.sincePlay } : {}),
    ...(typeof p.worstAt === 'number' ? { worstAt: p.worstAt } : {}),
    ...(aborted ? { aborted } : {}),
    ...(typeof p.background === 'boolean' ? { background: p.background } : {}),
    ...(typeof p.runInBackground === 'boolean' ? { runInBackground: p.runInBackground } : {}),
    ...(spot ? { spot } : {}),
  }
}

/** A board text for the panel: no control characters (a Pane drops its whole tree over one), one line, capped. */
export function boardText(v: unknown, max = 120): string | undefined {
  if (typeof v !== 'string') return undefined
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  return [...t].length > max ? `${[...t].slice(0, max - 1).join('')}…` : t
}

/** The board's sounds, cleaned (see `boardText`) and with each id once: ids become keys in the pane. */
export function parseSounds(d: Record<string, unknown>): SoundInfo[] {
  const seen = new Set<string>()
  return (Array.isArray(d.sounds) ? d.sounds : []).flatMap(s => {
    const o = obj(s)
    // ids are sent back to the bridge as they came: only refuse ones a pane key or a command could not carry
    const id = o && str(o.id)
    // eslint-disable-next-line no-control-regex
    if (!o || !id || id.length > 200 || /[\x00-\x1f\x7f]/.test(id) || seen.has(id)) return []
    seen.add(id)
    const group = boardText(o.group, 60)
    return [
      {
        id,
        name: boardText(o.name) ?? boardText(id) ?? id,
        ...(group ? { group } : {}),
        duration: num(o.duration),
        takes: num(o.takes, 1),
      },
    ]
  })
}

export function parseMix(d: Record<string, unknown>): MixGroup[] {
  return (Array.isArray(d.groups) ? d.groups : []).flatMap(g => {
    const o = obj(g)
    // the name goes back to the bridge in mix_set as it came; one a pane key could not carry is left out
    const group = o && str(o.group)
    // eslint-disable-next-line no-control-regex
    return o && group && group.length <= 200 && !/[\x00-\x1f\x7f]/.test(group) ? [{ group, db: num(o.db) }] : []
  })
}

export const CAPTURE_TIMEOUT_MS = 20000
export const GOTO_TIMEOUT_MS = 15000
export const SOUND_TIMEOUT_MS = 10000
export const PERF_MAX_SECONDS = 120

/** First bridge whose perf_record gives up after seconds + 5 s of wall clock (before: 2 × seconds + 5 s). */
export const PERF_STOPWATCH_SINCE = '0.4.0'

/**
 * How long the mod waits for a recording: the bridge's own emergency stop plus 5 s. Bridge 0.4+ stops after
 * seconds + 5 s; an older one (or one that names no version) after 2 × seconds + 5 s.
 */
export function perfTimeoutMs(seconds: number, bridgeVersion?: string): number {
  const old = !bridgeVersion || versionOlder(bridgeVersion, PERF_STOPWATCH_SINCE)
  return Math.round(seconds * (old ? 2000 : 1000)) + 10000
}

export async function capture(
  send: Send,
  opts: { path?: string; width?: number; height?: number; askedAt?: number } = {},
): Promise<CaptureResult | PlayError> {
  const { askedAt, ...cmd } = opts
  const res = await send({ cmd: 'capture', ...cmd }, CAPTURE_TIMEOUT_MS)
  if (!res.ok) return playError(res, 'die Ansicht aufnehmen')
  const out = parseCapture(res.data)
  if (!out.path) return { error: 'Der Editor hat aufgenommen, aber keinen Bildpfad gemeldet.' }
  const stale = staleShot(res.data, cmd.path ?? out.path, askedAt ?? 0)
  return stale ? { code: 'stale', error: stale } : out
}

/**
 * A picture that is not the one just asked for: another path than the fresh one sent, or (bridge 0.3.1+, `takenAt`)
 * taken before the request. Such a picture must not pass as new (live: an old picture came back while Unity was in
 * the background). `askedAt` 0 skips the time check.
 */
export function staleShot(data: Record<string, unknown>, asked: string, askedAt: number): string | undefined {
  const norm = (x: string): string => x.replace(/\\/g, '/').toLowerCase()
  const got = typeof data.path === 'string' ? data.path : ''
  if (got && norm(got) !== norm(asked)) return `Unity hat ein anderes Bild geliefert als angefragt (${got}). ${SHOT_WAY}`
  // the bridge's clock is the same machine's; 2 s slack for file times
  if (askedAt > 0 && typeof data.takenAt === 'number' && data.takenAt > 0 && data.takenAt < askedAt - 2000)
    return `Unity hat ein altes Bild geliefert (aufgenommen vor der Anfrage). ${SHOT_WAY}`
  return undefined
}

/** Jumps to a spot from an earlier capture (object or its JSON text). Answers with the spot reached, if any. */
export async function gotoSpot(send: Send, spot: Spot | string): Promise<{ spot?: Spot } | PlayError> {
  const text = typeof spot === 'string' ? spot.trim() : JSON.stringify(spot)
  if (!text || !text.startsWith('{'))
    return { code: 'bad-input', error: 'Eine Stelle ist ein JSON-Objekt aus einer früheren Aufnahme.' }
  const res = await send({ cmd: 'goto', spot: text }, GOTO_TIMEOUT_MS)
  if (!res.ok) {
    if (res.code === 'no-provider')
      return {
        code: 'no-provider',
        error: 'Dieses Projekt kann nicht zu einer Stelle springen (es hat dafür nichts registriert).',
      }
    return playError(res, 'zu einer Stelle springen')
  }
  const reached = obj(res.data.spot)
  return reached ? { spot: reached } : {}
}

/** Records frame times for `seconds` (clamped to 0.5..120) in Play mode; resolves when the recording is done. */
export async function perfRecord(send: Send, seconds: number, bridgeVersion?: string): Promise<PerfResult | PlayError> {
  const s = Math.min(PERF_MAX_SECONDS, Math.max(0.5, Number.isFinite(seconds) ? seconds : 5))
  const res = await send({ cmd: 'perf_record', seconds: s }, perfTimeoutMs(s, bridgeVersion))
  if (!res.ok) {
    if (res.code === 'not-playing')
      return { code: 'not-playing', error: 'Messen geht nur im Play-Modus: erst Play drücken.' }
    return playError(res, 'Frame-Zeiten messen')
  }
  return parsePerf(res.data) ?? { error: 'Der Editor hat gemessen, aber keine Werte gemeldet.' }
}

const NO_BOARD = 'Dieses Projekt hat kein Soundboard (es hat dafür nichts registriert).'

function soundError(res: { error: string; code?: string }, what: string): PlayError {
  if (res.code === 'sound-refused') return { code: 'sound-refused', error: soundRefusedText(res.error) }
  return res.code === 'no-provider' ? { code: 'no-provider', error: NO_BOARD } : playError(res, what)
}

/** The project refused a sound (bridge 0.4+, `sound-refused`): in German, the project's own text cleaned. */
export function soundRefusedText(projectText: string): string {
  if (/running game|play mode/i.test(projectText))
    return 'Erst eine Welt betreten – im Hauptmenü gibt es keine Klangbühne.'
  const t = boardText(projectText, 200)
  return t ? `Das Spiel hat den Klang abgelehnt: ${t}` : 'Das Spiel hat den Klang abgelehnt.'
}

export interface SoundPlayed {
  sound: string
  mode: 'near' | 'flat'
  /** Bridge 0.4+: the Game view's „Mute Audio“ is on. */
  muted?: boolean
  /** Bridge 0.4+: Unity is the frontmost app. Absent: an older bridge. */
  focused?: boolean
  /** Bridge 0.4+: Application.runInBackground while the sound plays. */
  runInBackground?: boolean
}

/** Why a sound that played may still be silent: each a German line; `front` asks for the „Unity vorn“ button. */
export function soundHints(r: Pick<SoundPlayed, 'muted' | 'focused' | 'runInBackground'>): { text: string; front?: true }[] {
  const out: { text: string; front?: true }[] = []
  if (r.muted) out.push({ text: 'Ton ist im Game-Tab stumm geschaltet (Mute Audio)' })
  // an older bridge says nothing about focus: then the editor may well pause its audio in the background
  if (r.focused === undefined || (r.focused === false && r.runInBackground !== true))
    out.push({ text: 'Unity im Hintergrund – Klang erst hörbar, wenn Unity vorn ist', front: true })
  return out
}

export async function soundList(send: Send): Promise<{ sounds: SoundInfo[] } | PlayError> {
  const res = await send({ cmd: 'sound_list' }, SOUND_TIMEOUT_MS)
  return res.ok ? { sounds: parseSounds(res.data) } : soundError(res, 'Klänge auflisten')
}

export async function soundPlay(
  send: Send,
  sound: string,
  mode: 'near' | 'flat' = 'near',
): Promise<SoundPlayed | PlayError> {
  if (!sound) return { code: 'bad-input', error: 'Welcher Klang? (eine Kennung aus der Klangliste)' }
  const res = await send({ cmd: 'sound_play', sound, mode }, SOUND_TIMEOUT_MS)
  if (!res.ok) return soundError(res, 'einen Klang abspielen')
  const d = res.data
  return {
    sound,
    mode,
    ...(typeof d.muted === 'boolean' ? { muted: d.muted } : {}),
    ...(typeof d.focused === 'boolean' ? { focused: d.focused } : {}),
    ...(typeof d.runInBackground === 'boolean' ? { runInBackground: d.runInBackground } : {}),
  }
}

export async function soundStop(send: Send): Promise<{ stopped: true } | PlayError> {
  const res = await send({ cmd: 'sound_stop' }, SOUND_TIMEOUT_MS)
  return res.ok ? { stopped: true } : soundError(res, 'Klänge stoppen')
}

export async function mixGet(send: Send): Promise<{ groups: MixGroup[] } | PlayError> {
  const res = await send({ cmd: 'mix_get' }, SOUND_TIMEOUT_MS)
  return res.ok ? { groups: parseMix(res.data) } : soundError(res, 'den Mix lesen')
}

/** Sets one group's volume (dB, clamped to -80..20); the project persists it. Answers with the whole mix. */
export async function mixSet(send: Send, group: string, db: number): Promise<{ groups: MixGroup[] } | PlayError> {
  if (!group) return { code: 'bad-input', error: 'Welche Mix-Gruppe?' }
  if (!Number.isFinite(db)) return { code: 'bad-input', error: 'Die Lautstärke muss eine Zahl in dB sein.' }
  const res = await send({ cmd: 'mix_set', group, db: Math.min(20, Math.max(-80, db)) }, SOUND_TIMEOUT_MS)
  return res.ok ? { groups: parseMix(res.data) } : soundError(res, 'den Mix setzen')
}

export function isPlayError(v: unknown): v is PlayError {
  return !!v && typeof v === 'object' && typeof (v as PlayError).error === 'string'
}
