/**
 * Typed client of the bridge's provider-backed commands (bridge 0.2+, `Editor/BridgePlay.cs`): capture, goto,
 * perf_record, sound_list / sound_play / sound_stop, mix_get / mix_set. Pure: every function takes a `send` (in the mod
 * `features/state.ts` binds it to bridgeCommand, which checks project + heartbeat first) and returns the parsed data or
 * `{ error, code? }`. Never throws.
 *
 * What the data means comes from the project: a spot is whatever its IClaudeSpotProvider writes (free-form JSON), sound
 * ids and mix groups are its IClaudeSoundBoard's. Without a provider the bridge answers `code: 'no-provider'`.
 */
import { BRIDGE_VERSION, type BridgeCommand, type BridgeResult } from './bridge'

export type Send = (command: BridgeCommand, timeoutMs: number) => Promise<BridgeResult>

/**
 * `no-provider` the project registered no provider for this · `not-playing` needs Play mode · `busy` one already runs ·
 * `batchmode` no Game view in a batchmode editor · `aborted` / `no-frames` perf_record ended without (full) data ·
 * `bad-input` · `outdated` the installed bridge does not know the command · `timeout` · `no-project` · `bridge-down` · `bridge-busy` the editor is busy running tests (stale heartbeat).
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

export type PlayError = { error: string; code?: PlayErrorCode | (string & {}) }

/** Free-form JSON object from the project's IClaudeSpotProvider.Capture(). */
export type Spot = Record<string, unknown>

export type Vec3 = [number, number, number]

export interface CaptureResult {
  /** PNG of the Game view (Play mode, UI included) or of the main camera (Edit mode). */
  path: string
  playing: boolean
  scene?: string
  /** A spot provider is registered (else `spot` is absent and only the camera says where). */
  provider: boolean
  camera?: { name: string; position: Vec3; rotation: Vec3; fov: number }
  spot?: Spot
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

/** The bridge gives up after 2 × seconds + 5 s of wall clock (paused / throttled editor); wait a bit longer. */
export function perfTimeoutMs(seconds: number): number {
  return Math.round(seconds * 2000) + 10000
}

export async function capture(
  send: Send,
  opts: { path?: string; width?: number; height?: number } = {},
): Promise<CaptureResult | PlayError> {
  const res = await send({ cmd: 'capture', ...opts }, CAPTURE_TIMEOUT_MS)
  if (!res.ok) return playError(res, 'die Ansicht aufnehmen')
  const out = parseCapture(res.data)
  return out.path ? out : { error: 'Der Editor hat aufgenommen, aber keinen Bildpfad gemeldet.' }
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
export async function perfRecord(send: Send, seconds: number): Promise<PerfResult | PlayError> {
  const s = Math.min(PERF_MAX_SECONDS, Math.max(0.5, Number.isFinite(seconds) ? seconds : 5))
  const res = await send({ cmd: 'perf_record', seconds: s }, perfTimeoutMs(s))
  if (!res.ok) {
    if (res.code === 'not-playing')
      return { code: 'not-playing', error: 'Messen geht nur im Play-Modus: erst Play drücken.' }
    return playError(res, 'Frame-Zeiten messen')
  }
  return parsePerf(res.data) ?? { error: 'Der Editor hat gemessen, aber keine Werte gemeldet.' }
}

const NO_BOARD = 'Dieses Projekt hat kein Soundboard (es hat dafür nichts registriert).'

function soundError(res: { error: string; code?: string }, what: string): PlayError {
  return res.code === 'no-provider' ? { code: 'no-provider', error: NO_BOARD } : playError(res, what)
}

export async function soundList(send: Send): Promise<{ sounds: SoundInfo[] } | PlayError> {
  const res = await send({ cmd: 'sound_list' }, SOUND_TIMEOUT_MS)
  return res.ok ? { sounds: parseSounds(res.data) } : soundError(res, 'Klänge auflisten')
}

export async function soundPlay(
  send: Send,
  sound: string,
  mode: 'near' | 'flat' = 'near',
): Promise<{ sound: string; mode: 'near' | 'flat' } | PlayError> {
  if (!sound) return { code: 'bad-input', error: 'Welcher Klang? (eine Kennung aus der Klangliste)' }
  const res = await send({ cmd: 'sound_play', sound, mode }, SOUND_TIMEOUT_MS)
  return res.ok ? { sound, mode } : soundError(res, 'einen Klang abspielen')
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
