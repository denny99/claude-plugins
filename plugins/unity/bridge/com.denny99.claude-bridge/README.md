# Claude Code Bridge (`com.denny99.claude-bridge`)

Editor-only Unity package for the Claude Code `unity` plugin (denny99 marketplace). It lets Claude see what the open
editor sees: compile errors right after an edit, the console, test results, Play mode state and Game view screenshots.

## Install

Package Manager → **+** → **Add package from git URL…**

```
https://github.com/denny99/claude-plugins.git?path=/plugins/unity/bridge/com.denny99.claude-bridge
```

Pinned to this version (what the panel's „Paket-Adresse kopieren“ gives):
`https://github.com/denny99/claude-plugins.git?path=/plugins/unity/bridge/com.denny99.claude-bridge#unity-bridge-v0.3.0`.

**Version 0.3.0.** The heartbeat names it (`bridgeVersion`, from `package.json`, else `ClaudeBridge.Version`). A bump
changes three places together: `package.json`, `ClaudeBridge.Version` and `BRIDGE_VERSION` in the plugin's
`lib/bridge.ts`, then the tag `unity-bridge-v<version>` on the release commit. The panel warns when the bridge is
older than the plugin needs, and also when a running bridge names no version (bridges before 0.2).

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
| `cmd-<id>.json` | plugin | one command: `refresh`, `play`, `stop`, `pause`, `run-tests` (`mode`, `filter`), `cancel-tests` (Test Framework 1.4+, else needs the run id), `screenshot` (`path`, `width`, `height`), `open-scene` (`path`), `select` (`path`), `clear-console`; provider commands below |
| `result-<id>.json` | bridge | `{ id, ok, error, code, runId, path, compileSeq }` (provider commands: their own fields, below); removed after 10 minutes |
| `compile.json` | bridge | messages of the last compile, written before the domain reload |
| `console.json` | bridge | last 300 console entries with stack traces |
| `tests.json` | bridge | current / last test run, rewritten after every test |

Writes go through a temp file and a rename, retried (on Windows indexers and virus scanners hold files briefly).
Unity deletes `Temp/` when the editor closes, so nothing is left behind.

## Project providers (0.2+)

The bridge is generic. What only the game knows comes from interfaces in the runtime assembly `Denny99.ClaudeBridge`
(`Runtime/ClaudeProviders.cs`, auto-referenced, so `Assembly-CSharp` and any asmdef that references it can implement
them):

```csharp
public interface IClaudeSpotProvider {
    string Capture();               // current spot as a JSON object ("{...}"), or null
    void GoTo(string spotJson);     // jump to a spot Capture() made; throw on failure
}
public interface IClaudePerfSource {
    void Sample(IDictionary<string, float> costsMs);  // once per recorded frame: costsMs["AI"] = 1.2f
}
public enum ClaudeSoundMode { Near, Flat }
public interface IClaudeSoundBoard {
    IList<ClaudeSound> List();                    // ClaudeSound { id, name, group, duration (s), takes }
    void Play(string id, ClaudeSoundMode mode);
    void Stop();
    IList<ClaudeMixGroup> GetMix();               // ClaudeMixGroup { group, db }
    void SetMix(string group, float db);          // apply AND persist
}
```

### Registering a provider

Both ways survive domain reloads (script compiles, entering Play mode):

1. **`[ClaudeBridgeProvider]` on a plain class** with a public parameterless constructor (not a `UnityEngine.Object`).
   The bridge finds it with `TypeCache` after every domain reload and creates one instance. Nothing else to do; the
   recommended way for editor-side or static game access.
2. **`ClaudeBridge.Register(obj)`** (editor code) or **`ClaudeProviders.Register(obj)`** (runtime code), e.g. from a
   MonoBehaviour's `OnEnable` (and `ClaudeProviders.Unregister(this)` in `OnDisable`). Registrations are statics and a
   domain reload clears them, so register from code that runs again after a reload (`OnEnable`, `[InitializeOnLoad]`,
   `[RuntimeInitializeOnLoadMethod]`).

Explicit registrations win over discovered ones; the newest wins. Destroyed Unity objects are skipped. All registered
`IClaudePerfSource`s are sampled; of the other two, the winner is used. Providers run on the main thread.

### Commands

Errors carry a `code`: `no-provider`, `not-playing`, `busy`, `batchmode`, `aborted`, `no-frames`, `bad-input`
(other exceptions: `error` = `Type: message`, no code).

| `cmd` | Fields | Answer (`{ id, ok: true, … }`) |
| --- | --- | --- |
| `capture` | `path?`, `width?`, `height?` | `path` (PNG, as `screenshot`), `playing`, `scene`, `provider` (bool), `camera` `{ name, position:[x,y,z], rotation:[x,y,z] (euler), fov }` or null, `spot` (provider JSON or null) |
| `goto` | `spot` (JSON **text** of a spot) | `spot` (the spot after the jump); `no-provider` without spot provider |
| `perf_record` | `seconds` (default 5, max 120) | after the recording: `perf` `{ seconds, requestedSeconds, frames, budgetMs: 16.6, avgMs, p50, p95, p99, worst, hitches, seriesStep, series: [ms…] (≤ 200 points, each the worst frame of `seriesStep` frames), costs: [{ name, avgMs, maxMs, hitchAvgMs, hitchMaxMs, hitchShare }], aborted? }`, `spot` (at the start) |
| `sound_list` | – | `sounds: [{ id, name, group, duration, takes }]` |
| `sound_play` | `sound` (id), `mode` (`near`\|`flat`, default near) | `sound`, `mode` |
| `sound_stop` | – | – |
| `mix_get` | – | `groups: [{ group, db }]` |
| `mix_set` | `group`, `db` | `groups` (after the change) |

`perf_record` needs Play mode. It adds a system to the player loop (`PostLateUpdate`) that records
`Time.unscaledDeltaTime` per frame (the first delta, from before the start, is skipped) and asks every
`IClaudePerfSource` for the frame's costs; it ends when the recorded frame time reaches `seconds`, or after
`2 × seconds + 5` s of wall clock (paused or throttled editor) with what it has, or when Play mode ends (`aborted`).
A background editor is throttled, which shows up in the frame times. A domain reload during a recording loses it (the
plugin then times out). `capture` takes the spot in the same frame as the picture; in Play mode the picture is the
Game view (needs a window, `code: batchmode` otherwise), in Edit mode the main camera.

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

0.2.0 (provider commands), same setup: EditMode tests in `Tests/Editor` (list the package under `testables` in
`Packages/manifest.json` to run them) cover discovery via `[ClaudeBridgeProvider]`, explicit registration winning and
falling back, destroyed objects skipped, `goto` / sound / mix commands through the file queue, `no-provider` /
`not-playing` codes, Edit-mode `capture` with camera and spot, and a Play-mode `perf_record` end to end (player-loop
hook, percentiles, named costs, spot) plus the batchmode refusal of a Play-mode `capture`.

Untested: Play-mode `capture` in a visible editor (same `ScreenCapture` path as `screenshot`), HDRP/URP camera rendering for Edit-mode screenshots, Windows file locking (virus scanners, indexers; the
writes retry), Unity versions other than 6000.6 (the 6000.3.24f1 install on the test machine had no editor binary),
and how `select`'s ping looks in a visible Project window.
