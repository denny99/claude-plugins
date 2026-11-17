# Claude Code Bridge (`com.denny99.claude-bridge`)

Editor-only Unity package for the Claude Code `unity` plugin (denny99 marketplace). It lets Claude see what the open
editor sees: compile errors right after an edit, the console, test results, Play mode state and Game view screenshots.

## Install

Package Manager → **+** → **Add package from git URL…**

```
https://github.com/denny99/claude-plugins.git?path=/plugins/unity/bridge/com.denny99.claude-bridge
```

The repository is private: Unity uses your git credentials (an SSH URL works too:
`git@github.com:denny99/claude-plugins.git?path=/plugins/unity/bridge/com.denny99.claude-bridge`).

Or from a local checkout: **Add package from disk…** → this folder's `package.json`, or in `Packages/manifest.json`:

```json
"com.denny99.claude-bridge": "file:/path/to/claude-plugins/plugins/unity/bridge/com.denny99.claude-bridge"
```

It depends on `com.unity.test-framework` (1.1.33 or newer; Unity 6 ships 1.4+).

## How it talks to Claude

No sockets, no network: a socket does not survive a domain reload. The bridge polls a folder from
`EditorApplication.update`:

| File in `<project>/Temp/ClaudeBridge/` | Written by | Content |
| --- | --- | --- |
| `status.json` | bridge, every second | heartbeat: Unity version, compiling, playing, paused, compile counter, scene |
| `cmd-<id>.json` | plugin | one command: `refresh`, `play`, `stop`, `pause`, `run-tests` (`mode`, `filter`), `screenshot` (`path`, `width`, `height`), `open-scene` (`path`), `select` (`path`), `clear-console` |
| `result-<id>.json` | bridge | `{ id, ok, error, runId, path, compileSeq }`; removed after 10 minutes |
| `compile.json` | bridge | messages of the last compile, written before the domain reload |
| `console.json` | bridge | last 300 console entries with stack traces |
| `tests.json` | bridge | current / last test run, rewritten after every test |

Writes go through a temp file and a rename, retried (on Windows indexers and virus scanners hold files briefly).
Unity deletes `Temp/` when the editor closes, so nothing is left behind.

## Notes and limits

- The heartbeat pauses during a domain reload (a few seconds); the plugin treats a heartbeat older than 10 s as down.
- When the editor is in the background, Unity throttles `EditorApplication.update`; commands are then picked up
  more slowly. Preferences → General → Interaction Mode → *No Throttling* makes it immediate.
- `refresh` calls `AssetDatabase.Refresh()`: it compiles only when scripts changed, and writes `.meta` files for new
  assets.
- Screenshots: in Play mode `ScreenCapture.CaptureScreenshot` (Game view incl. UI; the Game view must be visible); in
  Edit mode the main camera is rendered into a texture (no overlay UI; HDRP/URP render through `Camera.Render`).
- Test filters are regexes on full test names (`Filter.groupNames`), several separated by `;`.
- Console entries carry a `seq` that only grows during an editor session (also across `clear-console` and domain
  reloads), so "everything after seq N" stays valid. Logs written by other `[InitializeOnLoad]` static constructors
  during a reload can run before the bridge subscribes and are then missing from `console.json` (Editor.log has them).
- `play` answers with an error while scripts do not compile (Unity would refuse Play mode silently).
- `tests.json` is rewritten after every test, so a PlayMode run keeps its results across the Play mode domain reload.
  A run still marked `running` that this editor session did not start (editor killed or crashed mid-run) is set to
  `error` when the bridge starts. Unity 6 also wipes `Temp/` on the next start. While the editor stays down the file
  keeps saying `running`; the plugin should read that together with a stale heartbeat as an aborted run.
- EditMode tests run against the last successfully compiled assemblies even while the current scripts have errors.
- Asset import worker processes (Unity 6 runs them by default) also load this package; the bridge stays off in them.

## Verified

On Unity 6000.6.7f1, macOS, built-in render pipeline, editor in `-batchmode` (no `-nographics`), driven through the
file protocol: compiles without warnings; heartbeat every 1 s; `refresh` → `compile.json` with the CS error, and clean
again after the fix; console capture across domain reloads; `clear-console` (native console emptied too); EditMode run
with a filter (pass + fail); PlayMode run including the domain reload; `play`/`pause`/`stop`; screenshots in Edit mode
(`Camera.Render`) and Play mode (`ScreenCapture`, works in batchmode too); `open-scene`; `select` (and its error for a missing asset); stale
`running` test state.
Mono 6.13 on macOS: `File.Replace` over an existing file is an atomic rename (3000 replaces under a concurrent reader:
no missing or partial reads, no leftover temp files); `File.Move` onto an existing file throws and has no `overwrite`
overload, hence Replace-or-Move.

Untested: HDRP/URP camera rendering for Edit-mode screenshots, Windows file locking (virus scanners, indexers; the
writes retry), Unity versions other than 6000.6 (the 6000.3.24f1 install on the test machine had no editor binary),
and how `select`'s ping looks in a visible Project window.
