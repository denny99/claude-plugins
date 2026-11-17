// Test runs for the bridge through the Test Framework's TestRunnerApi. State goes to Temp/ClaudeBridge/tests.json
// after every finished test, so a PlayMode run (which reloads the domain when entering Play mode) keeps its results:
// the callbacks are registered again from [InitializeOnLoad] and the file is read back into memory.
using System;
using System.Collections.Generic;
using System.IO;
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
            public List<TestResult> results = new List<TestResult>();
        }

        static TestRun current = new TestRun();
        static TestRunnerApi api;

        // The run id lives in SessionState too: it survives a domain reload (PlayMode run) but not an editor restart.
        // A tests.json that says "running" for a run this editor session never started is left over from a killed or
        // crashed editor and is marked as an error on startup.
        const string RunKey = "ClaudeBridge.testRunId";

        class Callbacks : ICallbacks
        {
            public void RunStarted(ITestAdaptor testsToRun)
            {
                if (current.state != "running") return;
                Save();
            }

            public void RunFinished(ITestResultAdaptor result)
            {
                if (current.state != "running") return;
                current.state = "done";
                current.finishedAt = ClaudeBridge.Now();
                SessionState.EraseString(RunKey);
                Save();
            }

            public void TestStarted(ITestAdaptor test) { }

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
            };
            SessionState.SetString(RunKey, current.runId);
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
                api.Execute(new ExecutionSettings(f));
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

        static void Save() => ClaudeBridge.WriteAtomic("tests.json", JsonUtility.ToJson(current));
    }
}
