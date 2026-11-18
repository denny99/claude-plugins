/**
 * Pure Unity knowledge: project detection, editor/log locations per OS, compiler-message and test-result parsing,
 * per-project test filters. No `$` here: everything takes the Host slices it reads from, so tests hand in fakes.
 */
import type { HostEnv, HostFs } from './host'
import { join, norm } from './path'

// --- project detection ---

export interface UnityProject {
  /** The Unity project folder (holds Assets/, ProjectSettings/). */
  root: string
  /** The session root it was found from (the project itself or its parent). */
  sessionRoot: string
  /** `6000.6.7f1`. */
  version: string
  /** `b22767f04f04` when ProjectVersion.txt carries it. */
  revision?: string
  name: string
}

/** Reads `m_EditorVersion` and the revision from ProjectVersion.txt. */
export function parseProjectVersion(text: string): { version: string; revision?: string } | undefined {
  const version = /^m_EditorVersion:\s*(\S+)/m.exec(text)?.[1]
  if (!version) return undefined
  const revision = /^m_EditorVersionWithRevision:\s*\S+\s*\(([0-9a-f]+)\)/m.exec(text)?.[1]
  return revision ? { version, revision } : { version }
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'Library', 'Temp', 'Logs', 'obj', 'bin', '.idea', '.vs', '.vscode'])

/**
 * Finds the Unity project at `sessionRoot` or one level below it (`ProjectSettings/ProjectVersion.txt`). With several
 * candidates one level down, the first in name order wins.
 */
export async function detectProject(
  sessionRoot: string,
  fs: Pick<HostFs, 'read' | 'exists' | 'list'>,
): Promise<UnityProject | undefined> {
  const base = norm(sessionRoot)
  const tryAt = async (root: string): Promise<UnityProject | undefined> => {
    const file = join(root, 'ProjectSettings', 'ProjectVersion.txt')
    if (!(await fs.exists(file))) return undefined
    const parsed = parseProjectVersion(await fs.read(file))
    if (!parsed) return undefined
    const name = root.replace(/\/+$/, '').split('/').pop() ?? root
    return { root, sessionRoot: base, name, ...parsed }
  }
  const here = await tryAt(base)
  if (here) return here
  let entries: { name: string; kind: string }[] = []
  try {
    entries = await fs.list(base)
  } catch {
    return undefined
  }
  const dirs = entries
    .filter(e => e.kind === 'dir' && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
    .map(e => e.name)
    .sort()
  for (const d of dirs) {
    const found = await tryAt(join(base, d))
    if (found) return found
  }
  return undefined
}

// --- editor + log locations ---

/** The Unity Hub file naming a custom install location (a JSON string). */
export function hubSecondaryInstallFile(env: HostEnv): string {
  if (env.platform === 'windows')
    return join(env.appData ?? `${env.home}/AppData/Roaming`, 'UnityHub', 'secondaryInstallPath.json')
  if (env.platform === 'macos')
    return join(env.home, 'Library', 'Application Support', 'UnityHub', 'secondaryInstallPath.json')
  return join(env.home, '.config', 'UnityHub', 'secondaryInstallPath.json')
}

/** `"D:\\Unity"` → `D:/Unity`; empty or invalid → undefined. */
export function parseSecondaryInstallPath(text: string): string | undefined {
  try {
    const v = JSON.parse(text) as unknown
    return typeof v === 'string' && v.trim() ? norm(v.trim()) : undefined
  } catch {
    return undefined
  }
}

/** The editor binary inside an install folder `<dir>/<version>`. */
export function editorBinaryIn(env: HostEnv, versionDir: string): string {
  if (env.platform === 'windows') return join(versionDir, 'Editor', 'Unity.exe')
  if (env.platform === 'macos') return join(versionDir, 'Unity.app', 'Contents', 'MacOS', 'Unity')
  return join(versionDir, 'Editor', 'Unity')
}

/** Every place the editor of `version` may live, Hub default first, then the Hub's custom location. */
export function editorCandidates(env: HostEnv, version: string, secondary?: string): string[] {
  const roots: string[] = []
  if (env.platform === 'windows') {
    roots.push(join(env.programFiles ?? 'C:/Program Files', 'Unity', 'Hub', 'Editor'))
    roots.push('C:/Program Files/Unity/Hub/Editor')
  } else if (env.platform === 'macos') {
    roots.push('/Applications/Unity/Hub/Editor')
  } else {
    roots.push(join(env.home, 'Unity', 'Hub', 'Editor'))
  }
  if (secondary) roots.push(secondary)
  return [...new Set(roots.map(r => editorBinaryIn(env, join(r, version))))]
}

/** Finds the editor: the configured path, else the first candidate that exists. */
export async function findEditor(
  env: HostEnv,
  version: string,
  fs: Pick<HostFs, 'read' | 'exists'>,
  configured?: string,
): Promise<{ path?: string; tried: string[] }> {
  if (configured?.trim()) return { path: norm(configured.trim()), tried: [] }
  let secondary: string | undefined
  try {
    const file = hubSecondaryInstallFile(env)
    if (await fs.exists(file)) secondary = parseSecondaryInstallPath(await fs.read(file))
  } catch {
    secondary = undefined
  }
  const tried = editorCandidates(env, version, secondary)
  for (const p of tried) if (await fs.exists(p)) return { path: p, tried }
  return { tried }
}

/** Where the running editor writes its log. */
export function editorLogPath(env: HostEnv): string {
  if (env.platform === 'windows')
    return join(env.localAppData ?? `${env.home}/AppData/Local`, 'Unity', 'Editor', 'Editor.log')
  if (env.platform === 'macos') return join(env.home, 'Library', 'Logs', 'Unity', 'Editor.log')
  return join(env.home, '.config', 'unity3d', 'Editor.log')
}

/** Unity's lock file: present while an editor has the project open (or after a crash). */
export function lockfilePath(root: string): string {
  return join(root, 'Temp', 'UnityLockfile')
}

export type LockState = 'free' | 'held' | 'stale'

/**
 * Batchmode is allowed only when no editor holds the project. Unity takes one editor per project; a lock file that
 * exists but nobody holds (crash) is `stale` and does not block. A live bridge means an editor is open, whatever the
 * lock says.
 */
export function batchAllowed(s: { lock: LockState; bridgeUp: boolean }): { ok: boolean; reason?: string } {
  if (s.bridgeUp)
    return {
      ok: false,
      reason: 'An editor has this project open (bridge is up). Use the editor, or run batch jobs in a worktree.',
    }
  if (s.lock === 'held')
    return { ok: false, reason: 'An editor holds Temp/UnityLockfile. Close it, or run batch jobs in a worktree.' }
  return { ok: true }
}

// --- compiler messages ---

export type Severity = 'error' | 'warning'

export interface CompilerMessage {
  severity: Severity
  message: string
  file?: string
  line?: number
  column?: number
  code?: string
}

const CS_LINE = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+([A-Z]+\d+):\s*(.*)$/

/** Parses `Assets/A.cs(12,5): error CS1002: ; expected` lines (Editor.log, batchmode logs); duplicates dropped. */
export function parseCompilerMessages(text: string): CompilerMessage[] {
  const seen = new Set<string>()
  const out: CompilerMessage[] = []
  for (const raw of text.split(/\r?\n/)) {
    const m = CS_LINE.exec(raw.trim())
    if (!m) continue
    const key = m[0]
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      severity: m[4] as Severity,
      file: norm(m[1] ?? ''),
      line: Number(m[2]),
      column: Number(m[3]),
      code: m[5],
      message: m[6] ?? '',
    })
  }
  return out
}

/**
 * Compile messages of the LAST compile in an Editor.log chunk: Unity logs a compile block per refresh; later blocks
 * supersede earlier ones. Splits at the markers Unity 2021–6000 print before compiling.
 */
export function lastCompileBlock(text: string): string {
  const markers = [
    /^.*Starting: .*bee_backend.*$/gm,
    /^.*- Starting script compilation.*$/gm,
    /^.*\[ScriptCompilation\].*$/gm,
  ]
  let at = -1
  for (const re of markers) for (const m of text.matchAll(re)) at = Math.max(at, m.index ?? -1)
  return at >= 0 ? text.slice(at) : text
}

/**
 * The bare text of a compiler message: Unity's `CompilerMessage.message` (and old bridges) carry the
 * `Assets/A.cs(12,5): error CS1002: ` prefix already; that prefix is dropped when present.
 */
export function bareMessage(message: string): string {
  return message.replace(/^\s*(?:[^\r\n]*?\(\d+,\d+\)\s*:\s*)?(?:error|warning)\s+[A-Z]+\d+\s*:\s*/i, '')
}

/** One message as a line: `Assets/A.cs(12,5): error CS1002: ; expected`. */
export function formatMessage(m: CompilerMessage): string {
  const where = m.file ? `${m.file}${m.line ? `(${m.line},${m.column ?? 0})` : ''}: ` : ''
  return `${where}${m.severity}${m.code ? ` ${m.code}` : ''}: ${bareMessage(m.message)}`
}

/**
 * The text the compile gate appends to an edit's result: errors first (all, up to `max`), warnings only for the files
 * just edited (a project's old warnings are noise).
 */
export function compileContext(messages: CompilerMessage[], editedFiles: string[], max = 20): string | undefined {
  const errors = messages.filter(m => m.severity === 'error')
  const edited = editedFiles.map(f => norm(f).toLowerCase())
  const warnings = messages.filter(
    m => m.severity === 'warning' && m.file && edited.some(e => e.endsWith(norm(m.file ?? '').toLowerCase())),
  )
  if (!errors.length && !warnings.length) return undefined
  const lines: string[] = []
  if (errors.length) {
    lines.push(`Unity compile: ${errors.length} error(s). Fix them before going on:`)
    lines.push(...errors.slice(0, max).map(formatMessage))
    if (errors.length > max) lines.push(`… ${errors.length - max} more (unity_console / unity_refresh).`)
  }
  if (warnings.length) {
    lines.push(`Unity compile: ${warnings.length} warning(s) in the edited file(s):`)
    lines.push(...warnings.slice(0, max).map(formatMessage))
  }
  return lines.join('\n')
}

/** True for the files whose edit makes Unity recompile scripts. */
export function isScriptFile(path: string): boolean {
  return /\.(cs|asmdef|asmref|rsp)$/i.test(path)
}

/** Unity's serialized YAML assets, which should be changed in the editor, not by text edits. */
export function isSerializedAsset(path: string): boolean {
  return /\.(unity|prefab|asset|mat|controller|anim|overrideController|physicMaterial|lighting|playable|mask|signal)$/i.test(
    path,
  )
}

// --- tests ---

export type TestStatus = 'Passed' | 'Failed' | 'Skipped' | 'Inconclusive'

export interface TestResult {
  fullName: string
  name: string
  status: TestStatus
  message?: string
  stack?: string
  duration?: number
}

export interface TestRun {
  runId?: string
  state: 'idle' | 'running' | 'done' | 'error'
  mode?: 'EditMode' | 'PlayMode'
  filter?: string
  results: TestResult[]
  error?: string
  finishedAt?: number
  /** Leaf tests the run started with (bridge: RunStarted's TestCaseCount). */
  total?: number
  /** When the run started (Unix ms). */
  startedAt?: number
  /** The test running right now (bridge: TestStarted). */
  current?: string
}

function asStatus(v: unknown): TestStatus {
  const s = String(v ?? '').toLowerCase()
  if (s.startsWith('pass')) return 'Passed'
  if (s.startsWith('fail') || s === 'error') return 'Failed'
  if (s.startsWith('skip') || s === 'ignored') return 'Skipped'
  return 'Inconclusive'
}

/** Why an editor run that stopped without finishing is over. */
export const TESTS_ABORTED = 'aborted — editor closed or crashed'

/**
 * An editor run (it has a bridge runId) still `running` while the bridge heartbeat is stale or missing: the editor
 * went away mid-run and the run will never finish. It reads as an aborted run, so a new one can start.
 */
/** The error of a run stopped on purpose (bridge `cancel-tests` writes the same word). */
export const TESTS_CANCELLED = 'Cancelled'

export function abortedIfBridgeDown<T extends Pick<TestRun, 'state' | 'runId' | 'error'>>(
  run: T | undefined,
  bridgeUp: boolean,
): T | undefined {
  if (!run || bridgeUp || run.state !== 'running' || !run.runId) return run
  return { ...run, state: 'error', error: TESTS_ABORTED }
}

/** The run's error as one line: "aborted — …" or "failed to start: …". */
export function testErrorLine(run: Pick<TestRun, 'error'>): string {
  if (run.error === TESTS_CANCELLED) return 'Testlauf abgebrochen'
  return run.error === TESTS_ABORTED
    ? `Tests ${TESTS_ABORTED}`
    : `Test run failed to start: ${run.error ?? 'unknown error'}`
}

/** Normalizes the bridge's `/tests` JSON (or Library/ClaudeBridge/tests.json). */
export function parseBridgeTests(text: string): TestRun | undefined {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    return undefined
  }
  if (!raw || typeof raw !== 'object') return undefined
  const list = Array.isArray(raw.results) ? (raw.results as Record<string, unknown>[]) : []
  const state = ['idle', 'running', 'done', 'error'].includes(String(raw.state))
    ? (raw.state as TestRun['state'])
    : 'idle'
  const run: TestRun = {
    state,
    results: list.map(r => ({
      fullName: String(r.fullName ?? r.name ?? ''),
      name: String(r.name ?? r.fullName ?? ''),
      status: asStatus(r.status),
      ...(r.message ? { message: String(r.message) } : {}),
      ...(r.stack ? { stack: String(r.stack) } : {}),
      ...(typeof r.duration === 'number' ? { duration: r.duration } : {}),
    })),
  }
  if (raw.runId) run.runId = String(raw.runId)
  if (raw.mode === 'EditMode' || raw.mode === 'PlayMode') run.mode = raw.mode
  if (raw.filter) run.filter = String(raw.filter)
  if (raw.error) run.error = String(raw.error)
  if (typeof raw.finishedAt === 'number' && raw.finishedAt > 0) run.finishedAt = raw.finishedAt
  if (typeof raw.total === 'number' && raw.total > 0) run.total = raw.total
  if (typeof raw.startedAt === 'number' && raw.startedAt > 0) run.startedAt = raw.startedAt
  if (typeof raw.current === 'string' && raw.current) run.current = raw.current
  return run
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? decodeXml(m[1] ?? '') : undefined
}

/** Parses the NUnit 3 XML a batchmode `-runTests -testResults <file>` run writes. */
export function parseNUnitXml(xml: string): TestResult[] {
  const out: TestResult[] = []
  const re = /<test-case\b([^>]*?)(\/>|>([\s\S]*?)<\/test-case>)/g
  for (const m of xml.matchAll(re)) {
    const tag = m[1] ?? ''
    const body = m[3] ?? ''
    const fullName = attr(tag, 'fullname') ?? attr(tag, 'name') ?? ''
    const msg = /<message>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/message>/.exec(body)?.[1]
    const stack = /<stack-trace>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/stack-trace>/.exec(body)?.[1]
    const duration = Number(attr(tag, 'duration'))
    out.push({
      fullName,
      name: attr(tag, 'name') ?? fullName,
      status: asStatus(attr(tag, 'result')),
      ...(msg?.trim() ? { message: decodeXml(msg.trim()) } : {}),
      ...(stack?.trim() ? { stack: decodeXml(stack.trim()) } : {}),
      ...(Number.isFinite(duration) ? { duration } : {}),
    })
  }
  return out
}

export interface RankedResult extends TestResult {
  /** Failed now, passed (or unseen) in the previous run of this session. */
  newlyRed: boolean
}

/** Orders results: newly red first, then still red, then the rest (by name). */
export function rankResults(results: TestResult[], previous: Record<string, TestStatus>): RankedResult[] {
  const rank = (r: RankedResult): number => (r.newlyRed ? 0 : r.status === 'Failed' ? 1 : r.status === 'Passed' ? 3 : 2)
  return results
    .map(r => ({ ...r, newlyRed: r.status === 'Failed' && previous[r.fullName] !== 'Failed' }))
    .sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName))
}

/** Counts per status. */
export function countResults(results: TestResult[]): {
  passed: number
  failed: number
  skipped: number
  total: number
} {
  return {
    passed: results.filter(r => r.status === 'Passed').length,
    failed: results.filter(r => r.status === 'Failed').length,
    skipped: results.filter(r => r.status === 'Skipped' || r.status === 'Inconclusive').length,
    total: results.length,
  }
}

/** A run as text for the model: counts, then failures with message, newly red marked. */
export function testReport(run: TestRun, previous: Record<string, TestStatus>, maxFailures = 25): string {
  if (run.state === 'error') return `${testErrorLine(run)}.`
  const c = countResults(run.results)
  const head = `${run.mode ?? 'Tests'}${run.filter ? ` (filter ${run.filter})` : ''}: ${run.state === 'running' ? 'running, ' : ''}${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped of ${c.total}.`
  const failed = rankResults(run.results, previous).filter(r => r.status === 'Failed')
  const lines = [head]
  for (const r of failed.slice(0, maxFailures)) {
    lines.push(`${r.newlyRed ? 'NEW ' : ''}FAIL ${r.fullName}`)
    if (r.message) lines.push(`  ${r.message.split('\n').slice(0, 4).join('\n  ')}`)
    const top = r.stack?.split('\n').find(l => /\.cs:\d+|\.cs:line \d+/.test(l))
    if (top) lines.push(`  at ${top.trim().replace(/^at\s+/, '')}`)
  }
  if (failed.length > maxFailures) lines.push(`… ${failed.length - maxFailures} more failures.`)
  return lines.join('\n')
}

// --- per-project test filters ---

export interface TestFilterPreset {
  name: string
  /** Unity test filter: a regex the TestRunnerApi matches against full test names (`groupNames`). */
  filter: string
  source: 'config' | 'docs'
  /** Paths/globs (project- or session-relative) this area's tests cover: narrow-test picker. */
  paths?: string[]
}

/**
 * `.claude/unity.json` — EVERYTHING project-specific lives here (nothing of one game is hardcoded). All keys optional:
 *
 * ```json
 * {
 *   "unityPath": "/Applications/Unity/Hub/Editor/6000.6.7f1/Unity.app/Contents/MacOS/Unity",
 *   "projectDir": "unity",
 *   "worktreeDir": ".worktrees",
 *   "editorEnv": { "GAME_MUTE": "1" },
 *   "tests": { "areas": { "Core": "MyGame.Tests.Core", "World": "MyGame.Tests.World;MyGame.Tests.Places" } },
 *   "filterDocs": ["docs/code-map.md"],
 *   "bannedApis": [{ "glob": "Assets/Game/Sim/**", "patterns": ["System.Random", "DateTime.Now"] }],
 *   "restoreBeforeCommit": ["Packages/packages-lock.json"],
 *   "syncReminders": [{ "glob": "**\/texts.*.json", "message": "Run the text sync job" }],
 *   "customJobs": [{ "name": "Smoke", "command": "node tools/smoke.mjs", "batch": true }],
 *   "playRestart": { "*.cs": "restart", "*.json": "reload" },
 *   "refreshWhilePlaying": false,
 *   "watchdogMinutes": 30,
 *   "buildMethod": "Build.Mac", "buildTarget": "StandaloneOSX"
 * }
 * ```
 */
export interface ProjectConfig {
  unityPath?: string
  /** Unity project folder relative to the session root (default: detected). */
  projectDir?: string
  /** Where this repo keeps its worktrees (shown in the pane as the safe place for batch runs). */
  worktreeDir?: string
  /** Env vars every batchmode / custom job gets (mute switches etc.). */
  editorEnv?: Record<string, string>
  /** Test areas: name → Unity filter (regex on full names; several separated by `;`). */
  areas?: Record<string, string>
  /** Area name → paths/globs its tests cover (narrow-test picker; else guessed from folder names). */
  areaPaths?: Record<string, string[]>
  /** Remind to run the full suite after this many commits since the last full run (default 5). */
  fullSuiteEvery?: number
  filterDocs?: string[]
  bannedApis?: { glob: string; patterns: string[] }[]
  restoreBeforeCommit?: string[]
  syncReminders?: { glob: string; message: string }[]
  /** Shell commands as pane buttons/tools; `batch: true` → only when no editor holds the project. */
  customJobs?: { name: string; command: string; batch?: boolean }[]
  /** glob → `restart` (Play must restart) | `reload` | any hint text. */
  playRestart?: Record<string, string>
  /** Let the compile gate refresh an editor that is in Play mode (default false: never disturb a running game). */
  refreshWhilePlaying?: boolean
  watchdogMinutes?: number
  buildMethod?: string
  buildTarget?: string
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)
const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined
const strMap = (v: unknown): Record<string, string> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (Object.fromEntries(
        Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string'),
      ) as Record<string, string>)
    : undefined

/** Parses `.claude/unity.json`; unknown keys ignored, invalid JSON → `{}`. */
export function parseProjectConfig(text: string): ProjectConfig {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
  if (!raw || typeof raw !== 'object') return {}
  const cfg: ProjectConfig = {}
  for (const k of ['unityPath', 'projectDir', 'worktreeDir', 'buildMethod', 'buildTarget'] as const) {
    const v = str(raw[k])
    if (v) cfg[k] = v
  }
  const env = strMap(raw.editorEnv)
  if (env) cfg.editorEnv = env
  const tests = raw.tests as { areas?: unknown; paths?: unknown; fullSuiteEvery?: unknown } | undefined
  const areas = strMap(tests?.areas)
  if (areas) cfg.areas = areas
  if (tests?.paths && typeof tests.paths === 'object' && !Array.isArray(tests.paths)) {
    const ap = Object.fromEntries(
      Object.entries(tests.paths as Record<string, unknown>)
        .map(([k, v]) => [k, typeof v === 'string' ? [v] : (strList(v) ?? [])] as const)
        .filter(([, v]) => v.length),
    )
    if (Object.keys(ap).length) cfg.areaPaths = ap
  }
  const every = raw.fullSuiteEvery ?? tests?.fullSuiteEvery
  if (typeof every === 'number' && every > 0) cfg.fullSuiteEvery = Math.floor(every)
  const docs = strList(raw.filterDocs)
  if (docs) cfg.filterDocs = docs
  const restore = strList(raw.restoreBeforeCommit)
  if (restore) cfg.restoreBeforeCommit = restore
  const play = strMap(raw.playRestart)
  if (play) cfg.playRestart = play
  if (Array.isArray(raw.bannedApis))
    cfg.bannedApis = (raw.bannedApis as Record<string, unknown>[])
      .filter(b => str(b?.glob) && strList(b?.patterns))
      .map(b => ({ glob: String(b.glob), patterns: strList(b.patterns) ?? [] }))
  if (Array.isArray(raw.syncReminders))
    cfg.syncReminders = (raw.syncReminders as Record<string, unknown>[])
      .filter(s => str(s?.glob) && str(s?.message))
      .map(s => ({ glob: String(s.glob), message: String(s.message) }))
  if (Array.isArray(raw.customJobs))
    cfg.customJobs = (raw.customJobs as Record<string, unknown>[])
      .filter(j => str(j?.name) && str(j?.command))
      .map(j => ({ name: String(j.name), command: String(j.command), ...(j.batch === true ? { batch: true } : {}) }))
  if (typeof raw.refreshWhilePlaying === 'boolean') cfg.refreshWhilePlaying = raw.refreshWhilePlaying
  if (typeof raw.watchdogMinutes === 'number' && raw.watchdogMinutes > 0) cfg.watchdogMinutes = raw.watchdogMinutes
  return cfg
}

/** Minimal glob → RegExp (`**` any depth, `*` within a segment, `?` one char); matched against `/` paths. */
export function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] ?? ''
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*'
      i++
      if (glob[i + 1] === '/') i++
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  // A glob without a slash matches the file name anywhere (`*.cs`).
  return glob.includes('/') ? new RegExp(`(^|/)${re}$`) : new RegExp(`(^|/)${re}$`)
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(norm(path))
}

/** Every preset: config areas first, then docs. */
export async function loadProjectConfig(
  sessionRoot: string,
  fs: Pick<HostFs, 'read' | 'exists'>,
): Promise<{ presets: TestFilterPreset[]; config: ProjectConfig; configFound: boolean }> {
  const cfgFile = join(sessionRoot, '.claude', 'unity.json')
  const configFound = await fs.exists(cfgFile)
  const config = configFound ? parseProjectConfig(await fs.read(cfgFile)) : {}
  const presets: TestFilterPreset[] = Object.entries(config.areas ?? {}).map(([name, filter]) => ({
    name,
    filter,
    source: 'config' as const,
    ...(config.areaPaths?.[name] ? { paths: config.areaPaths[name] } : {}),
  }))
  // Docs are read only when the config names none of its own areas (best effort for unconfigured projects).
  if (!presets.length)
    for (const doc of config.filterDocs ?? ['docs/code-map.md']) {
      const file = join(sessionRoot, doc)
      try {
        if (await fs.exists(file)) presets.push(...filtersFromDoc(await fs.read(file)))
      } catch {
        // unreadable doc: no presets from it
      }
    }
  return { presets, config, configFound }
}

/** Splits a filter into the names/regexes Unity takes (`;`-separated, blanks dropped). */
export function splitFilter(filter: string | undefined): string[] {
  return (filter ?? '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
}

// --- batchmode command lines ---

/** argv of a batchmode test run writing NUnit XML to `resultsFile`. */
export function batchTestArgs(
  project: string,
  mode: 'EditMode' | 'PlayMode',
  resultsFile: string,
  filter?: string,
  logFile = '-',
): string[] {
  const args = ['-batchmode', '-projectPath', project, '-runTests', '-testPlatform', mode, '-testResults', resultsFile]
  if (mode === 'EditMode') args.splice(1, 0, '-nographics')
  if (filter) args.push('-testFilter', filter)
  return [...args, '-logFile', logFile]
}

/** argv of a batchmode compile check (open, import, compile, quit; exit code ≠ 0 on compile errors). */
export function batchCompileArgs(project: string, logFile = '-'): string[] {
  return ['-batchmode', '-nographics', '-quit', '-projectPath', project, '-logFile', logFile]
}

/** argv of a batchmode build through the project's own static build method. */
export function batchBuildArgs(project: string, method: string, target?: string, logFile = '-'): string[] {
  return [
    '-batchmode',
    '-nographics',
    '-quit',
    '-projectPath',
    project,
    ...(target ? ['-buildTarget', target] : []),
    '-executeMethod',
    method,
    '-logFile',
    logFile,
  ]
}

/**
 * A `dotnet test --filter` expression (`FullyQualifiedName~A|FullyQualifiedName~B`) as a Unity filter regex (`A|B`).
 * Anything else passes through as written.
 */
export function toUnityFilter(filter: string): string {
  const parts = filter.split('|').map(p => p.trim())
  if (parts.every(p => /^(FullyQualifiedName|Name|ClassName)[~=]/.test(p)))
    return parts.map(p => p.replace(/^(FullyQualifiedName|Name|ClassName)[~=]/, '').replace(/\./g, '\\.')).join('|')
  return filter
}

/**
 * Filter presets from a project doc (a code map): each `##`/`###` section naming a filter in backticks after the word
 * "Filter" (`Filter \`X\``) gives one preset named after the heading. Generic: any doc following "heading per area +
 * Filter `...`" works; `.claude/unity.json` `tests.areas` wins over it.
 */
export function filtersFromDoc(markdown: string): TestFilterPreset[] {
  const out: TestFilterPreset[] = []
  const seen = new Set<string>()
  const pending = new Map<string, string[]>()
  let heading = ''
  for (const line of markdown.split(/\r?\n/)) {
    const h = /^#{2,3}\s+(.+?)\s*$/.exec(line)
    if (h) {
      heading = (h[1] ?? '')
        .replace(/[`*]/g, '')
        .replace(/\s+—\s+.*$/, '')
        .trim()
      continue
    }
    if (!heading) continue
    const pathHits = [...line.matchAll(/`((?:Assets|Packages)\/[^`\s]+)`/g)].map(x => x[1] ?? '')
    if (pathHits.length) {
      const found = out.find(p => p.name === heading)
      if (found) found.paths = [...new Set([...(found.paths ?? []), ...pathHits])]
      else pending.set(heading, [...new Set([...(pending.get(heading) ?? []), ...pathHits])])
    }
    if (seen.has(heading)) continue
    const m = /[Ff]ilter\s*:?\s*`([^`]+)`/.exec(line)
    const raw = (m?.[1] ?? '').replace(/^--filter\s+/, '').replace(/^"|"$/g, '')
    if (!raw) continue
    seen.add(heading)
    const paths = pending.get(heading)
    out.push({ name: heading, filter: toUnityFilter(raw), source: 'docs', ...(paths ? { paths } : {}) })
  }
  return out
}
