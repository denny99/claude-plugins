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
  /** Red in an earlier run that did not contain this test. */
  carried?: boolean
}

export type ModelTestRun = {
  runId?: string
  state: 'idle' | 'running' | 'done' | 'error'
  mode?: 'EditMode' | 'PlayMode'
  filter?: string
  results: ModelTestResult[]
  error?: string
  finishedAt?: number
  total?: number
  startedAt?: number
  current?: string
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

/** One frame-time recording (lib/play.ts PerfResult, restated). */
export type ModelPerf = {
  seconds: number
  requestedSeconds: number
  frames: number
  budgetMs: number
  avgMs: number
  p50: number
  p95: number
  p99: number
  worst: number
  hitches: number
  seriesStep: number
  series: number[]
  costs: { name: string; avgMs: number; maxMs: number; hitchAvgMs: number; hitchMaxMs: number; hitchShare: number }[]
  /** How many cost sources the project registered; missing from older bridges (written since this change, not yet tried in the editor). */
  sources?: number
  aborted?: string
  /** Newer bridges: wall-clock length, seconds since Play start at the beginning, position of the worst frame. */
  wallSeconds?: number
  sincePlay?: number
  worstAt?: number
  spot?: Record<string, unknown>
}

/** The pane's tabs (console and target sit behind "More"). */
export type UnityTab = 'overview' | 'tests' | 'review' | 'perf' | 'console' | 'target'

export type UnityModel = {
  phase: 'unknown' | 'none' | 'ok'
  /** Set at session start: this folder is a Unity project (the starter chip shows). */
  unityHere?: boolean
  sessionRoot?: string
  project?: { root: string; sessionRoot: string; version: string; revision?: string; name: string; label?: string }
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
    /** Newer bridges: active scene name and the first Build Settings scene. */
    sceneName?: string
    startScene?: string
    batchmode?: boolean
    compileSeq?: number
    /** Version the bridge reports in its heartbeat (newer bridges only). */
    version?: string
    /** Stale heartbeat: milliseconds since its last write. */
    age?: number
  }
  /** Bridge package version found in the project (heartbeat, else Library/PackageCache). */
  bridgeInstalled?: string
  /** No editor here, but one runs for another checkout of the same repo (git worktree list). */
  editorElsewhere?: { project: string; checkout: string; name: string; main: boolean; here: string; hereMain: boolean }
  /** Tests tab: "Alle Tests" chosen on purpose (no filter, no area). */
  testScope?: 'all'
  compile?: { seq: number; at: number; source: 'bridge' | 'log'; messages: ModelCompilerMessage[] }
  console: ModelConsoleEntry[]
  tests?: ModelTestRun
  /** Status per full test name from the run before the current one (newly-red detection). */
  previous: Record<string, 'Passed' | 'Failed' | 'Skipped' | 'Inconclusive'>
  filterInput: string
  jobs: ModelJob[]
  lastShot?: string
  /** First enabled Build Settings scene (heartbeat of newer bridges, else ProjectSettings/EditorBuildSettings.asset); read while no scene is open. */
  startScene?: string
  /** A worktree as the safe target for batch runs (ready once Library is copied). */
  worktree?: {
    name: string
    path: string
    projectRoot: string
    status: 'copying' | 'ready' | 'failed'
    jobKey?: string
    error?: string
  }
  /** Other checkouts of the repo (`git worktree list`), read while the target tab is open. */
  checkouts?: { path: string; projectRoot: string; name: string; branch?: string; main: boolean }[]
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
  /** The open tab (absent: overview). */
  tab?: UnityTab
  /** The last frame-time recordings, newest first (at most 5). */
  perfRuns?: { at: number; perf: ModelPerf }[]
  /** Why the last recording failed (code from lib/play.ts PlayError). */
  perfError?: { code?: string; error: string }
  /** Console tab filter. */
  consoleFilter?: 'error' | 'warning' | 'all'
}

/** Review tab (features/review): sub-tab, drafts, the picture viewer and the report draft. */
export type ReviewMark = { tool: 'pen' | 'arrow'; color: 'red' | 'yellow' | 'blue'; pts: [number, number][] }
export type ReviewViewState = {
  /** `claude`: shown through unity_review_show; `item`: a picture of the review list; `report`: Problem melden. */
  source: 'claude' | 'item' | 'report'
  id: string
  title: string
  question?: string
  /** One group per direction / view; each a list of frame files (absolute). */
  groups: { label: string; frames: string[] }[]
  group: number
  frame: number
  playing: boolean
  marks: ReviewMark[]
  tool: 'pen' | 'arrow'
  color: 'red' | 'yellow' | 'blue'
  note: string
}
export type ReviewReportState = {
  shot?: string
  preview?: string
  spot?: unknown
  spotLine?: string
  facts: string[]
  kind?: string
  note: string
  measure: boolean
  busy?: string
  /** What happens once the detached measurement ends. */
  pending?: 'send' | 'keep'
  error?: string
}
export type ReviewUiState = {
  sub: string
  open?: string
  drafts: Record<string, string>
  attachShot: boolean
  notice?: string
  view?: ReviewViewState
  report?: ReviewReportState
  /** The last answer from the viewer or a report, read back by unity_review_feedback. */
  feedback?: { text: string; image?: string; svg?: string; at: number }
  sounds?: {
    list: { id: string; name: string; group: string; duration: number; takes: number }[]
    mix: { group: string; db: number }[]
    mode: 'near' | 'flat'
    playing?: string
    musicOpen: boolean
    error?: string
    /** The one sound group shown unfolded (the others are a row each); unset = the first with new sounds. */
    openGroup?: string
    /** How many rows of the open group / of the music are shown (pages of 20, "weitere"). */
    more?: number
    musicMore?: number
  }
}

declare module 'claude-code' {
  interface PluginState {
    unity: {
      ui: ShapedState<UiKitState>
      model: ShapedState<UnityModel>
      review: ShapedState<ReviewUiState>
    }
  }
}
