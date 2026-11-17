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
- Untested in CI: this package was written without a Unity compiler at hand. If it fails to compile on your Unity
  version, the console shows the error; please report it.
