// Commands for the Unity panel that go through project providers (Runtime/ClaudeProviders.cs): capture + goto (spot),
// perf_record (frame times + IClaudePerfSource), sound_list / sound_play / sound_stop / mix_get / mix_set
// (IClaudeSoundBoard). Their results carry free-form JSON (the spot), so they are written with JsonOut instead of
// JsonUtility. Errors that the panel should tell apart throw BridgeError with a code.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.LowLevel;
using UnityEngine.PlayerLoop;
using UnityEngine.SceneManagement;

namespace Denny99.ClaudeBridge
{
    /// <summary>A failure the plugin can tell apart by <see cref="Code"/> (written to the result's `code`).</summary>
    public class BridgeError : Exception
    {
        public readonly string Code;

        public BridgeError(string code, string message) : base(message)
        {
            Code = code;
        }
    }

    public static partial class ClaudeBridge
    {
        /// <summary>
        /// Registers a provider instance (IClaudeSpotProvider, IClaudePerfSource, IClaudeSoundBoard). Same as
        /// ClaudeProviders.Register. A domain reload clears it: call it again from [InitializeOnLoad] / OnEnable, or put
        /// [ClaudeBridgeProvider] on the class instead.
        /// </summary>
        public static void Register(object provider) => ClaudeProviders.Register(provider);

        public static void Unregister(object provider) => ClaudeProviders.Unregister(provider);

        /// <summary>Instantiates every [ClaudeBridgeProvider] class (TypeCache; runs after every domain reload).</summary>
        public static void DiscoverProviders()
        {
            var found = new List<object>();
            foreach (var t in TypeCache.GetTypesWithAttribute<ClaudeBridgeProviderAttribute>())
            {
                if (t.IsAbstract || t.IsGenericTypeDefinition || typeof(UnityEngine.Object).IsAssignableFrom(t))
                {
                    Debug.LogWarning("[ClaudeBridge] [ClaudeBridgeProvider] needs a plain, non-abstract class: " + t.FullName);
                    continue;
                }
                try
                {
                    found.Add(Activator.CreateInstance(t));
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[ClaudeBridge] could not create provider " + t.FullName + ": " + (e.InnerException ?? e).Message);
                }
            }
            ClaudeProviders.SetDiscovered(found);
        }

        static void InitPlay()
        {
            EditorApplication.playModeStateChanged += s =>
            {
                if (s == PlayModeStateChange.ExitingPlayMode && perf != null) FinishPerf("Play mode ended during the recording.");
            };
        }

        static void TickPlay()
        {
            // Paused or throttled: frames stop arriving. Finish with what we have after the wall-clock limit.
            // OnPerfFrame only flags the end: the player loop is not rebuilt from inside one of its own systems.
            if (perf != null && (perf.done || EditorApplication.timeSinceStartup > perf.wallDeadline)) FinishPerf(null);
        }

        static bool HandlePlay(Command c)
        {
            switch (c.cmd)
            {
                case "capture":
                    Capture(c);
                    return true;
                case "goto":
                {
                    var spot = ClaudeProviders.Get<IClaudeSpotProvider>();
                    if (spot == null) throw new BridgeError("no-provider", "This project offers no jump to a spot (no IClaudeSpotProvider registered).");
                    if (string.IsNullOrEmpty(c.spot)) throw new BridgeError("bad-input", "goto needs a spot.");
                    spot.GoTo(c.spot);
                    AnswerJson(c.id, new JsonOut().Raw("spot", SpotJson(spot)));
                    return true;
                }
                case "perf_record":
                    StartPerf(c);
                    return true;
                case "sound_list":
                {
                    var arr = new StringBuilder("[");
                    var first = true;
                    foreach (var s in Board().List() ?? new List<ClaudeSound>())
                    {
                        if (s == null) continue;
                        if (!first) arr.Append(',');
                        first = false;
                        arr.Append(new JsonOut().Str("id", s.id).Str("name", string.IsNullOrEmpty(s.name) ? s.id : s.name)
                            .Str("group", s.group).Num("duration", s.duration).Num("takes", s.takes));
                    }
                    AnswerJson(c.id, new JsonOut().Raw("sounds", arr.Append(']').ToString()));
                    return true;
                }
                case "sound_play":
                {
                    if (string.IsNullOrEmpty(c.sound)) throw new BridgeError("bad-input", "sound_play needs a sound id.");
                    var mode = string.Equals(c.mode, "flat", StringComparison.OrdinalIgnoreCase) ? ClaudeSoundMode.Flat : ClaudeSoundMode.Near;
                    Board().Play(c.sound, mode);
                    AnswerJson(c.id, new JsonOut().Str("sound", c.sound).Str("mode", mode == ClaudeSoundMode.Flat ? "flat" : "near"));
                    return true;
                }
                case "sound_stop":
                    Board().Stop();
                    AnswerJson(c.id, new JsonOut());
                    return true;
                case "mix_get":
                    AnswerJson(c.id, new JsonOut().Raw("groups", MixJson(Board())));
                    return true;
                case "mix_set":
                {
                    if (string.IsNullOrEmpty(c.group)) throw new BridgeError("bad-input", "mix_set needs a group.");
                    var board = Board();
                    board.SetMix(c.group, c.db);
                    AnswerJson(c.id, new JsonOut().Raw("groups", MixJson(board)));
                    return true;
                }
            }
            return false;
        }

        /// <summary>Writes result-&lt;id&gt;.json = { id, ok: true, ...fields }.</summary>
        internal static void AnswerJson(string id, JsonOut fields)
        {
            WriteAtomic("result-" + id + ".json", new JsonOut().Str("id", id).Bool("ok", true).Merge(fields).ToString());
        }

        static IClaudeSoundBoard Board()
        {
            var b = ClaudeProviders.Get<IClaudeSoundBoard>();
            if (b == null) throw new BridgeError("no-provider", "This project offers no sound board (no IClaudeSoundBoard registered).");
            return b;
        }

        static string MixJson(IClaudeSoundBoard board)
        {
            var sb = new StringBuilder("[");
            var first = true;
            foreach (var g in board.GetMix() ?? new List<ClaudeMixGroup>())
            {
                if (g == null) continue;
                if (!first) sb.Append(',');
                first = false;
                sb.Append(new JsonOut().Str("group", g.group).Num("db", g.db));
            }
            return sb.Append(']').ToString();
        }

        /// <summary>The provider's spot as raw JSON, "null" without provider / spot. A non-object is wrapped as text.</summary>
        static string SpotJson(IClaudeSpotProvider provider)
        {
            if (provider == null) return "null";
            var raw = provider.Capture();
            if (string.IsNullOrWhiteSpace(raw)) return "null";
            raw = raw.Trim();
            if (raw.StartsWith("{") && raw.EndsWith("}")) return raw;
            return new JsonOut().Str("text", raw).ToString();
        }

        // --- capture ---

        static void Capture(Command c)
        {
            var provider = ClaudeProviders.Get<IClaudeSpotProvider>();
            // The spot is taken now, the picture (Play mode) at the end of the frame: the same frame.
            var spot = SpotJson(provider);
            var cam = ShotCamera();
            var camera = "null";
            if (cam != null)
            {
                var p = cam.transform.position;
                var r = cam.transform.eulerAngles;
                camera = new JsonOut().Str("name", cam.name).Vec("position", p).Vec("rotation", r).Num("fov", cam.fieldOfView).ToString();
            }
            var scene = SceneManager.GetActiveScene().path;
            var playing = EditorApplication.isPlaying;
            TakeShot(c.path, c.width, c.height,
                path => AnswerJson(c.id, new JsonOut().Str("path", path).Bool("playing", playing).Str("scene", scene)
                    .Bool("provider", provider != null).Raw("camera", camera).Raw("spot", spot)),
                err => Answer(new Result { id = c.id, ok = false, error = err }));
        }

        // --- perf ---

        public const float BudgetMs = 16.6f;
        const int MaxSeriesPoints = 200;

        struct ClaudePerfSampleLoop
        {
        }

        class PerfRun
        {
            public string id;
            public float seconds;
            public double wallDeadline;
            public string spot;
            public bool skippedFirst;
            public bool done;
            public float recordedMs;
            public readonly List<float> frames = new List<float>();
            public readonly List<IClaudePerfSource> sources = new List<IClaudePerfSource>();
            public readonly Dictionary<string, float> frameCosts = new Dictionary<string, float>();
            public readonly Dictionary<string, CostAcc> costs = new Dictionary<string, CostAcc>();
            public int hitches;
            public double hitchMs;
        }

        class CostAcc
        {
            public double sum;
            public double hitchSum;
            public float hitchMax;
            public float max;
        }

        static PerfRun perf;

        static void StartPerf(Command c)
        {
            if (!EditorApplication.isPlaying) throw new BridgeError("not-playing", "perf_record needs Play mode.");
            if (perf != null) throw new BridgeError("busy", "A perf recording is already running.");
            var seconds = c.seconds > 0 ? Mathf.Min(c.seconds, 120f) : 5f;
            perf = new PerfRun
            {
                id = c.id,
                seconds = seconds,
                wallDeadline = EditorApplication.timeSinceStartup + seconds * 2 + 5,
                spot = SpotJson(ClaudeProviders.Get<IClaudeSpotProvider>()),
            };
            perf.sources.AddRange(ClaudeProviders.GetAll<IClaudePerfSource>());
            SetPerfHook(true);
        }

        static void SetPerfHook(bool on)
        {
            var loop = PlayerLoop.GetCurrentPlayerLoop();
            if (loop.subSystemList == null) return;
            for (var i = 0; i < loop.subSystemList.Length; i++)
            {
                if (loop.subSystemList[i].type != typeof(PostLateUpdate)) continue;
                var sub = loop.subSystemList[i];
                var list = (sub.subSystemList ?? new PlayerLoopSystem[0]).Where(s => s.type != typeof(ClaudePerfSampleLoop)).ToList();
                if (on) list.Add(new PlayerLoopSystem { type = typeof(ClaudePerfSampleLoop), updateDelegate = OnPerfFrame });
                sub.subSystemList = list.ToArray();
                loop.subSystemList[i] = sub;
            }
            PlayerLoop.SetPlayerLoop(loop);
        }

        static void OnPerfFrame()
        {
            var run = perf;
            if (run == null || run.done) return;
            // The first delta belongs to the frame before the recording started.
            if (!run.skippedFirst)
            {
                run.skippedFirst = true;
                return;
            }
            var ms = Time.unscaledDeltaTime * 1000f;
            run.frames.Add(ms);
            run.recordedMs += ms;
            var hitch = ms > BudgetMs;
            if (hitch)
            {
                run.hitches++;
                run.hitchMs += ms;
            }
            if (run.sources.Count > 0)
            {
                run.frameCosts.Clear();
                foreach (var s in run.sources)
                {
                    try
                    {
                        s.Sample(run.frameCosts);
                    }
                    catch (Exception e)
                    {
                        run.frameCosts["error: " + s.GetType().Name] = 0;
                        Debug.LogWarning("[ClaudeBridge] perf source " + s.GetType().Name + " failed: " + e.Message);
                    }
                }
                foreach (var kv in run.frameCosts)
                {
                    if (!run.costs.TryGetValue(kv.Key, out var acc)) run.costs[kv.Key] = acc = new CostAcc();
                    acc.sum += kv.Value;
                    acc.max = Mathf.Max(acc.max, kv.Value);
                    if (hitch)
                    {
                        acc.hitchSum += kv.Value;
                        acc.hitchMax = Mathf.Max(acc.hitchMax, kv.Value);
                    }
                }
            }
            if (run.recordedMs >= run.seconds * 1000f) run.done = true;
        }

        static void FinishPerf(string abortReason)
        {
            var run = perf;
            perf = null;
            try
            {
                SetPerfHook(false);
            }
            catch
            {
                // the loop is rebuilt when Play mode ends anyway
            }
            if (run == null) return;
            if (run.frames.Count == 0)
            {
                Answer(new Result { id = run.id, ok = false, code = abortReason != null ? "aborted" : "no-frames",
                    error = abortReason ?? "No frames arrived (paused, or the editor is throttled in the background)." });
                return;
            }
            AnswerJson(run.id, new JsonOut().Raw("perf", PerfJson(run, abortReason)).Raw("spot", run.spot));
        }

        static string PerfJson(PerfRun run, string abortReason)
        {
            var sorted = run.frames.OrderBy(f => f).ToList();
            float Pct(double p) => sorted[Mathf.Clamp((int)Math.Ceiling(p * sorted.Count) - 1, 0, sorted.Count - 1)];
            var n = run.frames.Count;
            var step = Mathf.Max(1, Mathf.CeilToInt(n / (float)MaxSeriesPoints));
            var series = new StringBuilder("[");
            for (var i = 0; i < n; i += step)
            {
                var max = 0f;
                for (var j = i; j < Math.Min(n, i + step); j++) max = Mathf.Max(max, run.frames[j]);
                if (i > 0) series.Append(',');
                series.Append(JsonOut.Number(max));
            }
            series.Append(']');
            var costs = new StringBuilder("[");
            var first = true;
            foreach (var kv in run.costs.OrderByDescending(k => run.hitches > 0 ? k.Value.hitchSum : k.Value.sum))
            {
                if (!first) costs.Append(',');
                first = false;
                var a = kv.Value;
                costs.Append(new JsonOut().Str("name", kv.Key).Num("avgMs", a.sum / n).Num("maxMs", a.max)
                    .Num("hitchAvgMs", run.hitches > 0 ? a.hitchSum / run.hitches : 0).Num("hitchMaxMs", a.hitchMax)
                    .Num("hitchShare", run.hitchMs > 0 ? a.hitchSum / run.hitchMs : 0));
            }
            costs.Append(']');
            var o = new JsonOut().Num("seconds", run.recordedMs / 1000f).Num("requestedSeconds", run.seconds).Num("frames", n)
                .Num("budgetMs", BudgetMs).Num("avgMs", run.recordedMs / n).Num("p50", Pct(0.5)).Num("p95", Pct(0.95))
                .Num("p99", Pct(0.99)).Num("worst", sorted[n - 1]).Num("hitches", run.hitches)
                .Num("seriesStep", step).Raw("series", series.ToString()).Raw("costs", costs.ToString());
            if (abortReason != null) o.Str("aborted", abortReason);
            return o.ToString();
        }
    }

    /// <summary>Minimal JSON object writer (JsonUtility cannot write free-form objects or nulls).</summary>
    public sealed class JsonOut
    {
        readonly StringBuilder sb = new StringBuilder();

        JsonOut Key(string name)
        {
            if (sb.Length > 0) sb.Append(',');
            sb.Append(Quote(name)).Append(':');
            return this;
        }

        public JsonOut Str(string name, string value)
        {
            Key(name).sb.Append(value == null ? "null" : Quote(value));
            return this;
        }

        public JsonOut Num(string name, double value)
        {
            Key(name).sb.Append(Number(value));
            return this;
        }

        public JsonOut Bool(string name, bool value)
        {
            Key(name).sb.Append(value ? "true" : "false");
            return this;
        }

        /// <summary>A value that already is JSON.</summary>
        public JsonOut Raw(string name, string json)
        {
            Key(name).sb.Append(string.IsNullOrEmpty(json) ? "null" : json);
            return this;
        }

        public JsonOut Vec(string name, Vector3 v)
        {
            Key(name).sb.Append('[').Append(Number(v.x)).Append(',').Append(Number(v.y)).Append(',').Append(Number(v.z)).Append(']');
            return this;
        }

        public JsonOut Merge(JsonOut other)
        {
            if (other.sb.Length == 0) return this;
            if (sb.Length > 0) sb.Append(',');
            sb.Append(other.sb);
            return this;
        }

        public override string ToString() => "{" + sb + "}";

        public static string Number(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) return "null";
            return Math.Round(v, 3).ToString("0.###", CultureInfo.InvariantCulture);
        }

        public static string Quote(string s)
        {
            var b = new StringBuilder("\"");
            foreach (var ch in s)
            {
                switch (ch)
                {
                    case '"': b.Append("\\\""); break;
                    case '\\': b.Append("\\\\"); break;
                    case '\n': b.Append("\\n"); break;
                    case '\r': b.Append("\\r"); break;
                    case '\t': b.Append("\\t"); break;
                    default:
                        if (ch < 0x20) b.Append("\\u").Append(((int)ch).ToString("x4"));
                        else b.Append(ch);
                        break;
                }
            }
            return b.Append('"').ToString();
        }
    }
}
