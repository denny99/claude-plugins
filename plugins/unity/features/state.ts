/**
 * The plugin's one model atom and every action on it: project/bridge refresh, compile gate, tests, play controls,
 * screenshots, batchmode + custom jobs as Claude Code background shells (pattern of ds-solutions-flow's run feature:
 * exit marker in the output file, polled with $.clock.every, stopped through TaskStop).
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { ModelJob, ModelPerf, UnityModel } from '../types'
import {
  BRIDGE_VERSION,
  readCompile,
  readConsole,
  readStatus,
  queueCommand,
  readResult,
  readTests,
  sendCommand,
  sleep,
  type BridgeCommand,
  type BridgeResult,
  versionOlder,
} from '../lib/bridge'
import * as play from '../lib/play'
import { createHost, type Host } from '../lib/host'
import { activatePid } from '../lib/front'
import { lockState } from '../lib/lock'
import { affectedAreas, affectedText, changedFiles, landingsReminder } from '../lib/affected'
import { basename, join, relative } from '../lib/path'
import { backgroundInfo, exitCodeOf, shJoin, shQuote, tailLines, wrapCommand } from '../lib/shell'
import { libraryCopyLine, WORKTREE_NAME, worktreeAddArgs, worktreePaths } from '../lib/worktree'
import {
  batchAllowed,
  batchBuildArgs,
  abortedIfBridgeDown,
  TESTS_CANCELLED,
  batchCompileArgs,
  batchTestArgs,
  compileContext,
  detectProject,
  editorLogPath,
  findEditor,
  lastCompileBlock,
  loadProjectConfig,
  parseCompilerMessages,
  parseNUnitXml,
  testReport,
  mergeRuns,
  type ProjectConfig,
  type TestRun,
} from '../lib/unity'

export const PLUGIN = 'unity'

export type Options = {
  compileGate?: boolean
  compileWaitSeconds?: number
  debounceMs?: number
  editorPath?: string
  commitGuard?: boolean
  metaGuard?: boolean
  /** Refuse starting Unity by hand in the main checkout while an editor holds the project. */
  unityRunGuard?: boolean
  /** Open the pane at session start in a Unity project (lib/autoopen.ts ranking). */
  autoOpen?: boolean
}

const EMPTY: UnityModel = {
  phase: 'unknown',
  editorTried: [],
  configFound: false,
  config: {},
  presets: [],
  lock: 'free',
  bridge: { up: false, why: 'missing' },
  console: [],
  previous: {},
  filterInput: '',
  jobs: [],
}

const modelAtom = atom({ plugin: 'unity', key: 'model' } as const, EMPTY, { shape: 'unity-model-1' })

export function readModel($: EngineInterface): Promise<UnityModel> {
  return read($, modelAtom)
}

export async function patchModel(
  $: EngineInterface,
  patch: Partial<UnityModel> | ((m: UnityModel) => Partial<UnityModel>),
): Promise<void> {
  await update($, modelAtom, m => ({ ...m, ...(typeof patch === 'function' ? patch(m) : patch) }))
}

export function configOf(m: UnityModel): ProjectConfig {
  return m.config as ProjectConfig
}

/**
 * Where batch runs go: a ready worktree (its own lock file; the bridge belongs to the main editor), else the main
 * checkout.
 */
export function batchTarget(m: UnityModel): {
  root: string
  lock: UnityModel['lock']
  bridgeUp: boolean
  worktree?: string
} {
  if (m.worktree?.status === 'ready')
    return { root: m.worktree.projectRoot, lock: m.targetLock ?? 'free', bridgeUp: false, worktree: m.worktree.name }
  return { root: m.project?.root ?? '', lock: m.lock, bridgeUp: m.bridge.up }
}

// --- refresh ---

/** Re-detects the project, editor, config, lock and bridge and reads the bridge's files. */
export async function refreshModel($: EngineInterface, options: Options): Promise<UnityModel> {
  const host = await createHost($)
  const sessionRoot = await $.session.root()
  const loaded = await loadProjectConfig(sessionRoot, host.fs)
  const cfg = loaded.config
  const project = cfg.projectDir
    ? await detectProject(join(sessionRoot, cfg.projectDir), host.fs, sessionRoot)
    : await detectProject(sessionRoot, host.fs)
  if (!project) {
    await patchModel($, { phase: 'none', sessionRoot, configFound: loaded.configFound, config: { ...cfg } })
    return readModel($)
  }
  const editor = await findEditor(host, project.version, host.fs, options.editorPath || cfg.unityPath)
  const lock = await lockState(host, project.root)
  const before = await readModel($)
  const targetLock =
    before.worktree?.status === 'ready' ? await lockState(host, before.worktree.projectRoot) : undefined
  const live = await readBridge(host, project.root)
  const installed = live.bridge.version ?? (await installedBridgeVersion(host, project.root))
  const checkouts = before.tab === 'target' ? await listCheckouts(host, sessionRoot, project.root) : before.checkouts
  const elsewhere =
    !live.bridge.up && live.bridge.why === 'missing'
      ? await findEditorElsewhere(host, sessionRoot, project.root)
      : undefined
  const fullDone =
    before.fullPending !== undefined &&
    live.tests?.runId === before.fullPending &&
    (live.tests.state === 'done' || live.tests.state === 'error')
  // An editor run left `running` while the heartbeat is stale/missing: the editor closed or crashed mid-run.
  // A heartbeat only a little stale with a run going: the editor's main thread is busy running the tests.
  const busy = live.bridge.why === 'stale' && (live.bridge.age ?? Infinity) < BUSY_MS
  const aborted = live.tests ? undefined : abortedIfBridgeDown(before.tests, live.bridge.up || busy)
  const wasAborted = !!aborted && aborted !== before.tests
  await patchModel($, m => ({
    phase: 'ok',
    sessionRoot,
    project,
    editorPath: editor.path,
    editorTried: editor.tried,
    configFound: loaded.configFound,
    config: { ...cfg },
    presets: loaded.presets,
    lock,
    ...(targetLock ? { targetLock } : {}),
    bridgeInstalled: installed,
    editorElsewhere: elsewhere,
    ...(checkouts ? { checkouts } : {}),
    ...live,
    tests: live.tests ? mergeRuns(m.tests, live.tests) : wasAborted ? aborted : m.tests,
    ...(fullDone || wasAborted ? { fullPending: undefined } : {}),
    error: undefined,
  }))
  if (fullDone && live.tests && fullRunGreen(live.tests)) await recordFullRun($, options)
  return readModel($)
}

async function readBridge(
  host: Host,
  project: string,
): Promise<Pick<UnityModel, 'bridge' | 'console'> & Partial<UnityModel>> {
  const s = await readStatus(host.fs, project, await host.now())
  if (!s.up) {
    const age = s.status ? Math.max(0, (await host.now()) - s.status.updatedAt) : undefined
    return {
      bridge: {
        up: false,
        why: s.why,
        ...(age !== undefined ? { age } : {}),
        ...(s.status?.bridgeVersion ? { version: s.status.bridgeVersion } : {}),
      },
      console: [],
    }
  }
  const st = s.status
  const out: Pick<UnityModel, 'bridge' | 'console'> & Partial<UnityModel> = {
    bridge: {
      up: true,
      isCompiling: st.isCompiling,
      isPlaying: st.isPlaying,
      isPaused: st.isPaused,
      compileSeq: st.compileSeq,
      ...(st.unityVersion ? { unityVersion: st.unityVersion } : {}),
      ...(st.scene ? { scene: st.scene } : {}),
      ...(st.batchmode ? { batchmode: true } : {}),
      ...(st.bridgeVersion ? { version: st.bridgeVersion } : {}),
    },
    console: (await readConsole(host.fs, project)).slice(-200),
  }
  const compile = await readCompile(host.fs, project)
  if (compile)
    out.compile = { seq: compile.seq, at: compile.finishedAt ?? 0, source: 'bridge', messages: compile.messages }
  // Unity drops fixed compile errors after a clean compile; older bridges keep them in their console copy.
  if (compile?.finishedAt && !compile.messages.some(x => x.severity === 'error'))
    out.console = out.console.filter(e => !(isCompileErrorLine(e) && (e.time ?? 0) <= compile.finishedAt!))
  if (!st.scene && !st.isPlaying) {
    const start = st.startScene ?? (await buildSettingsStartScene(host, project))
    if (start) out.startScene = start
  }
  const tests = await readTests(host.fs, project)
  if (tests) out.tests = tests
  return out
}

/** "Assets/A.cs(5,6): error CS1001: …" – a compile error as Unity logs it to the console. */
export function isCompileErrorLine(e: { type: string; message: string }): boolean {
  return e.type === 'Error' && /\(\d+,\d+\)\s*:\s*error\s+[A-Z]+\d+\s*:/.test(e.message)
}

/** The first enabled scene in ProjectSettings/EditorBuildSettings.asset (YAML: `- enabled: 1` then `path: …`). */
export function parseStartScene(text: string): string | undefined {
  const re = /-\s*enabled:\s*(\d)\s*\n\s*path:\s*(\S[^\n]*)/g
  for (let m = re.exec(text); m; m = re.exec(text)) if (m[1] === '1' && m[2]) return m[2].trim()
  return undefined
}

async function buildSettingsStartScene(host: Host, project: string): Promise<string | undefined> {
  try {
    return parseStartScene(await host.fs.read(join(project, 'ProjectSettings', 'EditorBuildSettings.asset')))
  } catch {
    return undefined
  }
}

/** How long a stale heartbeat still counts as "editor busy" while a test run goes (then: aborted). */
export const BUSY_MS = 15 * 60 * 1000

const BRIDGE_PACKAGE = 'com.denny99.claude-bridge'

/** The bridge package version in the project: a local `file:` package, else Library/PackageCache (highest found). */
async function installedBridgeVersion(host: Host, root: string): Promise<string | undefined> {
  const version = async (dir: string): Promise<string | undefined> => {
    try {
      const v = (JSON.parse(await host.fs.read(join(dir, 'package.json'))) as { version?: unknown }).version
      return typeof v === 'string' && v ? v : undefined
    } catch {
      return undefined
    }
  }
  try {
    const manifest = JSON.parse(await host.fs.read(join(root, 'Packages', 'manifest.json'))) as {
      dependencies?: Record<string, string>
    }
    const dep = manifest.dependencies?.[BRIDGE_PACKAGE]
    if (!dep) return undefined
    if (dep.startsWith('file:')) {
      const p = dep.slice(5)
      return version(/^([A-Za-z]:)?[\\/]/.test(p) ? p : join(root, 'Packages', p))
    }
  } catch {
    return undefined
  }
  let best: string | undefined
  try {
    for (const e of await host.fs.list(join(root, 'Library', 'PackageCache')))
      if (e.kind === 'dir' && e.name.startsWith(`${BRIDGE_PACKAGE}@`)) {
        const v = await version(join(root, 'Library', 'PackageCache', e.name))
        if (v && (!best || versionOlder(best, v))) best = v
      }
  } catch {
    return undefined
  }
  return best
}

/**
 * No bridge here: does an editor run for another checkout of the same repo (main checkout or another worktree)?
 * `git worktree list --porcelain` names every checkout; the first one is the main checkout.
 */
async function findEditorElsewhere(
  host: Host,
  sessionRoot: string,
  projectRoot: string,
): Promise<UnityModel['editorElsewhere']> {
  const top = (await gitOut(host, sessionRoot, ['rev-parse', '--show-toplevel']))?.trim()
  if (!top) return undefined
  const list = await gitOut(host, sessionRoot, ['worktree', 'list', '--porcelain'])
  if (!list) return undefined
  const trees = list
    .split(/\r?\n/)
    .filter(l => l.startsWith('worktree '))
    .map(l => l.slice(9).trim().replace(/\\/g, '/'))
  const rel = relative(top, projectRoot)
  const sub = rel && rel !== projectRoot ? rel : ''
  const now = await host.now()
  for (const [i, tree] of trees.entries()) {
    if (tree === top) continue
    const project = sub ? join(tree, sub) : tree
    const s = await readStatus(host.fs, project, now)
    if (s.up)
      return {
        project,
        checkout: tree,
        name: basename(tree),
        main: i === 0,
        here: basename(top),
        hereMain: trees[0] === top,
      }
  }
  return undefined
}

/**
 * The installed bridge is older than the one this plugin ships. A running bridge without `bridgeVersion` in its
 * heartbeat is from before it reported one, so it is old too; with the editor closed an unknown version is not.
 */
export function bridgeOutdated(m: Pick<UnityModel, 'bridgeInstalled'> & { bridge?: UnityModel['bridge'] }): boolean {
  if (m.bridge?.up && !m.bridge.version) return true
  return !!m.bridgeInstalled && versionOlder(m.bridgeInstalled, BRIDGE_VERSION)
}

/**
 * How the panel names an outdated bridge: "Bridge 0.1.0 — Plugin braucht 0.3.0", or "Bridge älter als 0.3.0" when no
 * older version is known (heartbeat without `bridgeVersion`).
 */
export function bridgeOutdatedTitle(m: Pick<UnityModel, 'bridgeInstalled'>): string {
  return m.bridgeInstalled && versionOlder(m.bridgeInstalled, BRIDGE_VERSION)
    ? `Bridge ${m.bridgeInstalled} — Plugin braucht ${BRIDGE_VERSION}`
    : `Bridge älter als ${BRIDGE_VERSION} — bitte aktualisieren`
}

/** The header pill of an outdated bridge: "Bridge 0.1.0 veraltet", or "Bridge veraltet" without a known version. */
export function bridgeOutdatedPill(m: Pick<UnityModel, 'bridgeInstalled'>): string {
  return m.bridgeInstalled && versionOlder(m.bridgeInstalled, BRIDGE_VERSION)
    ? `Bridge ${m.bridgeInstalled} veraltet`
    : 'Bridge veraltet'
}

/** A test run goes (editor run or batch job). */
export function testsRunning(m: Pick<UnityModel, 'tests' | 'jobs'>): boolean {
  return m.tests?.state === 'running' || m.jobs.some(j => j.kind === 'tests' && j.status === 'running')
}

/** What the editor is doing, from the heartbeat in the model; panel pill and band chip both read this one answer. */
export type EditorActivity = 'down' | 'tests' | 'compiling' | 'paused' | 'playing' | 'ready'

/**
 * The editor's activity, most telling first: down, a test run (also a batch job), compiling, Play (paused), ready.
 * Entering Play reloads the domain (isCompiling for a moment); the heartbeat's isPlaying wins over isCompiling.
 */
export function editorActivity(m: Pick<UnityModel, 'tests' | 'jobs' | 'bridge'>): EditorActivity {
  const b = m.bridge
  if (!b.up) return 'down'
  if (testsRunning(m)) return 'tests'
  if (b.isCompiling && !b.isPlaying) return 'compiling'
  if (b.isPlaying) return b.isPaused ? 'paused' : 'playing'
  return 'ready'
}

/** The heartbeat is a little stale because the editor runs tests (its main thread is blocked). */
export function editorBusyWithTests(m: Pick<UnityModel, 'tests' | 'jobs' | 'bridge'>): boolean {
  const b = m.bridge
  return !b.up && b.why === 'stale' && (b.age ?? Infinity) < BUSY_MS && m.tests?.state === 'running'
}

/**
 * "Bridge aktualisieren": drops the bridge's entry from Packages/packages-lock.json, so Unity resolves the git URL
 * again (a git package stays on its locked commit otherwise). Only on a click, after a confirm.
 */
export async function unlockBridgePackage($: EngineInterface, options: Options): Promise<string> {
  const m = await readModel($)
  if (!m.project) return 'Kein Unity-Projekt hier.'
  const host = await createHost($)
  const file = join(m.project.root, 'Packages', 'packages-lock.json')
  let lock: { dependencies?: Record<string, unknown> }
  try {
    lock = JSON.parse(await host.fs.read(file)) as typeof lock
  } catch {
    return 'Packages/packages-lock.json fehlt oder ist kaputt: im Package Manager → + → Add package from git URL die Adresse erneut eintragen.'
  }
  if (!lock.dependencies?.[BRIDGE_PACKAGE])
    return 'Die Bridge ist nicht gesperrt: im Package Manager → + → Add package from git URL die Adresse erneut eintragen.'
  delete lock.dependencies[BRIDGE_PACKAGE]
  await host.fs.write(file, `${JSON.stringify(lock, null, 2)}\n`)
  await refreshModel($, options)
  return 'Sperre gelöst: wechsle in den Unity-Editor, er lädt das Paket Claude Bridge neu (dauert einen Moment).'
}

/** Stops the running test run: the editor run through the bridge (`cancel-tests`), a batch run through its job. */
export async function cancelTests($: EngineInterface, options: Options): Promise<string> {
  const m = await refreshModel($, options)
  const job = [...m.jobs].reverse().find(j => j.kind === 'tests' && j.status === 'running')
  if (job) return (await stopJob($, job.key)) ?? 'Testlauf gestoppt.'
  if (m.tests?.state !== 'running') return 'Es läuft kein Testlauf.'
  if (!m.project || !m.bridge.up)
    return editorBusyWithTests(m)
      ? 'Der Editor ist gerade mit den Tests beschäftigt und nimmt den Stopp an, sobald er wieder antwortet.'
      : 'Der Unity-Editor antwortet nicht; der Lauf lässt sich nicht stoppen.'
  const host = await createHost($)
  const res = await sendCommand(host, m.project.root, { cmd: 'cancel-tests' })
  if (!res.ok)
    return /unknown command/i.test(res.error)
      ? 'Das Unity-Paket Claude Bridge im Projekt kann Testläufe noch nicht stoppen: Bridge aktualisieren.'
      : `Nicht gestoppt: ${res.error}`
  const at = await host.now()
  await patchModel($, x => ({
    tests: x.tests ? { ...x.tests, state: 'error', error: TESTS_CANCELLED, finishedAt: at } : x.tests,
    fullPending: undefined,
  }))
  await refreshModel($, options)
  return 'Testlauf gestoppt.'
}

/** The model, detected once per session on first use. */
export async function ensureModel($: EngineInterface, options: Options): Promise<UnityModel> {
  const m = await readModel($)
  return m.phase === 'unknown' ? refreshModel($, options) : m
}

// --- bridge commands ---

export async function bridgeCommand(
  $: EngineInterface,
  options: Options,
  command: BridgeCommand,
  timeoutMs = 10000,
): Promise<BridgeResult> {
  const ready = await bridgeReady($, options)
  if ('ok' in ready) return ready
  const host = await createHost($)
  const res = await sendCommand(host, ready.root, command, timeoutMs)
  await refreshModel($, options)
  return res
}

/** Refreshes and checks the bridge can take a command: the project root, or the failure in the panel's words. */
async function bridgeReady($: EngineInterface, options: Options): Promise<{ root: string } | (BridgeResult & { ok: false })> {
  const m = await refreshModel($, options)
  if (!m.project)
    return {
      ok: false,
      code: 'no-project',
      error: 'Hier ist kein Unity-Projekt (keine ProjectSettings/ProjectVersion.txt hier oder eine Ebene tiefer).',
    }
  if (!m.bridge.up)
    return editorBusyWithTests(m)
      ? { ok: false, code: 'bridge-busy', error: 'Editor beschäftigt (Tests laufen) — gleich wieder da.' }
      : m.bridge.why === 'stale'
        ? {
            ok: false,
            code: 'bridge-down',
            error: 'Der Editor antwortet gerade nicht (Import, Kompilieren oder geschlossen) — gleich nochmal versuchen.',
          }
        : {
            ok: false,
            code: 'bridge-down',
            error: m.editorElsewhere
              ? `Der Editor läuft für ${m.editorElsewhere.name}, nicht für diesen Checkout (${m.editorElsewhere.here}).`
              : 'Claude ist nicht mit dem Unity-Editor verbunden. Öffne das Projekt in Unity mit dem Paket Claude Bridge (/unity zeigt, wie).',
          }
  return { root: m.project.root }
}

/**
 * Queues a perf recording and returns at once; the live watch ({@link ensureLive}) picks up the result file on its
 * own short ticks and patches the model, so the result is drawn without anyone pressing "Aktualisieren". (One long
 * wait inside a single timer callback did not redraw on its own live.)
 */
export async function queuePerf(
  $: EngineInterface,
  options: Options,
  seconds: number,
  opts: { front?: boolean } = {},
): Promise<BridgeResult | { queued: true }> {
  const s = Math.min(play.PERF_MAX_SECONDS, Math.max(0.5, Number.isFinite(seconds) ? seconds : 5))
  const ready = await bridgeReady($, options)
  if ('ok' in ready) return ready
  const host = await createHost($)
  const beat = await readStatus(host.fs, ready.root, await host.now())
  const version = beat.status?.bridgeVersion
  // „Unity vorn messen“: Unity to the front first; the app in front before gets the focus back when the result lands
  let frontPrev: number | undefined
  if (opts.front) {
    const f = await activatePid(host, beat.status?.pid ?? 0)
    if (!f.ok) return { ok: false, error: f.error, code: 'front' }
    frontPrev = f.prev
  }
  const q = await queueCommand(host, ready.root, { cmd: 'perf_record', seconds: s })
  if ('ok' in q) {
    if (frontPrev) await activatePid(host, frontPrev)
    return q
  }
  await patchModel($, {
    perfPending: {
      resultFile: q.resultFile,
      seconds: s,
      deadline: q.at + play.perfTimeoutMs(s, version),
      ...(frontPrev ? { frontPrev } : {}),
      ...(version ? { bridgeVersion: version } : {}),
    },
  })
  ensureLive($, options)
  return { queued: true }
}

// --- live watch: the heartbeat on a short clock, so panel and band follow the editor at once ---

/** How often the live watch reads status.json (and a pending perf result). */
export const LIVE_MS = 1000
let live: { cancel(): void } | undefined
let liveRunning = false
let liveTicks = 0

/**
 * Starts the live watch once per loaded copy: every {@link LIVE_MS} it reads the heartbeat and, when a state the
 * panel or band shows changed (up/down, Play, pause, compiling, compile seq), runs one refresh, whose atom patch
 * redraws both from the same model. With a test run going it refreshes every 2 s (progress); with the editor down it
 * looks every 3 s. A pending perf result is fetched on the same ticks. Stops in a folder without a Unity project.
 */
export function ensureLive($: EngineInterface, options: Options): void {
  if (live) return
  // Also called while the band or the pane draws (after a hot reload the new copy has no watch until something
  // starts it): starting a timer writes no state, but should the engine refuse it there, the next caller retries.
  try {
    live = $.clock.every(LIVE_MS, () => void liveTick($, options))
  } catch {
    live = undefined
  }
}

/** Whether the live watch of this loaded copy runs (tests). */
export function liveOn(): boolean {
  return !!live
}

/** Stops the live watch (tests). */
export function stopLive(): void {
  live?.cancel()
  live = undefined
}

/** What the panel and band show from a heartbeat, as one comparable string. */
export function liveSignature(b: UnityModel['bridge']): string {
  if (!b.up) return `down:${b.why ?? ''}`
  return `up:${b.isPlaying ? 1 : 0}${b.isPaused ? 1 : 0}${b.isCompiling ? 1 : 0}:${b.compileSeq ?? ''}:${b.version ?? ''}`
}

export async function liveTick($: EngineInterface, options: Options): Promise<void> {
  if (liveRunning) return
  liveRunning = true
  liveTicks++
  try {
    const m = await readModel($)
    if (m.phase === 'none' || (!m.project && m.unityHere === false)) {
      stopLive()
      return
    }
    if (!m.project) {
      await refreshModel($, options)
      return
    }
    if (m.perfPending) await pollPerf($, m.perfPending)
    if (!m.bridge.up && liveTicks % 3 && !m.perfPending) return
    const host = await createHost($)
    const s = await readStatus(host.fs, m.project.root, await host.now())
    const now: UnityModel['bridge'] = s.up
      ? {
          up: true,
          isPlaying: s.status.isPlaying,
          isPaused: s.status.isPaused,
          isCompiling: s.status.isCompiling,
          compileSeq: s.status.compileSeq,
          ...(s.status.bridgeVersion ? { version: s.status.bridgeVersion } : {}),
        }
      : { up: false, why: s.why }
    const changed = liveSignature(now) !== liveSignature(m.bridge)
    if (changed || (testsRunning(m) && liveTicks % 2 === 0)) await refreshModel($, options)
  } catch {
    // a missed tick is caught up by the next one
  } finally {
    liveRunning = false
  }
}

async function pollPerf(
  $: EngineInterface,
  pending: NonNullable<UnityModel['perfPending']>,
): Promise<void> {
  const host = await createHost($)
  const res = await readResult(host.fs, pending.resultFile)
  if (!res && (await host.now()) < pending.deadline) return
  // the recording is over (result or deadline): give the focus back to the app that was in front before
  if (pending.frontPrev) await activatePid(host, pending.frontPrev)
  if (!res) {
    await patchModel($, {
      perfPending: undefined,
      busy: undefined,
      perfError: {
        code: 'timeout',
        error: `Der Editor hat die Messung nicht innerhalb von ${Math.round(play.perfTimeoutMs(pending.seconds, pending.bridgeVersion) / 1000)} s gemeldet.`,
      },
    })
    return
  }
  const parsed = await play.perfRecord(async () => res, pending.seconds)
  const at = await host.now()
  await patchModel($, m =>
    play.isPlayError(parsed)
      ? { perfPending: undefined, busy: undefined, perfError: { ...(parsed.code ? { code: parsed.code } : {}), error: parsed.error } }
      : {
          perfPending: undefined,
          busy: undefined,
          perfError: undefined,
          perfRuns: [{ at, perf: JSON.parse(JSON.stringify(parsed)) as ModelPerf }, ...(m.perfRuns ?? [])].slice(0, 5),
        },
  )
}

// --- compile gate ---

let pending: Promise<string | undefined> | undefined
let pendingFiles: string[] = []
let hinted = false

/**
 * After an edit of script files: refresh Unity (bridge) and return the text to append to the tool result. Edits
 * landing within `debounceMs` (parallel tool calls) share one refresh. Never throws.
 */
export function compileGate($: EngineInterface, options: Options, files: string[]): Promise<string | undefined> {
  pendingFiles.push(...files)
  if (pending) return pending
  pending = gateLoop($, options)
  return pending
}

/** One gate run; when edits arrived while it ran, one more run so they are not left unchecked. */
async function gateLoop($: EngineInterface, options: Options): Promise<string | undefined> {
  const fail = (e: unknown) => `Unity compile gate failed: ${e instanceof Error ? e.message : String(e)}`
  try {
    const host = await createHost($)
    await sleep(host, Math.max(0, options.debounceMs ?? 400))
    const files = pendingFiles
    pendingFiles = []
    let text = await runGate($, options, files).catch(fail)
    if (pendingFiles.length) {
      const more = pendingFiles
      pendingFiles = []
      text = await runGate($, options, files.concat(more)).catch(fail)
    }
    return text
  } catch (e) {
    return fail(e)
  } finally {
    pending = undefined
  }
}

async function runGate($: EngineInterface, options: Options, files: string[]): Promise<string | undefined> {
  const host = await createHost($)
  const m = await refreshModel($, options)
  if (!m.project) return undefined
  const cfg = configOf(m)
  if (m.bridge.up) {
    if (m.bridge.isPlaying && !cfg.refreshWhilePlaying)
      return 'Unity is in Play mode: not refreshed, so the game keeps running. The code compiles when Play stops; restart Play to see it.'
    const before = m.bridge.compileSeq ?? 0
    const started = await host.now()
    const res = await sendCommand(host, m.project.root, { cmd: 'refresh' }, 10000)
    if (!res.ok) return `Unity refresh failed: ${res.error}`
    const deadline = started + Math.max(5, options.compileWaitSeconds ?? 60) * 1000
    let finished = false
    for (;;) {
      const s = await readStatus(host.fs, m.project.root, await host.now())
      if (s.up && s.status.compileSeq > before && !s.status.isCompiling) {
        finished = true
        break
      }
      const now = await host.now()
      if (s.up && !s.status.isCompiling && s.status.compileSeq === before && now - started > 3000) {
        const standing = await refreshModel($, options)
        const errs = compileContext(standing.compile?.messages ?? [], files)
        return errs
          ? `Unity refreshed: nothing new to compile; the last compile still stands.\n${errs}`
          : 'Unity refreshed: nothing to compile.'
      }
      if (now >= deadline) break
      await sleep(host, 500)
    }
    const after = await refreshModel($, options)
    if (!finished)
      return `Unity is still compiling after ${options.compileWaitSeconds ?? 60} s; ask unity_refresh again later.`
    const messages = after.compile?.messages ?? []
    return compileContext(messages, files) ?? 'Unity compile: OK.'
  }
  if (m.lock === 'held') {
    // Editor open without the bridge: Unity compiles when it gets focus; read what Editor.log says right now.
    const log = editorLogPath(host)
    const st = await host.fs.stat(log)
    if (st) {
      const offset = Math.max(0, st.size - 256 * 1024)
      const text = await host.fs.readRange(log, offset, st.size - offset)
      const messages = parseCompilerMessages(lastCompileBlock(text))
      await patchModel($, { compile: { seq: 0, at: await host.now(), source: 'log', messages } })
      const errs = compileContext(messages, files)
      if (errs)
        return `${errs}\n(from Editor.log — the last compile there, which may predate this edit; install the bridge for exact results)`
    }
  }
  if (!hinted) {
    hinted = true
    return 'Unity compile gate: no editor bridge running, so the compile result is unknown. /unity shows how to install it.'
  }
  return undefined
}

// --- tests ---

/** Waits for the bridge's run `runId` to finish (or `waitMs`). */
async function awaitBridgeTests(
  host: Host,
  project: string,
  runId: string,
  waitMs: number,
): Promise<TestRun | undefined> {
  const deadline = (await host.now()) + waitMs
  let last: TestRun | undefined
  for (;;) {
    const run = await readTests(host.fs, project)
    if (run && run.runId === runId) {
      last = run
      if (run.state === 'done' || run.state === 'error') return run
    }
    const beat = await readStatus(host.fs, project, await host.now())
    if (!beat.up) return abortedIfBridgeDown(last ?? { runId, state: 'running', results: [] }, false)
    if ((await host.now()) >= deadline) return last
    await sleep(host, 1000)
  }
}

/**
 * Runs tests: through the bridge when an editor is open, else as a batchmode background job (only when no editor
 * holds the project). Returns the text for the model / the toast.
 */
export async function runTests(
  $: EngineInterface,
  options: Options,
  mode: 'EditMode' | 'PlayMode',
  filter: string | undefined,
  waitMs: number,
): Promise<string> {
  const m = await refreshModel($, options)
  if (!m.project) return 'Hier ist kein Unity-Projekt.'
  const previous = Object.fromEntries((m.tests?.results ?? []).map(r => [r.fullName, r.status]))
  const host = await createHost($)
  const viaWorktree = m.bridge.up && m.bridge.isPlaying && m.worktree?.status === 'ready'
  if (m.bridge.up && !viaWorktree) {
    if (m.bridge.isPlaying)
      return 'Der Editor ist im Play-Modus: erst stoppen (unity_stop), sonst unterbrechen die Tests das laufende Spiel. In einem Worktree (unity_worktree) laufen Tests neben dem Spiel.'
    const res = await sendCommand(host, m.project.root, { cmd: 'run-tests', mode, ...(filter ? { filter } : {}) })
    if (!res.ok) return `Tests nicht gestartet: ${res.error}`
    const runId = String(res.data.runId ?? '')
    const startedAt = await host.now()
    await patchModel($, x => ({
      previous,
      tests: mergeRuns(x.tests, {
        runId,
        state: 'running',
        mode,
        ...(filter ? { filter } : {}),
        results: [],
        startedAt,
      }),
      fullPending: filter ? undefined : runId,
    }))
    if (waitMs <= 0) return `${mode}-Tests im Editor gestartet (Lauf ${runId}). Das Unity-Panel zeigt die Ergebnisse.`
    const run = await awaitBridgeTests(host, m.project.root, runId, waitMs)
    if (run)
      await patchModel($, x => ({
        tests: mergeRuns(x.tests, run),
        ...(run.state !== 'running' ? { fullPending: undefined } : {}),
      }))
    if (run && !filter && fullRunGreen(run)) await recordFullRun($, options)
    if (!run || run.state === 'running')
      return `${mode}-Tests laufen nach ${Math.round(waitMs / 1000)} s noch (Lauf ${runId}). Später unity_test_results aufrufen.`
    return testReport(run, previous)
  }
  const started = await startBatchJob($, options, 'tests', { mode, filter })
  return started
}

/** A finished run counts as the full suite only when nothing failed. */
function fullRunGreen(run: TestRun): boolean {
  return run.state === 'done' && run.results.length > 0 && !run.results.some(r => r.status === 'Failed')
}

const FULL_RUN_KEY = 'fullRun'

async function gitOut(host: Host, cwd: string, args: string[]): Promise<string | undefined> {
  const r = await host.run('git', args, { cwd, log: () => undefined })
  return r.code === 0 ? r.stdout : undefined
}

/** Remembers HEAD as the commit of the last green full test run (per session root, across sessions). */
export async function recordFullRun($: EngineInterface, options: Options): Promise<void> {
  const m = await readModel($)
  const root = m.sessionRoot
  if (!root) return
  const host = await createHost($)
  const sha = (await gitOut(host, root, ['rev-parse', 'HEAD']))?.trim()
  if (!sha) return
  const all = ((await $.store.get(FULL_RUN_KEY)) ?? {}) as Record<string, string>
  await $.store.set(FULL_RUN_KEY, { ...all, [root]: sha })
  await refreshLandings($, options)
}

/** Commits on the branch since the last recorded full run → model.landings. */
export async function refreshLandings($: EngineInterface, _options: Options): Promise<UnityModel['landings']> {
  const m = await readModel($)
  const root = m.sessionRoot
  if (!root) return undefined
  const every = configOf(m).fullSuiteEvery ?? 5
  const all = ((await $.store.get(FULL_RUN_KEY)) ?? {}) as Record<string, string>
  const since = all[root]
  let landings: UnityModel['landings']
  if (!since) landings = { count: 0, every }
  else {
    const host = await createHost($)
    const out = await gitOut(host, root, ['rev-list', '--count', `${since}..HEAD`])
    landings = { count: out ? Number(out.trim()) || 0 : 0, every, since }
  }
  await patchModel($, { landings })
  return landings
}

/**
 * Narrow-test picker: changed files (diff against HEAD + untracked) → areas → one test run over just those
 * (`run` false: only the pick). Never throws.
 */
export async function affectedTests(
  $: EngineInterface,
  options: Options,
  spec: { mode?: 'EditMode' | 'PlayMode'; run?: boolean; waitMs?: number } = {},
): Promise<string> {
  const m = await ensureModel($, options)
  if (!m.project || !m.sessionRoot) return 'Hier ist kein Unity-Projekt.'
  const host = await createHost($)
  const top = (await gitOut(host, m.sessionRoot, ['rev-parse', '--show-toplevel']))?.trim()
  if (!top) return 'Kein Git-Repository: keine geänderten Dateien, aus denen sich Tests wählen ließen.'
  const diff = (await gitOut(host, m.sessionRoot, ['diff', '--name-only', '--relative', 'HEAD'])) ?? ''
  const untracked = (await gitOut(host, m.sessionRoot, ['ls-files', '--others', '--exclude-standard'])) ?? ''
  const projectDir = relative(m.sessionRoot, m.project.root)
  const picked = affectedAreas(
    changedFiles(diff, untracked),
    m.presets,
    projectDir === m.project.root ? '' : projectDir,
    configOf(m).restoreBeforeCommit ?? [],
  )
  const landings = await refreshLandings($, options)
  let text = affectedText(picked, landings)
  if (!m.presets.length)
    text = `Keine Test-Bereiche eingerichtet (tests.areas in .claude/unity.json oder eine Code-Karte), darum lässt sich nichts eingrenzen.\n${text}`
  await patchModel($, { affected: { text, areas: picked.areas.map(a => a.name), at: await host.now() } })
  if (spec.run === false || !picked.areas.length) return text
  const filter = picked.areas.map(a => a.filter).join(';')
  const result = await runTests($, options, spec.mode ?? 'EditMode', filter, spec.waitMs ?? 0)
  return `${text}\n\n${result}`
}

/** The landings reminder line for the pane (undefined below the threshold). */
export function landingsLine(m: UnityModel): string | undefined {
  return landingsReminder(m.landings)
}

// --- worktree ---

/**
 * `git worktree add <worktreeDir>/<name>`, then copies Library/ copy-on-write as a background shell; when the copy
 * ends the worktree becomes the batch target.
 */
export async function createWorktree($: EngineInterface, options: Options, name: string): Promise<string> {
  if (!WORKTREE_NAME.test(name)) return `Ungültiger Worktree-Name "${name}": nur Buchstaben, Ziffern, '.', '_' und '-'.`
  const m = await refreshModel($, options)
  if (!m.project || !m.sessionRoot) return 'Hier ist kein Unity-Projekt.'
  const host = await createHost($)
  const wt = worktreePaths(m.sessionRoot, m.project.root, configOf(m).worktreeDir, name)
  if (await host.fs.exists(wt.path)) return `${wt.path} gibt es schon; nimm einen anderen Namen.`
  const add = await host.run('git', worktreeAddArgs(m.sessionRoot, wt.path), {
    cwd: m.sessionRoot,
    log: () => undefined,
  })
  if (add.code !== 0) return `Worktree anlegen ging nicht: ${(add.stderr || add.stdout).trim().split('\n')[0] ?? ''}`
  const worktree: NonNullable<UnityModel['worktree']> = {
    name,
    path: wt.path,
    projectRoot: wt.projectRoot,
    status: 'copying',
  }
  if (!(await host.fs.exists(wt.library.from))) {
    await patchModel($, { worktree: { ...worktree, status: 'ready' } })
    await refreshModel($, options)
    return `Worktree ${wt.path} angelegt (kein Library/ zum Kopieren: der erste Hintergrund-Lauf importiert alles neu). Hintergrund-Läufe gehen jetzt dorthin.`
  }
  const command = wrapCommand(libraryCopyLine(host.platform, wt.library.from, wt.library.to))
  const started = await startShell($, {
    name: `Library → ${name}`,
    kind: 'worktree',
    command,
    root: wt.projectRoot,
  })
  if ('error' in started) {
    await patchModel($, { worktree: { ...worktree, status: 'failed', error: started.error } })
    return `Worktree ${wt.path} angelegt, aber das Kopieren von Library/ startete nicht: ${started.error}`
  }
  await patchModel($, { worktree: { ...worktree, jobKey: started.job.key } })
  return `Worktree ${wt.path} angelegt; Library/ wird im Hintergrund kopiert (Task ${started.job.taskId ?? '?'}). Hintergrund-Läufe wechseln dorthin, sobald die Kopie fertig ist.`
}

/** `git worktree list --porcelain` → checkouts (the first is the main one). */
export function parseWorktreeList(text: string): { path: string; branch?: string }[] {
  const out: { path: string; branch?: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) out.push({ path: line.slice(9).trim().replace(/\\/g, '/') })
    else if (line.startsWith('branch ') && out.length)
      out[out.length - 1]!.branch = line.slice(7).trim().replace(/^refs\/heads\//, '')
  }
  return out
}

/** The other checkouts of this repo (not the session's own), for the target tab. */
async function listCheckouts(host: Host, sessionRoot: string, projectRoot: string): Promise<UnityModel['checkouts']> {
  const top = (await gitOut(host, sessionRoot, ['rev-parse', '--show-toplevel']))?.trim()
  if (!top) return []
  const list = parseWorktreeList((await gitOut(host, sessionRoot, ['worktree', 'list', '--porcelain'])) ?? '')
  const rel = relative(top, projectRoot)
  const sub = rel && rel !== projectRoot ? rel : ''
  return list
    .map((t, i) => ({
      path: t.path,
      projectRoot: sub ? join(t.path, sub) : t.path,
      name: basename(t.path),
      ...(t.branch ? { branch: t.branch } : {}),
      main: i === 0,
    }))
    .filter(t => t.path !== top)
}

/** Batch runs go to an existing checkout (worktree or main checkout of another session). */
export async function useCheckout($: EngineInterface, options: Options, path: string): Promise<string> {
  const m = await readModel($)
  const c = m.checkouts?.find(x => x.path === path)
  if (!c) return 'Diesen Worktree gibt es nicht mehr.'
  await patchModel($, { worktree: { name: c.name, path: c.path, projectRoot: c.projectRoot, status: 'ready' } })
  await refreshModel($, options)
  return `Hintergrund-Läufe gehen jetzt nach ${c.name}${c.branch ? ` (${c.branch})` : ''}.`
}

/** Batch runs go back to the main checkout (the worktree stays on disk). */
export async function useMainTarget($: EngineInterface): Promise<void> {
  await patchModel($, { worktree: undefined, targetLock: undefined })
}

/** The current run as text (newly red first). */
export async function testsText($: EngineInterface, options: Options): Promise<string> {
  const m = await refreshModel($, options)
  if (!m.tests) return 'No test run yet in this session.'
  return testReport(m.tests, m.previous)
}

// --- background jobs (batchmode + custom) ---

const POLL_MS = 1500
const TAIL_BYTES = 16 * 1024
const MAX_JOBS = 15
let ticker: { cancel(): void } | undefined

function envPrefix(env: Record<string, string> | undefined): string {
  const pairs = Object.entries(env ?? {}).filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
  return pairs.length ? `export ${pairs.map(([k, v]) => `${k}=${shQuote(v)}`).join(' ')} && ` : ''
}

/**
 * Starts a batchmode job (tests / compile / build) or a custom job from `.claude/unity.json` as a background Bash.
 * Batch kinds (and custom jobs marked `batch`) are refused while an editor holds the project.
 */
export async function startBatchJob(
  $: EngineInterface,
  options: Options,
  kind: ModelJob['kind'],
  spec: { mode?: 'EditMode' | 'PlayMode'; filter?: string; custom?: string },
): Promise<string> {
  const m = await refreshModel($, options)
  if (!m.project) return 'Hier ist kein Unity-Projekt.'
  const cfg = configOf(m)
  const custom = kind === 'custom' ? cfg.customJobs?.find(j => j.name === spec.custom) : undefined
  if (kind === 'custom' && !custom) return `Keine Aufgabe "${spec.custom ?? ''}" in .claude/unity.json (customJobs).`
  const target = batchTarget(m)
  if (kind !== 'custom' || custom?.batch) {
    const allowed = batchAllowed({ lock: target.lock, bridgeUp: target.bridgeUp })
    if (!allowed.ok) return `Nicht gestartet: ${allowed.reason ?? ''}`
  }
  if (m.jobs.some(j => j.status === 'running' && j.kind !== 'custom') && kind !== 'custom')
    return 'Für dieses Projekt läuft schon ein Hintergrund-Lauf; warte ihn ab oder stopp ihn im Unity-Panel.'
  const host = await createHost($)
  const now = await host.now()
  let command: string
  let name: string
  let resultsFile: string | undefined
  let logFile: string | undefined
  const root = target.root
  const where = target.worktree ? ` @${target.worktree}` : ''
  if (kind === 'custom' && custom) {
    name = custom.name
    const cwd = custom.batch && m.worktree?.status === 'ready' ? m.worktree.path : m.sessionRoot
    command = wrapCommand(`${envPrefix(cfg.editorEnv)}${custom.command}`, cwd)
  } else {
    if (!m.editorPath)
      return `Unity ${m.project.version} nicht gefunden. Gesucht: ${m.editorTried.join(', ') || '(nirgends)'}. Editor-Pfad in den Plugin-Optionen oder unityPath in .claude/unity.json setzen.`
    let args: string[]
    logFile = join(root, 'Logs', `claude-${kind}-${now}.log`)
    if (kind === 'tests') {
      const mode = spec.mode ?? 'EditMode'
      resultsFile = join(root, 'Logs', `claude-tests-${now}.xml`)
      args = batchTestArgs(root, mode, resultsFile, spec.filter, logFile)
      name = `${mode}-Tests (Hintergrund)${spec.filter ? ` · ${spec.filter}` : ''}${where}`
    } else if (kind === 'build') {
      if (!cfg.buildMethod) return 'Kein buildMethod in .claude/unity.json.'
      args = batchBuildArgs(root, cfg.buildMethod, cfg.buildTarget, logFile)
      name = `Build ${cfg.buildTarget ?? ''}${where}`.trim()
    } else {
      args = batchCompileArgs(root, logFile)
      name = `Kompilier-Check (Hintergrund)${where}`
    }
    command = wrapCommand(`${envPrefix(cfg.editorEnv)}${shJoin([m.editorPath, ...args])}`)
  }
  const started = await startShell($, {
    name,
    kind,
    command,
    root,
    ...(resultsFile ? { resultsFile } : {}),
    ...(logFile ? { logFile } : {}),
    ...(spec.mode ? { mode: spec.mode } : {}),
    ...(kind === 'tests' && !spec.filter ? { full: true } : {}),
  })
  if ('error' in started) return `Nicht gestartet: ${started.error}`
  const job = started.job
  if (kind === 'tests') {
    const previous = Object.fromEntries((m.tests?.results ?? []).map(r => [r.fullName, r.status]))
    await patchModel($, x => ({
      previous,
      tests: mergeRuns(x.tests, {
        state: 'running' as const,
        ...(spec.mode ? { mode: spec.mode } : {}),
        ...(spec.filter ? { filter: spec.filter } : {}),
        results: [],
      }),
    }))
  }
  return `"${name}" läuft als Hintergrund-Task ${job.taskId ?? '(ohne Kennung)'}${job.outputPath ? `; Ausgabe: ${job.outputPath}` : ''}. Am Ende kommt eine Task-Meldung; das Unity-Panel zeigt das Log-Ende.`
}

/** Starts a wrapped command as a background Bash and records it as a job (polled for its exit marker). */
async function startShell(
  $: EngineInterface,
  spec: Pick<ModelJob, 'name' | 'kind' | 'command'> &
    Partial<Pick<ModelJob, 'resultsFile' | 'logFile' | 'mode' | 'full' | 'root'>>,
): Promise<{ job: ModelJob } | { error: string }> {
  const host = await createHost($)
  const now = await host.now()
  const base: ModelJob = { key: `job-${now}`, status: 'running', startedAt: now, tail: [], ...spec }
  let res: Awaited<ReturnType<EngineInterface['tool']['call']>>
  try {
    res = await $.tool.call({
      tool: 'Bash',
      command: spec.command,
      run_in_background: true,
      description: `Unity: ${spec.name}`,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await pushJob($, { ...base, status: 'failed', endedAt: now, error })
    return { error }
  }
  if (res.deny !== undefined) {
    await pushJob($, { ...base, status: 'denied', endedAt: now, error: res.deny })
    return { error: res.deny }
  }
  if (res.isError) {
    const error = res.text ?? 'Bash meldete einen Fehler'
    await pushJob($, { ...base, status: 'failed', endedAt: now, error })
    return { error }
  }
  const info = backgroundInfo(res.result, res.text)
  const job: ModelJob = { ...base, ...info, key: info.taskId ?? base.key }
  await pushJob($, job)
  ensurePolling($)
  return { job }
}

async function pushJob($: EngineInterface, job: ModelJob): Promise<void> {
  await patchModel($, m => ({ jobs: [...m.jobs.filter(j => j.key !== job.key), job].slice(-MAX_JOBS) }))
}

export function ensurePolling($: EngineInterface): void {
  if (ticker) return
  ticker = $.clock.every(POLL_MS, () => void pollJobs($))
}

async function readOutput(host: Host, path: string): Promise<{ tail: string[]; exitCode?: number } | undefined> {
  const st = await host.fs.stat(path)
  if (!st) return undefined
  const offset = Math.max(0, st.size - TAIL_BYTES)
  const text = st.size ? await host.fs.readRange(path, offset, st.size - offset) : ''
  const exitCode = exitCodeOf(text)
  return {
    tail: tailLines(offset ? text.slice(text.indexOf('\n') + 1) : text, 60),
    ...(exitCode !== undefined ? { exitCode } : {}),
  }
}

/** One poll: tails, ends (incl. NUnit results), watchdog. */
export async function pollJobs($: EngineInterface): Promise<void> {
  const m = await readModel($)
  const running = m.jobs.filter(j => j.status === 'running' && j.outputPath)
  if (!running.length) {
    ticker?.cancel()
    ticker = undefined
    return
  }
  const host = await createHost($)
  const now = await host.now()
  const watchdog = (configOf(m).watchdogMinutes ?? 30) * 60000
  for (const job of running) {
    const out = await readOutput(host, job.outputPath ?? '')
    const log = job.logFile ? await readOutput(host, job.logFile) : undefined
    const tail = log?.tail.length ? log.tail : out?.tail
    const patch: Partial<ModelJob> = {}
    if (tail && tail.join('\n') !== job.tail.join('\n')) patch.tail = tail
    if (out?.exitCode !== undefined) {
      patch.exitCode = out.exitCode
      patch.status = out.exitCode === 0 ? 'exited' : 'failed'
      patch.endedAt = now
      if (out.exitCode !== 0) patch.failLog = (tail ?? []).slice(-60)
      if (job.kind === 'tests') await finishBatchTests($, host, job, out.exitCode)
      if (job.kind === 'worktree')
        await patchModel($, mm =>
          mm.worktree?.jobKey === job.key
            ? {
                worktree: {
                  ...mm.worktree,
                  status: out.exitCode === 0 ? ('ready' as const) : ('failed' as const),
                  ...(out.exitCode === 0 ? {} : { error: `Kopieren von Library/ fehlgeschlagen (Exit ${out.exitCode})` }),
                },
              }
            : {},
        )
      void $.ui.toast(`Unity: ${job.name} ${describeExit(job, out.exitCode)}`)
    } else if (now - job.startedAt > watchdog && job.taskId) {
      try {
        await $.tool.call({ tool: 'TaskStop', task_id: job.taskId })
      } catch {
        // already gone
      }
      patch.status = 'timeout'
      patch.endedAt = now
      patch.error = `nach ${Math.round(watchdog / 60000)} min vom Wächter gestoppt`
      void $.ui.toast(`Unity: ${job.name} vom Wächter gestoppt`)
    }
    if (Object.keys(patch).length)
      await patchModel($, mm => ({ jobs: mm.jobs.map(j => (j.key === job.key ? { ...j, ...patch } : j)) }))
  }
}

/** Unity's -runTests exit codes: 0 ok, 2 tests failed, 3 the run broke. */
export function describeExit(job: Pick<ModelJob, 'kind'>, code: number): string {
  if (code === 0) return 'fertig'
  if (job.kind === 'tests' && code === 2) return 'fertig: Tests rot'
  if (job.kind === 'tests' && code === 3) return 'abgebrochen (Exit 3: Lauf kaputt, siehe Log)'
  return `fehlgeschlagen (Exit ${code})`
}

async function finishBatchTests($: EngineInterface, host: Host, job: ModelJob, code: number): Promise<void> {
  let results: TestRun['results'] = []
  try {
    if (job.resultsFile && (await host.fs.exists(job.resultsFile)))
      results = parseNUnitXml(await host.fs.read(job.resultsFile))
  } catch {
    results = []
  }
  const run: TestRun = {
    state: code === 3 || (!results.length && code !== 0) ? 'error' : 'done',
    ...(job.mode ? { mode: job.mode } : {}),
    results,
    finishedAt: await host.now(),
    ...(code === 3 || (!results.length && code !== 0)
      ? { error: `Exit ${code}; letzte Log-Zeilen im Unity-Panel` }
      : {}),
  }
  // The batch run keeps the filter it started with (set when the job began), so a narrow run adds to the last one.
  await patchModel($, x => {
    const filter = !job.full && x.tests?.state === 'running' ? x.tests.filter : undefined
    return { tests: mergeRuns(x.tests, { ...run, ...(filter ? { filter } : {}) }) }
  })
  if (job.full && fullRunGreen(run)) await recordFullRun($, {})
}

export async function stopJob($: EngineInterface, key: string): Promise<string | undefined> {
  const job = (await readModel($)).jobs.find(j => j.key === key)
  if (!job || job.status !== 'running' || !job.taskId) return 'läuft nicht'
  try {
    const res = await $.tool.call({ tool: 'TaskStop', task_id: job.taskId })
    if (res.deny !== undefined) return res.deny
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  await patchModel($, m => ({ jobs: m.jobs.map(j => (j.key === key ? { ...j, status: 'stopped' as const } : j)) }))
  return undefined
}

/** Marks a job stopped when the model stopped its task (TaskStop hook). */
export async function markStopped($: EngineInterface, taskId: string): Promise<void> {
  await patchModel($, m => ({
    jobs: m.jobs.map(j => (j.taskId === taskId && j.status === 'running' ? { ...j, status: 'stopped' as const } : j)),
  }))
}

// --- screenshot ---

export const BATCHMODE_SHOT =
  'Screenshots im Play-Modus brauchen ein sichtbares Editor-Fenster (kein Hintergrund-Lauf). Play stoppen für ein Bild aus der Szenen-Kamera, oder das Projekt im Unity-Editor öffnen.'

export async function screenshot(
  $: EngineInterface,
  options: Options,
  size?: { width?: number; height?: number },
): Promise<{ path: string; base64: string; ui?: play.ShotUi } | { error: string }> {
  const m = await refreshModel($, options)
  if (!m.project) return { error: 'Hier ist kein Unity-Projekt.' }
  const host = await createHost($)
  const path = join(m.project.root, 'Temp', 'ClaudeBridge', 'shots', `shot-${await host.now()}.png`)
  if (m.bridge.up && m.bridge.batchmode && m.bridge.isPlaying) return { error: BATCHMODE_SHOT }
  const askedAt = await host.now()
  const res = await bridgeCommand($, options, { cmd: 'screenshot', path, ...size }, 20000)
  if (!res.ok)
    return { error: m.bridge.batchmode && /kein Bild geschrieben|sichtbares Editor-Fenster/i.test(res.error) ? BATCHMODE_SHOT : res.error }
  const stale = play.staleShot(res.data, path, askedAt)
  if (stale) return { error: stale }
  const written = path
  try {
    const base64 = await host.fs.readBase64(written)
    await patchModel($, { lastShot: written })
    const ui = play.parseShotUi(res.data.ui)
    return { path: written, base64, ...(ui ? { ui } : {}) }
  } catch (e) {
    return { error: `Screenshot geschrieben, aber nicht lesbar (${written}): ${e instanceof Error ? e.message : String(e)}` }
  }
}

// --- provider-backed commands (capture, goto, perf, sounds; lib/play.ts) ---

/** A lib/play.ts sender bound to this session's bridge (checks project + heartbeat before every command). */
export function playSend($: EngineInterface, options: Options): play.Send {
  return (command, timeoutMs) => bridgeCommand($, options, command, timeoutMs)
}

/** Capture with the PNG read back as base64 (for an inline image). */
export async function capture(
  $: EngineInterface,
  options: Options,
  size?: { width?: number; height?: number },
): Promise<(play.CaptureResult & { base64: string }) | play.PlayError> {
  const m = await refreshModel($, options)
  if (!m.project) return { code: 'no-project', error: 'Hier ist kein Unity-Projekt.' }
  if (m.bridge.up && m.bridge.batchmode && m.bridge.isPlaying) return { code: 'batchmode', error: BATCHMODE_SHOT }
  const host = await createHost($)
  const path = join(m.project.root, 'Temp', 'ClaudeBridge', 'shots', `capture-${await host.now()}.png`)
  const res = await play.capture(playSend($, options), { path, ...size, askedAt: await host.now() })
  if (play.isPlayError(res)) return res
  try {
    const base64 = await host.fs.readBase64(res.path)
    await patchModel($, { lastShot: res.path })
    return { ...res, base64 }
  } catch (e) {
    return { error: `Aufnahme geschrieben, aber nicht lesbar (${res.path}): ${e instanceof Error ? e.message : String(e)}` }
  }
}

export function gotoSpot($: EngineInterface, options: Options, spot: play.Spot | string) {
  return play.gotoSpot(playSend($, options), spot)
}
export function perfRecord($: EngineInterface, options: Options, seconds: number) {
  return play.perfRecord(playSend($, options), seconds)
}
export function soundList($: EngineInterface, options: Options) {
  return play.soundList(playSend($, options))
}
/**
 * Plays a sound; a sound that played but may stay silent (Game view muted, Unity in the background with an editor
 * that pauses its audio, a bridge before 0.4 that does not say) raises a toast that says why.
 */
export async function soundPlay($: EngineInterface, options: Options, sound: string, mode: 'near' | 'flat' = 'near') {
  const res = await play.soundPlay(playSend($, options), sound, mode)
  const hints = play.isPlayError(res) ? [] : play.soundHints(res)
  if (hints.length) $.ui.toast(hints.map(h => h.text).join(' · '), { timeoutMs: 8000 })
  return res
}

/** „Unity vorn“: brings the editor to the front (macOS), without giving the focus back. */
export async function unityToFront($: EngineInterface, options: Options): Promise<string | undefined> {
  const ready = await bridgeReady($, options)
  if ('ok' in ready) return ready.error
  const host = await createHost($)
  const beat = await readStatus(host.fs, ready.root, await host.now())
  const f = await activatePid(host, beat.status?.pid ?? 0)
  return f.ok ? undefined : f.error
}
export function soundStop($: EngineInterface, options: Options) {
  return play.soundStop(playSend($, options))
}
export function mixGet($: EngineInterface, options: Options) {
  return play.mixGet(playSend($, options))
}
export function mixSet($: EngineInterface, options: Options, group: string, db: number) {
  return play.mixSet(playSend($, options), group, db)
}
