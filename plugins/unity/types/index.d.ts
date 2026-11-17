// PluginState contract of the `unity` plugin. No imports here: shapes are restated structurally (lib/ holds the
// logic types; TypeScript checks they stay compatible where the model is written). No imports allowed here.

export type UiKitState = {
  confirm?: string
  toggled: string[]
  more: string[]
  details: string[]
  logMore: string[]
}

export type ModelCompilerMessage = {
  severity: 'error' | 'warning'
  message: string
  file?: string
  line?: number
  column?: number
  code?: string
}

export type ModelTestResult = {
  fullName: string
  name: string
  status: 'Passed' | 'Failed' | 'Skipped' | 'Inconclusive'
  message?: string
  stack?: string
  duration?: number
}

export type ModelTestRun = {
  runId?: string
  state: 'idle' | 'running' | 'done' | 'error'
  mode?: 'EditMode' | 'PlayMode'
  filter?: string
  results: ModelTestResult[]
  error?: string
  finishedAt?: number
}

export type ModelConsoleEntry = {
  seq: number
  type: 'Error' | 'Assert' | 'Warning' | 'Log' | 'Exception'
  message: string
  stack?: string
  time?: number
}

export type ModelJob = {
  key: string
  name: string
  kind: 'tests' | 'compile' | 'build' | 'custom' | 'worktree'
  command: string
  status: 'running' | 'exited' | 'failed' | 'stopped' | 'denied' | 'timeout'
  startedAt: number
  endedAt?: number
  exitCode?: number
  taskId?: string
  outputPath?: string
  resultsFile?: string
  mode?: 'EditMode' | 'PlayMode'
  tail: string[]
  error?: string
  /** Unity's -logFile of a batchmode job (live tail + the failure view). */
  logFile?: string
  /** The last 60 lines of the log after a failed run. */
  failLog?: string[]
  /** A test run without a filter (records the full-suite commit when it passes). */
  full?: boolean
  /** The Unity project the job ran against (main checkout or worktree). */
  root?: string
}

export type UnityModel = {
  phase: 'unknown' | 'none' | 'ok'
  sessionRoot?: string
  project?: { root: string; sessionRoot: string; version: string; revision?: string; name: string }
  editorPath?: string
  editorTried: string[]
  configFound: boolean
  /** `.claude/unity.json` as parsed (lib/unity.ts ProjectConfig). */
  config: Record<string, unknown>
  presets: { name: string; filter: string; source: 'config' | 'docs'; paths?: string[] }[]
  lock: 'free' | 'held' | 'stale'
  bridge: {
    up: boolean
    why?: 'missing' | 'stale'
    isCompiling?: boolean
    isPlaying?: boolean
    isPaused?: boolean
    unityVersion?: string
    scene?: string
    batchmode?: boolean
    compileSeq?: number
  }
  compile?: { seq: number; at: number; source: 'bridge' | 'log'; messages: ModelCompilerMessage[] }
  console: ModelConsoleEntry[]
  tests?: ModelTestRun
  /** Status per full test name from the run before the current one (newly-red detection). */
  previous: Record<string, 'Passed' | 'Failed' | 'Skipped' | 'Inconclusive'>
  filterInput: string
  jobs: ModelJob[]
  lastShot?: string
  /** A worktree as the safe target for batch runs (ready once Library is copied). */
  worktree?: {
    name: string
    path: string
    projectRoot: string
    status: 'copying' | 'ready' | 'failed'
    jobKey?: string
    error?: string
  }
  /** Lock state of the worktree's project (batch safety there). */
  targetLock?: 'free' | 'held' | 'stale'
  /** Bridge run id of a full-suite run in flight (recorded when it finishes green). */
  fullPending?: string
  /** Commits since the last recorded full test run. */
  landings?: { count: number; every: number; since?: string }
  /** The last narrow-test pick. */
  affected?: { text: string; areas: string[]; at: number }
  busy?: string
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    unity: {
      ui: ShapedState<UiKitState>
      model: ShapedState<UnityModel>
    }
  }
}
