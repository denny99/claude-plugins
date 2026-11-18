// EditMode tests for the provider registry and the provider-backed commands, driven through the real file queue
// (cmd file in, ClaudeBridge.ProcessCommands, result file out). Run with the package listed under "testables".
using System.Collections;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Denny99.ClaudeBridge.Tests
{
    [ClaudeBridgeProvider]
    public class DiscoveredSpot : IClaudeSpotProvider
    {
        public static string LastGoTo;
        public string Capture() => "{\"where\":\"discovered\"}";
        public void GoTo(string spotJson) => LastGoTo = spotJson;
    }

    [ClaudeBridgeProvider]
    public class DiscoveredPerf : IClaudePerfSource
    {
        public void Sample(IDictionary<string, float> costsMs) => costsMs["Test.Work"] = 0.25f;
    }

    class ExplicitSpot : IClaudeSpotProvider
    {
        public string Capture() => "{\"where\":\"explicit\",\"x\":1.5}";
        public void GoTo(string spotJson) { }
    }

    class Board : IClaudeSoundBoard
    {
        public readonly Dictionary<string, float> mix = new Dictionary<string, float> { { "Music", -6f }, { "SFX", 0f } };
        public string played;
        public IList<ClaudeSound> List() => new List<ClaudeSound> { new ClaudeSound { id = "door", group = "SFX", duration = 1.25f, takes = 3 } };
        public void Play(string id, ClaudeSoundMode mode) => played = id + ":" + mode;
        public void Stop() => played = null;
        public IList<ClaudeMixGroup> GetMix()
        {
            var l = new List<ClaudeMixGroup>();
            foreach (var kv in mix) l.Add(new ClaudeMixGroup { group = kv.Key, db = kv.Value });
            return l;
        }
        public void SetMix(string group, float db)
        {
            if (!mix.ContainsKey(group)) throw new KeyNotFoundException("no group " + group);
            mix[group] = db;
        }
    }

    public class ProviderTests
    {
        [SetUp]
        public void SetUp()
        {
            ClaudeProviders.Clear();
            ClaudeBridge.DiscoverProviders();
        }

        [TearDown]
        public void TearDown()
        {
            ClaudeProviders.Clear();
            ClaudeBridge.DiscoverProviders();
        }

        static string Queue(string json)
        {
            var id = "t" + System.Guid.NewGuid().ToString("N").Substring(0, 8);
            Directory.CreateDirectory(ClaudeBridge.Dir);
            File.WriteAllText(Path.Combine(ClaudeBridge.Dir, "cmd-" + id + ".json"), "{\"id\":\"" + id + "\"," + json + "}");
            return id;
        }

        static string TryResult(string id)
        {
            var result = Path.Combine(ClaudeBridge.Dir, "result-" + id + ".json");
            return File.Exists(result) ? File.ReadAllText(result) : null;
        }

        // Play mode end to end: the bridge's own Tick picks the commands up; perf hooks into the player loop.
        [UnityTest]
        public IEnumerator PerfRecordAndCaptureInPlayMode()
        {
            yield return new EnterPlayMode();
            var perfId = Queue("\"cmd\":\"perf_record\",\"seconds\":0.5");
            string perf = null;
            for (var i = 0; i < 3000 && perf == null; i++)
            {
                yield return null;
                perf = TryResult(perfId);
            }
            Debug.Log("[ProviderTests] perf result: " + perf);
            Assert.IsNotNull(perf, "perf_record did not answer");
            StringAssert.Contains("\"ok\":true", perf);
            StringAssert.Contains("\"p95\":", perf);
            StringAssert.Contains("\"name\":\"Test.Work\"", perf);
            StringAssert.Contains("\"spot\":{\"where\":\"discovered\"}", perf);

            var shotId = Queue("\"cmd\":\"capture\"");
            string shot = null;
            for (var i = 0; i < 3000 && shot == null; i++)
            {
                yield return null;
                shot = TryResult(shotId);
            }
            Debug.Log("[ProviderTests] capture result: " + shot);
            Assert.IsNotNull(shot, "capture did not answer");
            // Batchmode has no Game view to capture: the bridge refuses with a code instead of timing out.
            if (Application.isBatchMode) StringAssert.Contains("\"code\":\"batchmode\"", shot);
            else StringAssert.Contains("\"provider\":true", shot);
            yield return new ExitPlayMode();
        }

        static string Send(string json)
        {
            var id = "t" + System.Guid.NewGuid().ToString("N").Substring(0, 8);
            Directory.CreateDirectory(ClaudeBridge.Dir);
            File.WriteAllText(Path.Combine(ClaudeBridge.Dir, "cmd-" + id + ".json"), "{\"id\":\"" + id + "\"," + json + "}");
            ClaudeBridge.ProcessCommands();
            var result = Path.Combine(ClaudeBridge.Dir, "result-" + id + ".json");
            Assert.IsTrue(File.Exists(result), "no result for " + json);
            var text = File.ReadAllText(result);
            File.Delete(result);
            return text;
        }

        [Test]
        public void AttributeDiscoveryRegistersAfterReload()
        {
            Assert.IsInstanceOf<DiscoveredSpot>(ClaudeProviders.Get<IClaudeSpotProvider>());
        }

        [Test]
        public void ExplicitRegistrationWinsAndUnregisterFallsBack()
        {
            var e = new ExplicitSpot();
            ClaudeBridge.Register(e);
            Assert.AreSame(e, ClaudeProviders.Get<IClaudeSpotProvider>());
            Assert.AreEqual(2, ClaudeProviders.GetAll<IClaudeSpotProvider>().Count);
            ClaudeBridge.Unregister(e);
            Assert.IsInstanceOf<DiscoveredSpot>(ClaudeProviders.Get<IClaudeSpotProvider>());
        }

        [Test]
        public void DestroyedUnityObjectsAreSkipped()
        {
            var go = new GameObject("provider");
            ClaudeProviders.Register(go);
            Assert.AreSame(go, ClaudeProviders.Get<GameObject>());
            Object.DestroyImmediate(go);
            Assert.IsNull(ClaudeProviders.Get<GameObject>());
        }

        [Test]
        public void GotoCallsTheProviderAndAnswersWithTheSpot()
        {
            var text = Send("\"cmd\":\"goto\",\"spot\":\"{\\\"x\\\":2}\"");
            StringAssert.Contains("\"ok\":true", text);
            StringAssert.Contains("\"spot\":{\"where\":\"discovered\"}", text);
            Assert.AreEqual("{\"x\":2}", DiscoveredSpot.LastGoTo);
        }

        [Test]
        public void GotoWithoutProviderFailsWithCode()
        {
            ClaudeProviders.Clear();
            var text = Send("\"cmd\":\"goto\",\"spot\":\"{}\"");
            StringAssert.Contains("\"ok\":false", text);
            StringAssert.Contains("\"code\":\"no-provider\"", text);
        }

        [Test]
        public void PerfNeedsPlayMode()
        {
            StringAssert.Contains("\"code\":\"not-playing\"", Send("\"cmd\":\"perf_record\",\"seconds\":1"));
        }

        [Test]
        public void SoundBoardCommands()
        {
            StringAssert.Contains("\"code\":\"no-provider\"", Send("\"cmd\":\"sound_list\""));
            var board = new Board();
            ClaudeBridge.Register(board);
            StringAssert.Contains("\"sounds\":[{\"id\":\"door\",\"name\":\"door\",\"group\":\"SFX\",\"duration\":1.25,\"takes\":3}]", Send("\"cmd\":\"sound_list\""));
            Send("\"cmd\":\"sound_play\",\"sound\":\"door\",\"mode\":\"flat\"");
            Assert.AreEqual("door:Flat", board.played);
            Send("\"cmd\":\"sound_stop\"");
            Assert.IsNull(board.played);
            StringAssert.Contains("{\"group\":\"Music\",\"db\":-6}", Send("\"cmd\":\"mix_get\""));
            StringAssert.Contains("{\"group\":\"Music\",\"db\":-12.5}", Send("\"cmd\":\"mix_set\",\"group\":\"Music\",\"db\":-12.5"));
            StringAssert.Contains("no group Nope", Send("\"cmd\":\"mix_set\",\"group\":\"Nope\",\"db\":1"));
        }

        [Test]
        public void CaptureInEditModeRendersTheCameraAndAddsTheSpot()
        {
            // The scene may already have a Main Camera (it wins); this one only makes sure there is a camera.
            var go = new GameObject("ShotCam", typeof(Camera));
            try
            {
                var text = Send("\"cmd\":\"capture\",\"width\":64,\"height\":32");
                StringAssert.Contains("\"ok\":true", text);
                StringAssert.IsMatch("\"camera\":\\{\"name\":\"[^\"]+\",\"position\":\\[", text);
                StringAssert.Contains("\"spot\":{\"where\":\"discovered\"}", text);
                var path = System.Text.RegularExpressions.Regex.Match(text, "\"path\":\"([^\"]+)\"").Groups[1].Value;
                Assert.IsTrue(File.Exists(path), "no PNG at " + path);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void JsonOutEscapes()
        {
            Assert.AreEqual("{\"a\":\"q\\\"\\n\",\"n\":null,\"v\":1.5}",
                new JsonOut().Str("a", "q\"\n").Num("n", double.NaN).Num("v", 1.5).ToString());
        }
    }
}
