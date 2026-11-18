/**
 * Typed client of the bridge's provider-backed commands (bridge 0.2+, `Editor/BridgePlay.cs`): capture, goto,
 * perf_record, sound_list / sound_play / sound_stop, mix_get / mix_set. Pure: every function takes a `send` (in the mod
 * `features/state.ts` binds it to bridgeCommand, which checks project + heartbeat first) and returns the parsed data or
 * `{ error, code? }`. Never throws.
 *
 * What the data means comes from the project: a spot is whatever its IClaudeSpotProvider writes (free-form JSON), sound
 * ids and mix groups are its IClaudeSoundBoard's. Without a provider the bridge answers `code: 'no-provider'`.
 */
import type { BridgeCommand, BridgeResult } from './bridge'

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
  /** Why the recording stopped early (Play mode ended). */
  aborted?: string
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
      error: `The installed editor bridge cannot ${what} yet. Update com.denny99.claude-bridge to 0.2.0 or newer.`,
    }
  if (/^no answer from the bridge/i.test(res.error)) return { code: 'timeout', error: `${res.error} (${what}).` }
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
    ...(aborted ? { aborted } : {}),
    ...(spot ? { spot } : {}),
  }
}

export function parseSounds(d: Record<string, unknown>): SoundInfo[] {
  return (Array.isArray(d.sounds) ? d.sounds : []).flatMap(s => {
    const o = obj(s)
    const id = o && str(o.id)
    if (!o || !id) return []
    const group = str(o.group)
    return [
      { id, name: str(o.name) ?? id, ...(group ? { group } : {}), duration: num(o.duration), takes: num(o.takes, 1) },
    ]
  })
}

export function parseMix(d: Record<string, unknown>): MixGroup[] {
  return (Array.isArray(d.groups) ? d.groups : []).flatMap(g => {
    const o = obj(g)
    const group = o && str(o.group)
    return o && group ? [{ group, db: num(o.db) }] : []
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
  if (!res.ok) return playError(res, 'capture the view')
  const out = parseCapture(res.data)
  return out.path ? out : { error: 'The bridge answered capture without a picture path.' }
}

/** Jumps to a spot from an earlier capture (object or its JSON text). Answers with the spot reached, if any. */
export async function gotoSpot(send: Send, spot: Spot | string): Promise<{ spot?: Spot } | PlayError> {
  const text = typeof spot === 'string' ? spot.trim() : JSON.stringify(spot)
  if (!text || !text.startsWith('{'))
    return { code: 'bad-input', error: 'A spot is a JSON object from an earlier capture.' }
  const res = await send({ cmd: 'goto', spot: text }, GOTO_TIMEOUT_MS)
  if (!res.ok) {
    if (res.code === 'no-provider')
      return {
        code: 'no-provider',
        error: 'This project offers no jump to a spot (it registers no IClaudeSpotProvider).',
      }
    return playError(res, 'jump to a spot')
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
      return { code: 'not-playing', error: 'A perf recording needs Play mode: press Play first.' }
    return playError(res, 'record frame times')
  }
  return parsePerf(res.data) ?? { error: 'The bridge answered perf_record without data.' }
}

const NO_BOARD = 'This project offers no sound board (it registers no IClaudeSoundBoard).'

function soundError(res: { error: string; code?: string }, what: string): PlayError {
  return res.code === 'no-provider' ? { code: 'no-provider', error: NO_BOARD } : playError(res, what)
}

export async function soundList(send: Send): Promise<{ sounds: SoundInfo[] } | PlayError> {
  const res = await send({ cmd: 'sound_list' }, SOUND_TIMEOUT_MS)
  return res.ok ? { sounds: parseSounds(res.data) } : soundError(res, 'list sounds')
}

export async function soundPlay(
  send: Send,
  sound: string,
  mode: 'near' | 'flat' = 'near',
): Promise<{ sound: string; mode: 'near' | 'flat' } | PlayError> {
  if (!sound) return { code: 'bad-input', error: 'Which sound? (an id from the sound list)' }
  const res = await send({ cmd: 'sound_play', sound, mode }, SOUND_TIMEOUT_MS)
  return res.ok ? { sound, mode } : soundError(res, 'play a sound')
}

export async function soundStop(send: Send): Promise<{ stopped: true } | PlayError> {
  const res = await send({ cmd: 'sound_stop' }, SOUND_TIMEOUT_MS)
  return res.ok ? { stopped: true } : soundError(res, 'stop sounds')
}

export async function mixGet(send: Send): Promise<{ groups: MixGroup[] } | PlayError> {
  const res = await send({ cmd: 'mix_get' }, SOUND_TIMEOUT_MS)
  return res.ok ? { groups: parseMix(res.data) } : soundError(res, 'read the mix')
}

/** Sets one group's volume (dB, clamped to -80..20); the project persists it. Answers with the whole mix. */
export async function mixSet(send: Send, group: string, db: number): Promise<{ groups: MixGroup[] } | PlayError> {
  if (!group) return { code: 'bad-input', error: 'Which mix group?' }
  if (!Number.isFinite(db)) return { code: 'bad-input', error: 'The volume must be a number in dB.' }
  const res = await send({ cmd: 'mix_set', group, db: Math.min(20, Math.max(-80, db)) }, SOUND_TIMEOUT_MS)
  return res.ok ? { groups: parseMix(res.data) } : soundError(res, 'set the mix')
}

export function isPlayError(v: unknown): v is PlayError {
  return !!v && typeof v === 'object' && typeof (v as PlayError).error === 'string'
}
