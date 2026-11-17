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
using System.Threading;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Denny99.ClaudeBridge
{
    [InitializeOnLoad]
    public static class ClaudeBridge
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
        static readonly object consoleLock = new object();
        static List<ConsoleEntry> console = new List<ConsoleEntry>();
        static readonly List<CompileMessage> pendingMessages = new List<CompileMessage>();

        // A screenshot taken in Play mode is written at the end of a frame: wait for the file.
        static string shotId;
        static string shotPath;
        static double shotDeadline;

        static ClaudeBridge()
        {
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
            };
            WriteAtomic("status.json", JsonUtility.ToJson(s));
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
            if (shotId != null) CheckShot();
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
        }

        static void ProcessCommands()
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
                case "screenshot":
                    Screenshot(c);
                    break;
                case "open-scene":
                    if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play mode first.");
                    if (SceneManager.GetActiveScene().isDirty) throw new InvalidOperationException("The open scene has unsaved changes.");
                    UnityEditor.SceneManagement.EditorSceneManager.OpenScene(c.path);
                    Answer(new Result { id = c.id, ok = true, path = c.path });
                    break;
                case "select":
                    var obj = AssetDatabase.LoadMainAssetAtPath(c.path);
                    if (obj == null) throw new FileNotFoundException("No asset at " + c.path);
                    Selection.activeObject = obj;
                    EditorGUIUtility.PingObject(obj);
                    Answer(new Result { id = c.id, ok = true, path = c.path });
                    break;
                case "clear-console":
                    var logEntries = Type.GetType("UnityEditor.LogEntries, UnityEditor");
                    logEntries?.GetMethod("Clear")?.Invoke(null, null);
                    lock (consoleLock) console.Clear();
                    consoleDirty = true;
                    Answer(new Result { id = c.id, ok = true });
                    break;
                default:
                    throw new ArgumentException("unknown command " + c.cmd);
            }
        }

        public static void Answer(Result r) => WriteAtomic("result-" + r.id + ".json", JsonUtility.ToJson(r));

        // --- screenshot ---

        static void Screenshot(Command c)
        {
            var path = string.IsNullOrEmpty(c.path) ? Path.Combine(Dir, "shots", "shot-" + Now() + ".png") : c.path;
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            if (File.Exists(path)) File.Delete(path);
            if (EditorApplication.isPlaying)
            {
                // The Game view as the player sees it (UI included); written at the end of the frame.
                ScreenCapture.CaptureScreenshot(path);
                shotId = c.id;
                shotPath = path;
                shotDeadline = EditorApplication.timeSinceStartup + 10;
                return;
            }
            // Edit mode: render the main camera into a texture (no overlay UI).
            var cam = Camera.main;
#pragma warning disable 0618
            if (cam == null) cam = UnityEngine.Object.FindObjectOfType<Camera>();
#pragma warning restore 0618
            if (cam == null) throw new InvalidOperationException("No camera in the open scene.");
            int w = c.width > 0 ? c.width : 1280, h = c.height > 0 ? c.height : 720;
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
            }
            finally
            {
                cam.targetTexture = prevTarget;
                RenderTexture.active = prevActive;
                UnityEngine.Object.DestroyImmediate(rt);
                UnityEngine.Object.DestroyImmediate(tex);
            }
            Answer(new Result { id = c.id, ok = true, path = path.Replace('\\', '/') });
        }

        static void CheckShot()
        {
            if (File.Exists(shotPath) && new FileInfo(shotPath).Length > 0)
            {
                Answer(new Result { id = shotId, ok = true, path = shotPath.Replace('\\', '/') });
                shotId = null;
            }
            else if (EditorApplication.timeSinceStartup > shotDeadline)
            {
                Answer(new Result { id = shotId, ok = false, error = "The Game view wrote no screenshot (is it visible?)." });
                shotId = null;
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
                        message = m.message,
                        file = (m.file ?? "").Replace('\\', '/'),
                        line = m.line,
                        column = m.column,
                    });
        }

        static void OnCompilationFinished()
        {
            var seq = SessionState.GetInt(SeqKey, 0) + 1;
            SessionState.SetInt(SeqKey, seq);
            var f = new CompileFile { seq = seq, finishedAt = Now() };
            lock (pendingMessages) f.messages.AddRange(pendingMessages);
            WriteAtomic("compile.json", JsonUtility.ToJson(f));
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

        static void OnLog(string message, string stack, LogType type)
        {
            lock (consoleLock)
            {
                var seq = 0;
                if (console.Count > 0) seq = console[console.Count - 1].seq;
                console.Add(new ConsoleEntry { seq = seq + 1, type = type.ToString(), message = message, stack = stack, time = Now() });
                if (console.Count > MaxConsole) console.RemoveRange(0, console.Count - MaxConsole);
                consoleDirty = true;
            }
        }

        static void FlushConsole()
        {
            string json;
            lock (consoleLock)
            {
                json = JsonUtility.ToJson(new ConsoleFile { entries = new List<ConsoleEntry>(console) });
                consoleDirty = false;
            }
            WriteAtomic("console.json", json);
        }

        static void RestoreConsole()
        {
            try
            {
                var file = Path.Combine(Dir, "console.json");
                if (!File.Exists(file)) return;
                var restored = JsonUtility.FromJson<ConsoleFile>(File.ReadAllText(file));
                if (restored?.entries != null) lock (consoleLock) console = restored.entries;
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

        static void Cleanup()
        {
            try
            {
                var cutoff = DateTime.UtcNow.AddMinutes(-10);
                foreach (var f in Directory.GetFiles(Dir, "result-*.json"))
                    if (File.GetLastWriteTimeUtc(f) < cutoff) TryDelete(f);
                foreach (var f in Directory.GetFiles(Dir, "*.tmp"))
                    if (File.GetLastWriteTimeUtc(f) < cutoff) TryDelete(f);
            }
            catch
            {
                // best effort
            }
        }
    }
}
