/**
 * Client of the editor bridge package (bridge/com.denny99.claude-bridge). FILE QUEUE, no sockets: a socket does not
 * survive Unity's domain reload, files do. Everything lives in `<project>/Temp/ClaudeBridge/` (Unity wipes Temp/ when
 * the editor closes, so a stale folder never outlives the editor for long):
 *
 * - `status.json`  — heartbeat the bridge rewrites every second: `{ updatedAt, pid, unityVersion, projectPath,
 *                    isCompiling, isPlaying, isPaused, compileSeq, scene, batchmode?, bridgeVersion?, focused?, runInBackground? }`. Older than {@link STALE_MS} → bridge down (10 s: a domain reload pauses the heartbeat for a few seconds).
 * - `cmd-<id>.json` — written by the mod: one flat object `{ id, cmd, mode?, filter?, path?, width?, height?, spot?,
 *                    seconds?, sound?, group?, db? }`. The
 *                    bridge picks it up on EditorApplication.update and deletes it.
 * - `result-<id>.json` — written by the bridge (tmp + rename, retried): `{ id, ok, error?, code?, ...data }`.
 * - `compile.json`  — the last compile: `{ seq, finishedAt, messages: [{ severity, message, file, line, column, code? }] }`,
 *                    written in compilationFinished, i.e. BEFORE the domain reload.
 * - `console.json`  — the last 300 log entries `{ entries: [{ seq, type, message, stack, time }] }`.
 * - `tests.json`    — the current/last test run (see unity.ts parseBridgeTests).
 *
 * The mod cannot delete or rename files (`$.fs` has neither), so the bridge cleans old results itself.
 */
import type { Host, HostFs } from './host'
import { join } from './path'
import { germanBridgeError } from './messages'
import { parseBridgeTests, type CompilerMessage, type TestRun } from './unity'

export const STALE_MS = 10000

export interface BridgeStatus {
  updatedAt: number
  unityVersion?: string
  projectPath?: string
  isCompiling: boolean
  isPlaying: boolean
  isPaused: boolean
  compileSeq: number
  scene?: string
  /** Active scene's name (newer bridges; set in Play mode, "" for an unsaved "Untitled" scene). */
  sceneName?: string
  /** First enabled Build Settings scene (newer bridges; ungetestet im Editor). */
  startScene?: string
  /** The editor runs with -batchmode (no window: Play-mode screenshots cannot work). Absent from older bridges. */
  batchmode?: boolean
  /** The package version of the bridge itself (absent from bridges before it reported one). */
  bridgeVersion?: string
  /** Process id of the editor (lib/front.ts brings that window to the front). */
  pid?: number
  /** Bridge 0.4+: Unity is the frontmost app; absent from older bridges. */
  focused?: boolean
  /** Bridge 0.4+: Application.runInBackground right now (the bridge leases it on while a Play-mode job runs). */
  runInBackground?: boolean
}

/** The bridge version this plugin ships (bridge/com.denny99.claude-bridge/package.json; a test keeps them equal). */
export const BRIDGE_VERSION = '0.4.0'

/** `a` is an older version than `b` (numeric x.y.z compare; anything unparsable counts as not older). */
export function versionOlder(a: string, b: string): boolean {
  const pa = /^(\d+)\.(\d+)\.(\d+)/.exec(a)
  const pb = /^(\d+)\.(\d+)\.(\d+)/.exec(b)
  if (!pa || !pb) return false
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d) return d < 0
  }
  return false
}

export interface ConsoleEntry {
  seq: number
  type: 'Error' | 'Assert' | 'Warning' | 'Log' | 'Exception'
  message: string
  stack?: string
  time?: number
}

export interface CompileInfo {
  seq: number
  finishedAt?: number
  messages: CompilerMessage[]
}

export function bridgeDir(project: string): string {
  return join(project, 'Temp', 'ClaudeBridge')
}

async function readJson(
  fs: Pick<HostFs, 'read' | 'exists'>,
  file: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    if (!(await fs.exists(file))) return undefined
    const v = JSON.parse(await fs.read(file)) as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/** The heartbeat, or why the bridge counts as down (`missing` | `stale`). */
export async function readStatus(
  fs: Pick<HostFs, 'read' | 'exists'>,
  project: string,
  now: number,
): Promise<{ up: true; status: BridgeStatus } | { up: false; why: 'missing' | 'stale'; status?: BridgeStatus }> {
  const raw = await readJson(fs, join(bridgeDir(project), 'status.json'))
  if (!raw) return { up: false, why: 'missing' }
  const status: BridgeStatus = {
    updatedAt: Number(raw.updatedAt ?? 0),
    isCompiling: raw.isCompiling === true,
    isPlaying: raw.isPlaying === true,
    isPaused: raw.isPaused === true,
    compileSeq: Number(raw.compileSeq ?? 0),
  }
  if (raw.unityVersion) status.unityVersion = String(raw.unityVersion)
  if (raw.projectPath) status.projectPath = String(raw.projectPath)
  if (raw.scene) status.scene = String(raw.scene)
  if (typeof raw.sceneName === 'string' && raw.sceneName) status.sceneName = raw.sceneName
  if (typeof raw.startScene === 'string' && raw.startScene) status.startScene = raw.startScene
  if (typeof raw.batchmode === 'boolean') status.batchmode = raw.batchmode
  if (typeof raw.bridgeVersion === 'string' && raw.bridgeVersion) status.bridgeVersion = raw.bridgeVersion
  if (typeof raw.pid === 'number' && Number.isInteger(raw.pid) && raw.pid > 0) status.pid = raw.pid
  if (typeof raw.focused === 'boolean') status.focused = raw.focused
  if (typeof raw.runInBackground === 'boolean') status.runInBackground = raw.runInBackground
  if (now - status.updatedAt > STALE_MS) return { up: false, why: 'stale', status }
  return { up: true, status }
}

/** The compiler code: the bridge's `code` field, else (older bridges) the CSxxxx in the message. */
function codeOf(m: Record<string, unknown>): { code?: string } {
  if (typeof m.code === 'string' && m.code) return { code: m.code }
  const found = /\b(CS\d+)\b/.exec(String(m.message ?? ''))?.[1]
  return found ? { code: found } : {}
}

export async function readCompile(
  fs: Pick<HostFs, 'read' | 'exists'>,
  project: string,
): Promise<CompileInfo | undefined> {
  const raw = await readJson(fs, join(bridgeDir(project), 'compile.json'))
  if (!raw) return undefined
  const list = Array.isArray(raw.messages) ? (raw.messages as Record<string, unknown>[]) : []
  return {
    seq: Number(raw.seq ?? 0),
    ...(typeof raw.finishedAt === 'number' ? { finishedAt: raw.finishedAt } : {}),
    messages: list.map(m => ({
      severity: String(m.severity).toLowerCase().startsWith('err') ? ('error' as const) : ('warning' as const),
      message: String(m.message ?? ''),
      ...(m.file ? { file: String(m.file) } : {}),
      ...(typeof m.line === 'number' ? { line: m.line } : {}),
      ...(typeof m.column === 'number' ? { column: m.column } : {}),
      ...codeOf(m),
    })),
  }
}

export async function readConsole(fs: Pick<HostFs, 'read' | 'exists'>, project: string): Promise<ConsoleEntry[]> {
  const raw = await readJson(fs, join(bridgeDir(project), 'console.json'))
  const list = raw && Array.isArray(raw.entries) ? (raw.entries as Record<string, unknown>[]) : []
  return list.map(e => ({
    seq: Number(e.seq ?? 0),
    type: (['Error', 'Assert', 'Warning', 'Log', 'Exception'].includes(String(e.type))
      ? e.type
      : 'Log') as ConsoleEntry['type'],
    message: String(e.message ?? ''),
    ...(e.stack ? { stack: String(e.stack) } : {}),
    ...(typeof e.time === 'number' ? { time: e.time } : {}),
  }))
}

export async function readTests(fs: Pick<HostFs, 'read' | 'exists'>, project: string): Promise<TestRun | undefined> {
  const file = join(bridgeDir(project), 'tests.json')
  try {
    if (!(await fs.exists(file))) return undefined
    return parseBridgeTests(await fs.read(file))
  } catch {
    return undefined
  }
}

export type BridgeCommand =
  | { cmd: 'refresh' }
  | { cmd: 'play' }
  | { cmd: 'stop' }
  | { cmd: 'pause' }
  | { cmd: 'run-tests'; mode: 'EditMode' | 'PlayMode'; filter?: string }
  | { cmd: 'cancel-tests' }
  | { cmd: 'screenshot'; path: string; width?: number; height?: number }
  | { cmd: 'open-scene'; path: string }
  | { cmd: 'select'; path: string }
  | { cmd: 'clear-console' }
  // provider-backed commands (lib/play.ts)
  | { cmd: 'capture'; path?: string; width?: number; height?: number }
  | { cmd: 'goto'; spot: string }
  | { cmd: 'perf_record'; seconds: number }
  | { cmd: 'sound_list' }
  | { cmd: 'sound_play'; sound: string; mode: 'near' | 'flat' }
  | { cmd: 'sound_stop' }
  | { cmd: 'mix_get' }
  | { cmd: 'mix_set'; group: string; db: number }

/** `code` (bridge 0.2+): machine-readable failure kind, e.g. `no-provider`, `not-playing`, `busy`, `batchmode`. */
export type BridgeResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string; code?: string }

let counter = 0

export { germanBridgeError, SHOT_WAY } from './messages'

/** Sleeps on the host clock (no setTimeout in a mod). */
export function sleep(host: Pick<Host, 'after'>, ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    host.after(ms, () => resolve())
  })
}

/**
 * Queues one command and waits for its result file (poll every 200 ms up to `timeoutMs`). Never throws.
 * The caller checks the bridge is up first: the mod only writes into an existing Temp/ClaudeBridge.
 */
export async function sendCommand(
  host: Pick<Host, 'fs' | 'after' | 'now'>,
  project: string,
  command: BridgeCommand,
  timeoutMs = 10000,
): Promise<BridgeResult> {
  const queued = await queueCommand(host, project, command)
  if ('ok' in queued) return queued
  const deadline = queued.at + timeoutMs
  for (;;) {
    const res = await readResult(host.fs, queued.resultFile)
    if (res) return res
    if ((await host.now()) >= deadline)
      return { ok: false, code: 'timeout', error: `Der Editor hat nicht innerhalb von ${Math.round(timeoutMs / 1000)} s geantwortet` }
    await sleep(host, 200)
  }
}

/**
 * Queues one command without waiting: returns where its result will land (for callers that poll it on their own
 * clock, like the perf recording), or the failure to queue it.
 */
export async function queueCommand(
  host: Pick<Host, 'fs' | 'now'>,
  project: string,
  command: BridgeCommand,
): Promise<{ resultFile: string; at: number } | (BridgeResult & { ok: false })> {
  const now = await host.now()
  const id = `${now}-${++counter}`
  const dir = bridgeDir(project)
  try {
    await host.fs.write(join(dir, `cmd-${id}.json`), JSON.stringify({ id, ...command }))
  } catch (e) {
    return { ok: false, error: `could not queue the command: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { resultFile: join(dir, `result-${id}.json`), at: now }
}

/** The result of a queued command, or undefined while the editor has not answered yet. */
export async function readResult(fs: Pick<HostFs, 'read' | 'exists'>, resultFile: string): Promise<BridgeResult | undefined> {
  const raw = await readJson(fs, resultFile)
  if (!raw) return undefined
  if (raw.ok === true) return { ok: true, data: raw }
  const code = typeof raw.code === 'string' && raw.code ? { code: raw.code } : {}
  return { ok: false, error: germanBridgeError(String(raw.error ?? 'Der Editor meldet einen Fehler ohne Text.')), ...code }
}
