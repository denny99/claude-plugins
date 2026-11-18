// Test runs for the bridge through the Test Framework's TestRunnerApi. State goes to Temp/ClaudeBridge/tests.json
// after every finished test, so a PlayMode run (which reloads the domain when entering Play mode) keeps its results:
// the callbacks are registered again from [InitializeOnLoad] and the file is read back into memory.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.TestTools.TestRunner.Api;
using UnityEngine;

namespace Denny99.ClaudeBridge
{
    public static class BridgeTests
    {
        [Serializable]
        class TestResult
        {
            public string fullName;
            public string name;
            public string status;
            public string message;
            public string stack;
            public double duration;
        }

        [Serializable]
        class TestRun
        {
            public string runId;
            public string state = "idle";
            public string mode;
            public string filter;
            public string error;
            public long finishedAt;
            public long startedAt;
            /// <summary>Leaf tests in the run (RunStarted's TestCaseCount); 0 until it is known.</summary>
            public int total;
            /// <summary>The test running now (full name); empty between tests.</summary>
            public string current;
            public List<TestResult> results = new List<TestResult>();
        }

        static TestRun current = new TestRun();
        static TestRunnerApi api;

        // The run id lives in SessionState too: it survives a domain reload (PlayMode run) but not an editor restart.
        // A tests.json that says "running" for a run this editor session never started is left over from a killed or
        // crashed editor and is marked as an error on startup.
        const string RunKey = "ClaudeBridge.testRunId";
        // The Test Framework's own id of the run (Execute's return value where it has one), for CancelTestRun.
        const string GuidKey = "ClaudeBridge.testRunGuid";

        class Callbacks : ICallbacks
        {
            public void RunStarted(ITestAdaptor testsToRun)
            {
                if (current.state != "running") return;
                try { current.total = testsToRun.TestCaseCount; } catch { current.total = 0; }
                Save();
            }

            public void RunFinished(ITestResultAdaptor result)
            {
                if (current.state != "running") return;
                current.state = "done";
                current.finishedAt = ClaudeBridge.Now();
                current.current = "";
                SessionState.EraseString(RunKey);
                SessionState.EraseString(GuidKey);
                Save();
            }

            public void TestStarted(ITestAdaptor test)
            {
                if (current.state != "running" || test.HasChildren) return;
                current.current = test.FullName;
                Save();
            }

            public void TestFinished(ITestResultAdaptor result)
            {
                if (current.state != "running" || result.HasChildren) return;
                current.results.RemoveAll(r => r.fullName == result.Test.FullName);
                current.results.Add(new TestResult
                {
                    fullName = result.Test.FullName,
                    name = result.Test.Name,
                    status = result.TestStatus.ToString(),
                    message = result.Message,
                    stack = result.StackTrace,
                    duration = result.Duration,
                });
                Save();
            }
        }

        public static void Init()
        {
            try
            {
                var file = Path.Combine(ClaudeBridge.Dir, "tests.json");
                if (File.Exists(file)) current = JsonUtility.FromJson<TestRun>(File.ReadAllText(file)) ?? new TestRun();
            }
            catch
            {
                current = new TestRun();
            }
            if (current.state == "running" && SessionState.GetString(RunKey, "") != current.runId)
            {
                current.state = "error";
                current.error = "The editor was closed or crashed during the run; results are incomplete.";
                current.finishedAt = ClaudeBridge.Now();
                Save();
            }
            api = ScriptableObject.CreateInstance<TestRunnerApi>();
            api.RegisterCallbacks(new Callbacks());
        }

        /// <summary>Starts a run; `filter` holds regexes on full test names separated by ';'. Returns the run id.</summary>
        public static string Run(string mode, string filter)
        {
            if (current.state == "running") throw new InvalidOperationException("A test run is already going (" + current.runId + ").");
            var testMode = mode == "PlayMode" ? TestMode.PlayMode : TestMode.EditMode;
            current = new TestRun
            {
                runId = "run-" + ClaudeBridge.Now(),
                state = "running",
                mode = testMode == TestMode.PlayMode ? "PlayMode" : "EditMode",
                filter = filter,
                startedAt = ClaudeBridge.Now(),
            };
            SessionState.SetString(RunKey, current.runId);
            SessionState.EraseString(GuidKey);
            Save();
            var f = new Filter { testMode = testMode };
            if (!string.IsNullOrEmpty(filter))
            {
                var groups = new List<string>();
                foreach (var part in filter.Split(';'))
                    if (part.Trim().Length > 0) groups.Add(part.Trim());
                f.groupNames = groups.ToArray();
            }
            try
            {
                var guid = Execute(new ExecutionSettings(f));
                if (!string.IsNullOrEmpty(guid)) SessionState.SetString(GuidKey, guid);
            }
            catch (Exception e)
            {
                current.state = "error";
                current.error = e.Message;
                SessionState.EraseString(RunKey);
                Save();
            }
            return current.runId;
        }

        /// <summary>
        /// TestRunnerApi.Execute; through reflection to keep its run id where this Test Framework returns one (a string
        /// in newer versions, void in some older ones). The run starts either way.
        /// </summary>
        static string Execute(ExecutionSettings settings)
        {
            var m = typeof(TestRunnerApi).GetMethod("Execute", new[] { typeof(ExecutionSettings) });
            if (m == null)
            {
                api.Execute(settings);
                return null;
            }
            try
            {
                return m.Invoke(api, new object[] { settings }) as string;
            }
            catch (TargetInvocationException e) when (e.InnerException != null)
            {
                throw e.InnerException;
            }
        }

        /// <summary>
        /// Stops the running run: TestRunnerApi.CancelAllJobs (Test Framework 1.4+), else CancelTestRun(guid) with the
        /// remembered id. Looked up by reflection, since neither exists in every Test Framework version. The run is
        /// marked as cancelled ("Cancelled") right away; results so far stay. Returns the run id.
        /// </summary>
        public static string Cancel()
        {
            if (current.state != "running") throw new BridgeError("bad-input", "No test run is going.");
            var type = typeof(TestRunnerApi);
            const BindingFlags flags = BindingFlags.Public | BindingFlags.Static;
            var cancelled = false;
            try
            {
                var all = type.GetMethod("CancelAllJobs", flags, null, Type.EmptyTypes, null);
                if (all != null)
                {
                    all.Invoke(null, null);
                    cancelled = true;
                }
                else
                {
                    var guid = SessionState.GetString(GuidKey, "");
                    var one = type.GetMethod("CancelTestRun", flags, null, new[] { typeof(string) }, null);
                    if (one != null && guid.Length > 0)
                    {
                        var r = one.Invoke(null, new object[] { guid });
                        cancelled = !(r is bool) || (bool)r;
                    }
                }
            }
            catch (TargetInvocationException e) when (e.InnerException != null)
            {
                throw new BridgeError("cancel-failed", "Cancelling failed: " + e.InnerException.Message);
            }
            if (!cancelled)
                throw new BridgeError("unsupported",
                    "This Test Framework version cannot cancel a run. Wait for it to finish, or update com.unity.test-framework to 1.4 or newer.");
            current.state = "error";
            current.error = "Cancelled";
            current.current = "";
            current.finishedAt = ClaudeBridge.Now();
            SessionState.EraseString(RunKey);
            SessionState.EraseString(GuidKey);
            Save();
            return current.runId;
        }

        static void Save() => ClaudeBridge.WriteAtomic("tests.json", JsonUtility.ToJson(current));
    }
}
