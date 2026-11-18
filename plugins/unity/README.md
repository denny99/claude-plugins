# unity — Unity inside Claude Code

A Claude Code mod for any Unity project, on macOS and Windows. It finds the Unity project in the session (at the root
or one level down), the matching editor through Unity Hub, and talks to the open editor through a small editor-only
package (the **bridge**, in `bridge/com.denny99.claude-bridge`).

## What it does

- **Compile gate.** After Claude edits or writes a `.cs`/`.asmdef`/`.asmref`/`.rsp` file, the open editor refreshes
  and the C# errors (and warnings of the edited files) are appended to that edit's result. Parallel edits share one
  refresh (`debounceMs`). An editor in **Play mode is never refreshed** (unless `refreshWhilePlaying`); Claude is told
  to restart Play instead. Without the bridge it falls back to the last compile in `Editor.log`.
- **Edit notes** (never blocks): new assets without `.meta` (file and folders), hand edits of serialized YAML
  (`.unity`, `.prefab`, `.asset`, …), wall-clock timing in tests, banned APIs and sync reminders from the project config,
  Play restart vs. reload per file type.
- **Bash guards** (refusals with an instructive reason, decided in `tool.check` so background shells keep working;
  both fail open):
  - `git commit` while a file under `restoreBeforeCommit` is modified → refused; the reason names the exact
    `git checkout -- <file>` (`git checkout HEAD -- <file>` when staged) to run first. Option `commitGuard`.
  - `mv`/`git mv`/`rm`/`git rm` (and best effort `move`, `del`, PowerShell `Move-Item`/`Remove-Item`) of an asset under
    `Assets/` whose `.meta` exists but is not part of the same command → refused with the corrected command. Option
    `metaGuard`.
- **Worktree for batch runs**: `unity_worktree {name}` / `/unity-worktree <name>` / pane button _Worktree_ runs
  `git worktree add <worktreeDir>/<name>` and copies `Library/` copy-on-write in the background (macOS `cp -c -R`,
  Linux `cp --reflink=auto -R`, Windows `robocopy /E /NFL /NDL`). When the copy ends, batch runs (tests, compile check,
  build, `batch` custom jobs) go to the worktree; _Use main_ switches back. Tests asked for while the editor plays run
  there too.
- **Narrow tests**: `unity_affected_tests` / `/unity-affected` / pane button _Affected_ maps changed files
  (`git diff HEAD` + untracked) to test areas (`tests.paths` globs, backticked `Assets/…` paths in the code-map section,
  else folder names matching the area) and runs only those. A green full run records HEAD; after `fullSuiteEvery`
  commits (default 5) the pane and the tool remind to run the full suite.
- **Pane `/unity`**: editor state (Play / Pause / Stop, Screenshot), the safe target (lock file, whether batch runs are
  allowed), last compile with _Fix_ buttons, console errors/warnings with _Fix with Claude_, EditMode/PlayMode tests
  with a filter input and per-area presets (newly red first), batch jobs and the project's custom jobs with log tail; a failed batch job shows the last 60 lines of its
  `-logFile`.
- **Batchmode** (tests, compile check, build, custom jobs marked `batch`) runs as a Claude Code background shell, only
  when **no editor holds the project** (`Temp/UnityLockfile` held, checked with `lsof` on macOS and an exclusive open in
  PowerShell on Windows). A watchdog stops jobs after `watchdogMinutes`. `-runTests` exit codes: 0 ok, 2 tests failed,
  3 run broke; results come from the NUnit XML.
- **Tools for Claude**: `unity_status`, `unity_console`, `unity_refresh`, `unity_run_tests {mode, filter?, waitSeconds?}`,
  `unity_affected_tests {mode?, run?, waitSeconds?}`, `unity_worktree {name}`, `unity_test_results`, `unity_play`, `unity_stop`, `unity_screenshot` (returns the PNG as an image plus its path).
- **Commands**: `/unity`, `/unity-test [play] [filter|area]`, `/unity-affected [play]`, `/unity-worktree <name>`,
  `/unity-play`, `/unity-screenshot`, `/unity-init`.

## Setup

1. Install the plugin: `claude plugin marketplace add denny99/claude-plugins`, then
   `claude plugin install unity@denny99`.
2. Install the bridge in the Unity project: Package Manager → _Add package from git URL_ →
   `https://github.com/denny99/claude-plugins.git?path=/plugins/unity/bridge/com.denny99.claude-bridge`
   (details in the bridge's README).
3. Optional: `/unity-init` drafts a `.claude/unity.json` for the project from its docs; review it and let Claude write it.

## Project config `.claude/unity.json`

Everything project-specific lives here; nothing of a single game is built in. All keys are optional.

```json
{
  "unityPath": "",
  "projectDir": "unity",
  "worktreeDir": ".worktrees",
  "editorEnv": { "GAME_MUTE": "1" },
  "tests": {
    "areas": { "Core": "MyGame.Tests.Core", "World": "MyGame.Tests.World;MyGame.Tests.Places" },
    "paths": { "World": ["Assets/Game/World/**", "Assets/Game/Places/**"] }
  },
  "fullSuiteEvery": 5,
  "filterDocs": ["docs/code-map.md"],
  "bannedApis": [{ "glob": "Assets/Game/Sim/**", "patterns": ["System.Random", "DateTime.Now"] }],
  "restoreBeforeCommit": ["unity/Packages/packages-lock.json"],
  "syncReminders": [{ "glob": "**/texts.*.json", "message": "Texts changed: run the text sync job." }],
  "customJobs": [{ "name": "Smoke", "command": "node tools/smoke.mjs", "batch": true }],
  "playRestart": { "*.cs": "restart", "*.json": "reload" },
  "refreshWhilePlaying": false,
  "watchdogMinutes": 30,
  "buildMethod": "Build.Mac",
  "buildTarget": "StandaloneOSX"
}
```

Test filters are regexes on full test names, several separated by `;`. Without `tests.areas`, presets are read from
`docs/code-map.md`-style docs: each `##`/`###` section with ``Filter `...` `` becomes an area (a
`FullyQualifiedName~A|FullyQualifiedName~B` dotnet filter is turned into `A|B`).

## Project providers (bridge 0.2+)

Spots (capture + jump back), frame-time recordings and a sound board come from the Unity project itself: it implements
`IClaudeSpotProvider`, `IClaudePerfSource` or `IClaudeSoundBoard` from the bridge package and registers them (bridge
README, “Project providers”). The mod's typed client is `lib/play.ts` (`capture`, `gotoSpot`, `perfRecord`,
`soundList`, `soundPlay`, `soundStop`, `mixGet`, `mixSet`; bound to the session in `features/state.ts`). Without a
provider the calls answer `code: 'no-provider'` with a sentence to show.

## Plugin options

`compileGate` (on), `compileWaitSeconds` (60), `debounceMs` (400), `editorPath` (empty: found through Unity Hub,
including the Hub's custom install location), `commitGuard` (on), `metaGuard` (on).

## Limits

- The Bash guards read the command line, not a real shell: commands built at run time (variables, `$(…)`,
  `powershell -Command "…"`) pass unchecked.
- The worktree is not removed by the mod (`git worktree remove` when done).
- The bridge is verified on Unity 6000.6.7f1 only (see its README).
