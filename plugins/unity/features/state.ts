/**
 * The plugin's one model atom and every action on it: project/bridge refresh, compile gate, tests, play controls,
 * screenshots, batchmode + custom jobs as Claude Code background shells (pattern of ds-solutions-flow's run feature:
 * exit marker in the output file, polled with $.clock.every, stopped through TaskStop).
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { ModelJob, UnityModel } from '../types'
import { readCompile, readConsole, readStatus, readTests, sendCommand, sleep, type BridgeCommand } from '../lib/bridge'
import { createHost, type Host } from '../lib/host'
import { lockState } from '../lib/lock'
import { join } from '../lib/path'
import { backgroundInfo, exitCodeOf, shJoin, shQuote, tailLines, wrapCommand } from '../lib/shell'
import {
  batchAllowed,
  batchBuildArgs,
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
  type ProjectConfig,
  type TestRun,
} from '../lib/unity'

export const PLUGIN = 'unity'

export type Options = {
  compileGate?: boolean
  compileWaitSeconds?: number
  debounceMs?: number
  editorPath?: string
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

// --- refresh ---

/** Re-detects the project, editor, config, lock and bridge and reads the bridge's files. */
export async function refreshModel($: EngineInterface, options: Options): Promise<UnityModel> {
  const host = await createHost($)
  const sessionRoot = await $.session.root()
  const loaded = await loadProjectConfig(sessionRoot, host.fs)
  const cfg = loaded.config
  const project = cfg.projectDir
    ? await detectProject(join(sessionRoot, cfg.projectDir), host.fs)
    : await detectProject(sessionRoot, host.fs)
  if (!project) {
    await patchModel($, { phase: 'none', sessionRoot, configFound: loaded.configFound, config: { ...cfg } })
    return readModel($)
  }
  const editor = await findEditor(host, project.version, host.fs, options.editorPath || cfg.unityPath)
  const lock = await lockState(host, project.root)
  const live = await readBridge(host, project.root)
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
    ...live,
    tests: live.tests ?? m.tests,
    error: undefined,
  }))
  return readModel($)
}

async function readBridge(
  host: Host,
  project: string,
): Promise<Pick<UnityModel, 'bridge' | 'console'> & Partial<UnityModel>> {
  const s = await readStatus(host.fs, project, await host.now())
  if (!s.up) return { bridge: { up: false, why: s.why }, console: [] }
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
    },
    console: (await readConsole(host.fs, project)).slice(-200),
  }
  const compile = await readCompile(host.fs, project)
  if (compile)
    out.compile = { seq: compile.seq, at: compile.finishedAt ?? 0, source: 'bridge', messages: compile.messages }
  const tests = await readTests(host.fs, project)
  if (tests) out.tests = tests
  return out
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
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const m = await refreshModel($, options)
  if (!m.project)
    return {
      ok: false,
      error: 'No Unity project here (no ProjectSettings/ProjectVersion.txt at the root or one level down).',
    }
  if (!m.bridge.up)
    return {
      ok: false,
      error:
        'The editor bridge is not running. Open the project in Unity with the com.denny99.claude-bridge package installed (/unity shows how).',
    }
  const host = await createHost($)
  const res = await sendCommand(host, m.project.root, command, timeoutMs)
  await refreshModel($, options)
  return res
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
  pending = runGate($, options).catch(e => `Unity compile gate failed: ${e instanceof Error ? e.message : String(e)}`)
  return pending
}

async function runGate($: EngineInterface, options: Options): Promise<string | undefined> {
  const host = await createHost($)
  await sleep(host, Math.max(0, options.debounceMs ?? 400))
  const files = pendingFiles
  pendingFiles = []
  pending = undefined
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
        await refreshModel($, options)
        return 'Unity refreshed: nothing to compile.'
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
  if (!m.project) return 'No Unity project here.'
  const previous = Object.fromEntries((m.tests?.results ?? []).map(r => [r.fullName, r.status]))
  const host = await createHost($)
  if (m.bridge.up) {
    if (m.bridge.isPlaying)
      return 'The editor is in Play mode: stop it first (unity_stop) — tests would interrupt the running game.'
    const res = await sendCommand(host, m.project.root, { cmd: 'run-tests', mode, ...(filter ? { filter } : {}) })
    if (!res.ok) return `Tests not started: ${res.error}`
    const runId = String(res.data.runId ?? '')
    await patchModel($, {
      previous,
      tests: { runId, state: 'running', mode, ...(filter ? { filter } : {}), results: [] },
    })
    if (waitMs <= 0) return `Started ${mode} tests in the editor (run ${runId}). The unity pane shows the results.`
    const run = await awaitBridgeTests(host, m.project.root, runId, waitMs)
    if (run) await patchModel($, { tests: run })
    if (!run || run.state === 'running')
      return `${mode} tests still running after ${Math.round(waitMs / 1000)} s (run ${runId}). Call unity_test_results later.`
    return testReport(run, previous)
  }
  const started = await startBatchJob($, options, 'tests', { mode, filter })
  return started
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
  if (!m.project) return 'No Unity project here.'
  const cfg = configOf(m)
  const custom = kind === 'custom' ? cfg.customJobs?.find(j => j.name === spec.custom) : undefined
  if (kind === 'custom' && !custom) return `No custom job named "${spec.custom ?? ''}" in .claude/unity.json.`
  if (kind !== 'custom' || custom?.batch) {
    const allowed = batchAllowed({ lock: m.lock, bridgeUp: m.bridge.up })
    if (!allowed.ok) return `Not started: ${allowed.reason ?? ''}`
  }
  if (m.jobs.some(j => j.status === 'running' && j.kind !== 'custom') && kind !== 'custom')
    return 'A batchmode job is already running for this project; wait for it or stop it in the unity pane.'
  const host = await createHost($)
  const now = await host.now()
  let command: string
  let name: string
  let resultsFile: string | undefined
  if (kind === 'custom' && custom) {
    name = custom.name
    command = wrapCommand(`${envPrefix(cfg.editorEnv)}${custom.command}`, m.sessionRoot)
  } else {
    if (!m.editorPath)
      return `Unity ${m.project.version} not found. Tried: ${m.editorTried.join(', ') || '(none)'}. Set the editor path in the plugin options or unityPath in .claude/unity.json.`
    let args: string[]
    if (kind === 'tests') {
      const mode = spec.mode ?? 'EditMode'
      resultsFile = join(m.project.root, 'Logs', `claude-tests-${now}.xml`)
      args = batchTestArgs(m.project.root, mode, resultsFile, spec.filter)
      name = `${mode} tests (batch)${spec.filter ? ` · ${spec.filter}` : ''}`
    } else if (kind === 'build') {
      if (!cfg.buildMethod) return 'No buildMethod in .claude/unity.json.'
      args = batchBuildArgs(m.project.root, cfg.buildMethod, cfg.buildTarget)
      name = `Build ${cfg.buildTarget ?? ''}`.trim()
    } else {
      args = batchCompileArgs(m.project.root)
      name = 'Compile check (batch)'
    }
    command = wrapCommand(`${envPrefix(cfg.editorEnv)}${shJoin([m.editorPath, ...args])}`)
  }
  const base: ModelJob = {
    key: `job-${now}`,
    name,
    kind,
    command,
    status: 'running',
    startedAt: now,
    tail: [],
    ...(resultsFile ? { resultsFile } : {}),
    ...(spec.mode ? { mode: spec.mode } : {}),
  }
  let res: Awaited<ReturnType<EngineInterface['tool']['call']>>
  try {
    res = await $.tool.call({ tool: 'Bash', command, run_in_background: true, description: `Unity: ${name}` })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await pushJob($, { ...base, status: 'failed', endedAt: now, error })
    return `Not started: ${error}`
  }
  if (res.deny !== undefined) {
    await pushJob($, { ...base, status: 'denied', endedAt: now, error: res.deny })
    return `Not started: ${res.deny}`
  }
  if (res.isError) {
    await pushJob($, { ...base, status: 'failed', endedAt: now, error: res.text ?? 'Bash reported an error' })
    return `Not started: ${res.text ?? 'Bash reported an error'}`
  }
  const info = backgroundInfo(res.result, res.text)
  const job: ModelJob = { ...base, ...info, key: info.taskId ?? base.key }
  if (kind === 'tests') {
    const previous = Object.fromEntries((m.tests?.results ?? []).map(r => [r.fullName, r.status]))
    await patchModel($, {
      previous,
      tests: {
        state: 'running',
        ...(spec.mode ? { mode: spec.mode } : {}),
        ...(spec.filter ? { filter: spec.filter } : {}),
        results: [],
      },
    })
  }
  await pushJob($, job)
  ensurePolling($)
  return `Started "${name}" as background task ${job.taskId ?? '(id unknown)'}${job.outputPath ? `; output: ${job.outputPath}` : ''}. You get a task notification when it ends; the unity pane shows the log tail.`
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
    const patch: Partial<ModelJob> = {}
    if (out && out.tail.join('\n') !== job.tail.join('\n')) patch.tail = out.tail
    if (out?.exitCode !== undefined) {
      patch.exitCode = out.exitCode
      patch.status = out.exitCode === 0 ? 'exited' : 'failed'
      patch.endedAt = now
      if (job.kind === 'tests') await finishBatchTests($, host, job, out.exitCode)
      void $.ui.toast(`Unity: ${job.name} ${describeExit(job, out.exitCode)}`)
    } else if (now - job.startedAt > watchdog && job.taskId) {
      try {
        await $.tool.call({ tool: 'TaskStop', task_id: job.taskId })
      } catch {
        // already gone
      }
      patch.status = 'timeout'
      patch.endedAt = now
      patch.error = `stopped by the watchdog after ${Math.round(watchdog / 60000)} min`
      void $.ui.toast(`Unity: ${job.name} stopped by the watchdog`)
    }
    if (Object.keys(patch).length)
      await patchModel($, mm => ({ jobs: mm.jobs.map(j => (j.key === job.key ? { ...j, ...patch } : j)) }))
  }
}

/** Unity's -runTests exit codes: 0 ok, 2 tests failed, 3 the run broke. */
export function describeExit(job: Pick<ModelJob, 'kind'>, code: number): string {
  if (code === 0) return 'done'
  if (job.kind === 'tests' && code === 2) return 'finished: tests failed'
  if (job.kind === 'tests' && code === 3) return 'broke (exit 3: run failed, see log)'
  return `failed (exit ${code})`
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
      ? { error: `exit ${code}; last log lines in the unity pane` }
      : {}),
  }
  await patchModel($, { tests: run })
}

export async function stopJob($: EngineInterface, key: string): Promise<string | undefined> {
  const job = (await readModel($)).jobs.find(j => j.key === key)
  if (!job || job.status !== 'running' || !job.taskId) return 'not running'
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

export async function screenshot(
  $: EngineInterface,
  options: Options,
  size?: { width?: number; height?: number },
): Promise<{ path: string; base64: string } | { error: string }> {
  const m = await refreshModel($, options)
  if (!m.project) return { error: 'No Unity project here.' }
  const host = await createHost($)
  const path = join(m.project.root, 'Temp', 'ClaudeBridge', 'shots', `shot-${await host.now()}.png`)
  const res = await bridgeCommand($, options, { cmd: 'screenshot', path, ...size }, 20000)
  if (!res.ok) return { error: res.error }
  const written = typeof res.data.path === 'string' && res.data.path ? res.data.path : path
  try {
    const base64 = await host.fs.readBase64(written)
    await patchModel($, { lastShot: written })
    return { path: written, base64 }
  } catch (e) {
    return { error: `screenshot written but not readable (${written}): ${e instanceof Error ? e.message : String(e)}` }
  }
}
