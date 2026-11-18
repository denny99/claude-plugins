// Claude Code editor bridge — a FILE QUEUE between the open Unity editor and the `unity` Claude Code plugin.
//
// Why files and not a socket: a socket dies with every domain reload (each script compile, entering Play mode); files
// survive it. Everything lives in <project>/Temp/ClaudeBridge/ (Unity wipes Temp/ when the editor closes):
//
//   status.json        heartbeat, rewritten every second (updatedAt = Unix ms)
//   cmd-<id>.json      written by the plugin; picked up on EditorApplication.update and deleted
//   result-<id>.json   our answer (tmp + rename, retried: Windows virus scanners / indexers hold files briefly)
//   compile.json       the last compile's messages, written in compilationFinished, i.e. BEFORE the domain reload
//   console.json       the last 300 console entries (restored after a domain reload)
//   tests.json         the current / last test run (see BridgeTests.cs)
//
// Editor-only, no network, no threads of its own. Everything runs on the main thread from EditorApplication.update;
// only the log callback runs on other threads and takes a lock.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;
using UnityEngine.SceneManagement;

[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("Denny99.ClaudeBridge.Editor.Tests")]

namespace Denny99.ClaudeBridge
{
    [InitializeOnLoad]
    public static partial class ClaudeBridge
    {
        public static readonly string ProjectRoot = Path.GetDirectoryName(Application.dataPath);
        public static readonly string Dir = Path.Combine(ProjectRoot, "Temp", "ClaudeBridge");

        const int MaxConsole = 300;
        const string SeqKey = "ClaudeBridge.compileSeq";
        const string ConsoleSeqKey = "ClaudeBridge.consoleSeq";

        static double nextStatus;
        static double nextFlush;
        static double nextCleanup;
        static bool consoleDirty;
        static int lastSeq; // monotonic for the editor session, also across clear-console and domain reloads
        static readonly object consoleLock = new object();
        static List<ConsoleEntry> console = new List<ConsoleEntry>();
        static readonly List<CompileMessage> pendingMessages = new List<CompileMessage>();

        // A screenshot taken in Play mode is written at the end of a frame: wait for the file.
        static string shotPath;
        static double shotDeadline;
        static Action<string> shotDone;
        static Action<string> shotFailed;

        static ClaudeBridge()
        {
            // Asset import worker processes (Unity 2020.2+, always on in Unity 6) load editor assemblies and run
            // [InitializeOnLoad] too, in the same project folder. Without this guard every worker writes its own
            // heartbeat, flushes its empty console over ours on each of its reloads and could steal commands.
            if (AssetDatabase.IsAssetImportWorkerProcess()) return;
            try
            {
                Directory.CreateDirectory(Dir);
                RestoreConsole();
                Application.logMessageReceivedThreaded += OnLog;
                CompilationPipeline.compilationStarted += _ => { lock (pendingMessages) pendingMessages.Clear(); };
                CompilationPipeline.assemblyCompilationFinished += OnAssemblyCompiled;
                CompilationPipeline.compilationFinished += _ => OnCompilationFinished();
                AssemblyReloadEvents.beforeAssemblyReload += () => { FlushConsole(); WriteStatus(); };
                EditorApplication.update += Tick;
                BridgeTests.Init();
                DiscoverProviders();
                InitPlay();
                WriteStatus();
            }
            catch (Exception e)
            {
                Debug.LogWarning("[ClaudeBridge] could not start: " + e.Message);
            }
        }

        // --- heartbeat ---

        [Serializable]
        class Status
        {
            public long updatedAt;
            public int pid;
            public string unityVersion;
            public string projectPath;
            public bool isCompiling;
            public bool isPlaying;
            public bool isPaused;
            public int compileSeq;
            public string scene;
            /// <summary>The active scene's name (also set in Play mode and for an unsaved scene: "Untitled" is "").</summary>
            public string sceneName;
            /// <summary>The first enabled scene in the Build Settings (what "open the start scene" opens); "" without one.</summary>
            public string startScene;
            public bool batchmode;
            public string bridgeVersion;
        }

        static string bridgeVersion;

        /// <summary>
        /// The version of this code, for when the Package Manager cannot name one (copied into Assets, embedded without
        /// package info). Bump together with package.json and BRIDGE_VERSION in the plugin's lib/bridge.ts: the panel
        /// takes a running bridge without a version for one older than the plugin needs.
        /// </summary>
        public const string Version = "0.3.0";

        /// <summary>This package's version from its package.json (via the Package Manager), else <see cref="Version"/>.</summary>
        static string BridgeVersion()
        {
            if (bridgeVersion != null) return bridgeVersion;
            try
            {
                var info = UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(ClaudeBridge).Assembly);
                bridgeVersion = info != null && !string.IsNullOrEmpty(info.version) ? info.version : Version;
            }
            catch
            {
                bridgeVersion = Version;
            }
            return bridgeVersion;
        }

        public static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        static void WriteStatus()
        {
            var s = new Status
            {
                updatedAt = Now(),
                pid = System.Diagnostics.Process.GetCurrentProcess().Id,
                unityVersion = Application.unityVersion,
                projectPath = ProjectRoot.Replace('\\', '/'),
                isCompiling = EditorApplication.isCompiling || EditorApplication.isUpdating,
                isPlaying = EditorApplication.isPlayingOrWillChangePlaymode,
                isPaused = EditorApplication.isPaused,
                compileSeq = SessionState.GetInt(SeqKey, 0),
                scene = SceneManager.GetActiveScene().path,
                sceneName = SceneManager.GetActiveScene().name ?? "",
                startScene = StartScene(),
                batchmode = Application.isBatchMode,
                bridgeVersion = BridgeVersion(),
            };
            WriteAtomic("status.json", JsonUtility.ToJson(s));
        }

        /// <summary>The first enabled Build Settings scene, "" when none is listed.</summary>
        static string StartScene()
        {
            try
            {
                foreach (var sc in EditorBuildSettings.scenes)
                    if (sc != null && sc.enabled && !string.IsNullOrEmpty(sc.path)) return sc.path;
            }
            catch
            {
                // best effort
            }
            return "";
        }

        static void Tick()
        {
            var t = EditorApplication.timeSinceStartup;
            if (t >= nextStatus)
            {
                nextStatus = t + 1.0;
                WriteStatus();
            }
            if (consoleDirty && t >= nextFlush)
            {
                nextFlush = t + 1.0;
                FlushConsole();
            }
            if (t >= nextCleanup)
            {
                nextCleanup = t + 30.0;
                Cleanup();
            }
            if (shotPath != null) CheckShot();
            TickPlay();
            ProcessCommands();
        }

        // --- commands ---

        [Serializable]
        class Command
        {
            public string id;
            public string cmd;
            public string mode;
            public string filter;
            public string path;
            public int width;
            public int height;
            // capture / goto / perf_record / sound_* / mix_* (see ClaudeBridge.Play.cs)
            public string spot;
            public float seconds;
            public string sound;
            public string group;
            public float db;
        }

        [Serializable]
        public class Result
        {
            public string id;
            public bool ok;
            public string error;
            public string runId;
            public string path;
            public int compileSeq;
            /// <summary>Screenshot: when the picture was written (Unix ms), so the plugin can refuse an old one.</summary>
            public long takenAt;
            /// <summary>Machine-readable error kind (e.g. "no-provider", "not-playing"); empty when none.</summary>
            public string code;
        }

        internal static void ProcessCommands()
        {
            string[] files;
            try { files = Directory.GetFiles(Dir, "cmd-*.json"); }
            catch { return; }
            foreach (var file in files)
            {
                Command c;
                try
                {
                    c = JsonUtility.FromJson<Command>(File.ReadAllText(file));
                }
                catch
                {
                    // Possibly half written: retry for 2 s, then drop it.
                    if ((DateTime.UtcNow - File.GetLastWriteTimeUtc(file)).TotalSeconds > 2) TryDelete(file);
                    continue;
                }
                TryDelete(file);
                if (c == null || string.IsNullOrEmpty(c.id)) continue;
                try
                {
                    Handle(c);
                }
                catch (BridgeError e)
                {
                    Answer(new Result { id = c.id, ok = false, error = e.Message, code = e.Code });
                }
                catch (Exception e)
                {
                    Answer(new Result { id = c.id, ok = false, error = e.GetType().Name + ": " + e.Message });
                }
            }
        }

        static void Handle(Command c)
        {
            switch (c.cmd)
            {
                case "refresh":
                    // Answer first: a successful compile reloads the domain. Refresh compiles only when scripts changed.
                    Answer(new Result { id = c.id, ok = true, compileSeq = SessionState.GetInt(SeqKey, 0) });
                    AssetDatabase.Refresh(ImportAssetOptions.Default);
                    break;
                case "play":
                    // Unity refuses Play mode silently (a console line only) while scripts do not compile.
                    if (EditorUtility.scriptCompilationFailed) throw new InvalidOperationException("Die Skripte haben Compile-Fehler. Erst beheben, dann Play starten.");
                    Answer(new Result { id = c.id, ok = true });
                    EditorApplication.isPlaying = true;
                    break;
                case "stop":
                    Answer(new Result { id = c.id, ok = true });
                    EditorApplication.isPlaying = false;
                    break;
                case "pause":
                    EditorApplication.isPaused = !EditorApplication.isPaused;
                    Answer(new Result { id = c.id, ok = true });
                    break;
                case "run-tests":
                    Answer(new Result { id = c.id, ok = true, runId = BridgeTests.Run(c.mode, c.filter) });
                    break;
                case "cancel-tests":
                    Answer(new Result { id = c.id, ok = true, runId = BridgeTests.Cancel() });
                    break;
                case "screenshot":
                    Screenshot(c);
                    break;
                case "open-scene":
                    if (EditorApplication.isPlaying) throw new InvalidOperationException("Erst den Play-Modus stoppen.");
                    if (SceneManager.GetActiveScene().isDirty) throw new InvalidOperationException("Die offene Szene hat ungespeicherte Änderungen. Erst speichern.");
                    UnityEditor.SceneManagement.EditorSceneManager.OpenScene(c.path);
                    Answer(new Result { id = c.id, ok = true, path = c.path });
                    break;
                case "select":
                    var obj = AssetDatabase.LoadMainAssetAtPath(c.path);
                    if (obj == null) throw new FileNotFoundException("Kein Asset unter " + c.path);
                    Selection.activeObject = obj;
                    EditorGUIUtility.PingObject(obj);
                    Answer(new Result { id = c.id, ok = true, path = c.path });
                    break;
                case "clear-console":
                    // Internal API (verified on 6000.6): looked up next to EditorApplication rather than by assembly name,
                    // which has moved between Unity versions; a missing method is reported instead of ignored.
                    var logEntries = typeof(EditorApplication).Assembly.GetType("UnityEditor.LogEntries");
                    var clear = logEntries?.GetMethod("Clear", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
                    if (clear == null) throw new MissingMethodException("UnityEditor.LogEntries.Clear not found in this Unity version.");
                    clear.Invoke(null, null);
                    lock (consoleLock) console.Clear();
                    consoleDirty = true;
                    Answer(new Result { id = c.id, ok = true });
                    break;
                default:
                    if (HandlePlay(c)) break;
                    throw new ArgumentException("unknown command " + c.cmd);
            }
        }

        public static void Answer(Result r) => WriteAtomic("result-" + r.id + ".json", JsonUtility.ToJson(r));

        // --- screenshot ---

        static void Screenshot(Command c)
        {
            TakeShot(c.path, c.width, c.height,
                p => Answer(new Result { id = c.id, ok = true, path = p, takenAt = lastShotAt }),
                err => Answer(new Result { id = c.id, ok = false, error = err }));
        }

        /// <summary>Unix ms at which the last picture was written (sent back as takenAt).</summary>
        internal static long lastShotAt;

        /// <summary>
        /// Play mode without the Game view: renders every enabled camera that draws to the screen, lowest depth first,
        /// into one texture of the Game view's size (scaled down to fit width x height), and writes it as PNG.
        /// Works while Unity is in the background: Camera.Render is synchronous and needs no window, no focus and no
        /// player-loop frame (ScreenCapture needs all three and, unfocused, writes nothing or the last drawn frame).
        /// Screen Space - Overlay canvases are drawn by no camera: for the shot they are hung on the top camera.
        /// Returns false when there is no camera to render (the caller falls back to the Game view).
        /// IM EDITOR NACHZUTESTEN (URP/HDRP, Overlay-UI, Editor im Hintergrund).
        /// </summary>
        internal static bool RenderCameras(string path, int width, int height)
        {
            var cams = Camera.allCameras.Where(x => x != null && x.enabled && x.targetTexture == null).OrderBy(x => x.depth).ToList();
            if (cams.Count == 0) return false;
            var size = Handles.GetMainGameViewSize();
            int gw = size.x >= 16 ? Mathf.RoundToInt(size.x) : 1920, gh = size.y >= 16 ? Mathf.RoundToInt(size.y) : 1080;
            float scale = width > 0 && height > 0 ? Mathf.Min(1f, Mathf.Min(width / (float)gw, height / (float)gh)) : 1f;
            int w = Mathf.Max(1, Mathf.RoundToInt(gw * scale)), h = Mathf.Max(1, Mathf.RoundToInt(gh * scale));
            var rt = RenderTexture.GetTemporary(w, h, 24, RenderTextureFormat.ARGB32);
            var prevActive = RenderTexture.active;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            var top = cams[cams.Count - 1];
            var overlays = new List<Canvas>();
            try
            {
                try
                {
#pragma warning disable 0618
                    foreach (var cv in UnityEngine.Object.FindObjectsOfType<Canvas>())
#pragma warning restore 0618
                        if (cv.isRootCanvas && cv.enabled && cv.renderMode == RenderMode.ScreenSpaceOverlay) overlays.Add(cv);
                    foreach (var cv in overlays)
                    {
                        cv.renderMode = RenderMode.ScreenSpaceCamera;
                        cv.worldCamera = top;
                        cv.planeDistance = top.nearClipPlane + 0.05f;
                    }
                    if (overlays.Count > 0) Canvas.ForceUpdateCanvases();
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[ClaudeBridge] Overlay-UI nicht im Bild: " + e.Message);
                }
                RenderTexture.active = rt;
                GL.Clear(true, true, Color.black);
                foreach (var cam in cams)
                {
                    var prev = cam.targetTexture;
                    try
                    {
                        cam.targetTexture = rt;
                        cam.Render();
                    }
                    finally
                    {
                        cam.targetTexture = prev;
                    }
                }
                RenderTexture.active = rt;
                tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
                tex.Apply();
                File.WriteAllBytes(path, tex.EncodeToPNG());
                lastShotAt = Now();
                return true;
            }
            finally
            {
                foreach (var cv in overlays)
                {
                    if (cv == null) continue;
                    cv.renderMode = RenderMode.ScreenSpaceOverlay;
                    cv.worldCamera = null;
                }
                RenderTexture.active = prevActive;
                RenderTexture.ReleaseTemporary(rt);
                UnityEngine.Object.DestroyImmediate(tex);
            }
        }

        /// <summary>The camera a shot renders in Edit mode (and whose pose capture reports): Camera.main, else any.</summary>
        internal static Camera ShotCamera()
        {
            var cam = Camera.main;
#pragma warning disable 0618
            if (cam == null) cam = UnityEngine.Object.FindObjectOfType<Camera>();
#pragma warning restore 0618
            return cam;
        }

        /// <summary>
        /// Writes a Game view PNG. Edit mode: synchronously (done is called before returning). Play mode: at the end of
        /// the frame; done / failed are called from Tick. Throws for what fails up front.
        /// </summary>
        internal static void TakeShot(string requested, int width, int height, Action<string> done, Action<string> failed)
        {
            var path = string.IsNullOrEmpty(requested) ? Path.Combine(Dir, "shots", "shot-" + Now() + ".png") : requested;
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            if (File.Exists(path)) File.Delete(path);
            if (EditorApplication.isPlaying && Application.isBatchMode)
                throw new BridgeError("batchmode", "Bilder im Play-Modus brauchen ein sichtbares Editor-Fenster (kein Hintergrund-Lauf).");
            if (shotPath != null) throw new BridgeError("busy", "Unity schreibt noch ein anderes Bild. Kurz warten und nochmal versuchen.");
            if (EditorApplication.isPlaying)
            {
                // First choice: the cameras directly, synchronous and without focus (a click in Claude sends Unity to
                // the background, the Game view then draws no frame).
                try
                {
                    if (RenderCameras(path, width, height))
                    {
                        done(path.Replace('\\', '/'));
                        return;
                    }
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[ClaudeBridge] Kamera-Bild fehlgeschlagen, nehme den Game-Tab: " + e.Message);
                    if (File.Exists(path)) File.Delete(path);
                }
                // Fallback: the Game view as the player sees it; written at the end of a frame. Ask for that frame
                // even when the editor is in the background.
                ScreenCapture.CaptureScreenshot(path);
                EditorApplication.QueuePlayerLoopUpdate();
                UnityEditorInternal.InternalEditorUtility.RepaintAllViews();
                shotPath = path;
                shotDone = done;
                shotFailed = failed;
                shotWidth = width;
                shotHeight = height;
                // Below the plugin's 10 s command timeout, so it gets this error instead of a timeout.
                shotDeadline = EditorApplication.timeSinceStartup + 7;
                return;
            }
            // Edit mode: render the main camera into a texture (no overlay UI).
            var cam = ShotCamera();
            if (cam == null) throw new BridgeError("no-camera", "In der offenen Szene ist keine Kamera. Eine Kamera anlegen oder eine Szene mit Kamera öffnen.");
            int w = width > 0 ? width : 1280, h = height > 0 ? height : 720;
            var rt = new RenderTexture(w, h, 24);
            var prevTarget = cam.targetTexture;
            var prevActive = RenderTexture.active;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            try
            {
                cam.targetTexture = rt;
                cam.Render();
                RenderTexture.active = rt;
                tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
                tex.Apply();
                File.WriteAllBytes(path, tex.EncodeToPNG());
                lastShotAt = Now();
            }
            finally
            {
                cam.targetTexture = prevTarget;
                RenderTexture.active = prevActive;
                UnityEngine.Object.DestroyImmediate(rt);
                UnityEngine.Object.DestroyImmediate(tex);
            }
            done(path.Replace('\\', '/'));
        }

        static int shotWidth, shotHeight;

        /// <summary>
        /// Shrinks a Play-mode capture (ScreenCapture writes the Game view's size) to fit width x height, aspect kept.
        /// Best effort: a file that cannot be read or scaled stays as written. Untested in the editor.
        /// </summary>
        static void ScaleShot(string path, int width, int height)
        {
            Texture2D src = null, dst = null;
            RenderTexture rt = null;
            var prevActive = RenderTexture.active;
            try
            {
                src = new Texture2D(2, 2);
                if (!src.LoadImage(File.ReadAllBytes(path))) return;
                var scale = Mathf.Min(width / (float)src.width, height / (float)src.height);
                if (scale >= 1f) return;
                int w = Mathf.Max(1, Mathf.RoundToInt(src.width * scale)), h = Mathf.Max(1, Mathf.RoundToInt(src.height * scale));
                rt = RenderTexture.GetTemporary(w, h, 0);
                Graphics.Blit(src, rt);
                RenderTexture.active = rt;
                dst = new Texture2D(w, h, TextureFormat.RGB24, false);
                dst.ReadPixels(new Rect(0, 0, w, h), 0, 0);
                dst.Apply();
                File.WriteAllBytes(path, dst.EncodeToPNG());
            }
            catch (Exception e)
            {
                Debug.LogWarning("[ClaudeBridge] could not scale screenshot: " + e.Message);
            }
            finally
            {
                RenderTexture.active = prevActive;
                if (rt != null) RenderTexture.ReleaseTemporary(rt);
                if (src != null) UnityEngine.Object.DestroyImmediate(src);
                if (dst != null) UnityEngine.Object.DestroyImmediate(dst);
            }
        }

        static void CheckShot()
        {
            var path = shotPath;
            Action<string> done = shotDone, failed = shotFailed;
            if (File.Exists(path) && new FileInfo(path).Length > 0)
            {
                shotPath = null;
                if (shotWidth > 0 && shotHeight > 0) ScaleShot(path, shotWidth, shotHeight);
                lastShotAt = Now();
                done(path.Replace('\\', '/'));
            }
            else if (EditorApplication.timeSinceStartup > shotDeadline)
            {
                shotPath = null;
                failed("Unity hat kein Bild geschrieben. Unity-Fenster nach vorn holen und den Game-Tab sichtbar lassen, dann nochmal versuchen.");
            }
        }

        // --- compile ---

        [Serializable]
        class CompileMessage
        {
            public string severity;
            public string message;
            public string file;
            public int line;
            public int column;
            public string code;
        }

        [Serializable]
        class CompileFile
        {
            public int seq;
            public long finishedAt;
            public List<CompileMessage> messages = new List<CompileMessage>();
        }

        static void OnAssemblyCompiled(string assembly, CompilerMessage[] messages)
        {
            lock (pendingMessages)
                foreach (var m in messages)
                    pendingMessages.Add(new CompileMessage
                    {
                        severity = m.type == CompilerMessageType.Error ? "error" : "warning",
                        message = BareMessage(m.message, out var code),
                        code = code,
                        file = (m.file ?? "").Replace('\\', '/'),
                        line = m.line,
                        column = m.column,
                    });
        }

        // CompilerMessage.message repeats "Assets/A.cs(12,5): error CS1002: " before the text; file/line/column/code
        // are fields of their own, so only the bare text goes to compile.json.
        static readonly System.Text.RegularExpressions.Regex MessagePrefix = new System.Text.RegularExpressions.Regex(
            @"^\s*(?:[^\r\n]*?\(\d+,\d+\)\s*:\s*)?(?:error|warning)\s+([A-Z]+\d+)\s*:\s*",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        static string BareMessage(string message, out string code)
        {
            code = null;
            if (string.IsNullOrEmpty(message)) return message ?? "";
            var m = MessagePrefix.Match(message);
            if (!m.Success) return message;
            code = m.Groups[1].Value;
            return message.Substring(m.Length);
        }

        static void OnCompilationFinished()
        {
            var seq = SessionState.GetInt(SeqKey, 0) + 1;
            SessionState.SetInt(SeqKey, seq);
            var f = new CompileFile { seq = seq, finishedAt = Now() };
            lock (pendingMessages) f.messages.AddRange(pendingMessages);
            WriteAtomic("compile.json", JsonUtility.ToJson(f));
            // Unity drops fixed compile errors from its own console after a clean compile; the bridge's copy follows.
            if (!f.messages.Exists(m => m.severity == "error")) DropCompileErrors();
            WriteStatus();
        }

        // --- console ---

        [Serializable]
        class ConsoleEntry
        {
            public int seq;
            public string type;
            public string message;
            public string stack;
            public long time;
        }

        [Serializable]
        class ConsoleFile
        {
            public List<ConsoleEntry> entries = new List<ConsoleEntry>();
        }

        // "Assets/A.cs(5,6): error CS1001: ..." as Unity logs a compile error.
        static readonly System.Text.RegularExpressions.Regex CompileErrorLine = new System.Text.RegularExpressions.Regex(
            @"\(\d+,\d+\)\s*:\s*error\s+[A-Z]+\d+\s*:");

        static void DropCompileErrors()
        {
            lock (consoleLock)
            {
                var removed = console.RemoveAll(e => e != null && e.type == "Error" && e.message != null && CompileErrorLine.IsMatch(e.message));
                if (removed > 0) consoleDirty = true;
            }
        }

        static void OnLog(string message, string stack, LogType type)
        {
            lock (consoleLock)
            {
                console.Add(new ConsoleEntry { seq = ++lastSeq, type = type.ToString(), message = message, stack = stack, time = Now() });
                if (console.Count > MaxConsole) console.RemoveRange(0, console.Count - MaxConsole);
                consoleDirty = true;
            }
        }

        static void FlushConsole()
        {
            string json;
            int seq;
            lock (consoleLock)
            {
                json = JsonUtility.ToJson(new ConsoleFile { entries = new List<ConsoleEntry>(console) });
                consoleDirty = false;
                seq = lastSeq;
            }
            SessionState.SetInt(ConsoleSeqKey, seq);
            WriteAtomic("console.json", json);
        }

        static void RestoreConsole()
        {
            lastSeq = SessionState.GetInt(ConsoleSeqKey, 0);
            try
            {
                var file = Path.Combine(Dir, "console.json");
                if (!File.Exists(file)) return;
                var restored = JsonUtility.FromJson<ConsoleFile>(File.ReadAllText(file));
                if (restored?.entries != null)
                    lock (consoleLock)
                    {
                        console = restored.entries;
                        foreach (var e in console) lastSeq = Math.Max(lastSeq, e.seq);
                    }
            }
            catch
            {
                // a broken file just starts a fresh console
            }
        }

        // --- files ---

        /// <summary>Writes Dir/name via a temp file and a rename, retried (another process may hold the target).</summary>
        public static void WriteAtomic(string name, string text)
        {
            var target = Path.Combine(Dir, name);
            var tmp = target + "." + Guid.NewGuid().ToString("N").Substring(0, 8) + ".tmp";
            for (var attempt = 0; attempt < 6; attempt++)
            {
                try
                {
                    Directory.CreateDirectory(Dir);
                    File.WriteAllText(tmp, text);
                    if (File.Exists(target)) File.Replace(tmp, target, null);
                    else File.Move(tmp, target);
                    return;
                }
                catch (IOException)
                {
                    Thread.Sleep(15 * (attempt + 1));
                }
                catch (UnauthorizedAccessException)
                {
                    Thread.Sleep(15 * (attempt + 1));
                }
            }
            TryDelete(tmp);
        }

        static void TryDelete(string file)
        {
            try { if (File.Exists(file)) File.Delete(file); }
            catch { /* next cleanup */ }
        }

        const int MaxShots = 10;

        static void Cleanup()
        {
            try
            {
                var cutoff = DateTime.UtcNow.AddMinutes(-10);
                foreach (var f in Directory.GetFiles(Dir, "result-*.json"))
                    if (File.GetLastWriteTimeUtc(f) < cutoff) TryDelete(f);
                foreach (var f in Directory.GetFiles(Dir, "*.tmp"))
                    if (File.GetLastWriteTimeUtc(f) < cutoff) TryDelete(f);
                // Overview screenshots: only the newest few stay (each is 1-2 MB).
                var shots = Path.Combine(Dir, "shots");
                if (Directory.Exists(shots))
                    foreach (var f in Directory.GetFiles(shots, "shot-*.png").OrderByDescending(x => File.GetLastWriteTimeUtc(x)).Skip(MaxShots))
                        TryDelete(f);
            }
            catch
            {
                // best effort
            }
        }
    }
}
