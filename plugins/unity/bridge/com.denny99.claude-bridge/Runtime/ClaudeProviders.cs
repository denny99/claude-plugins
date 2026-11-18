// Provider interfaces through which a project feeds game-specific data to the Claude Code bridge: where the player is
// (spot), what a frame costs (perf), and its sounds and mix. The bridge itself is generic; a project implements any of
// these and registers the implementation. Runtime assembly (not Editor-only) so game code can implement them too; in a
// player build nothing reads the registry.
//
// Two ways to register (see README):
//  1. [ClaudeBridgeProvider] on a plain class with a public parameterless constructor. The editor bridge finds it via
//     TypeCache after EVERY domain reload and creates one instance, so it survives reloads with no code of your own.
//  2. ClaudeProviders.Register(obj) (or ClaudeBridge.Register in editor code) for an instance, e.g. a MonoBehaviour in
//     OnEnable. Statics are wiped by a domain reload: register again from OnEnable / [InitializeOnLoad].
//     Explicit registrations win over discovered ones; the most recent one wins. Destroyed Unity objects are skipped.
using System;
using System.Collections.Generic;

namespace Denny99.ClaudeBridge
{
    /// <summary>Where the player is: a free-form JSON object (position, time of day, weather, seed …).</summary>
    public interface IClaudeSpotProvider
    {
        /// <summary>The current spot as a JSON object (must start with '{'), or null when there is none.</summary>
        string Capture();

        /// <summary>Jumps to a spot that Capture() produced earlier. Throw to report a failure.</summary>
        void GoTo(string spotJson);
    }

    /// <summary>Named per-frame costs for perf_record (e.g. "AI", "Pathfinding", "GC").</summary>
    public interface IClaudePerfSource
    {
        /// <summary>
        /// Called once per recorded frame at the end of the frame (PostLateUpdate). Add the costs of the frame that just
        /// ran in milliseconds: costsMs["AI"] = 1.2f. The dictionary is cleared before every call.
        /// </summary>
        void Sample(IDictionary<string, float> costsMs);
    }

    public enum ClaudeSoundMode
    {
        /// <summary>Spatial, from a point close to the listener.</summary>
        Near,

        /// <summary>2D, no spatialisation.</summary>
        Flat,
    }

    [Serializable]
    public class ClaudeSound
    {
        public string id;
        public string name;
        public string group;
        public float duration;
        public int takes = 1;
    }

    [Serializable]
    public class ClaudeMixGroup
    {
        public string group;
        public float db;
    }

    /// <summary>The project's sounds and mixer groups.</summary>
    public interface IClaudeSoundBoard
    {
        IList<ClaudeSound> List();

        /// <summary>Plays one sound (a random take). Throw for an unknown id.</summary>
        void Play(string id, ClaudeSoundMode mode);

        void Stop();

        IList<ClaudeMixGroup> GetMix();

        /// <summary>Sets a group's volume in dB and persists it. Throw for an unknown group.</summary>
        void SetMix(string group, float db);
    }

    /// <summary>Marks a class the editor bridge instantiates and registers after every domain reload.</summary>
    [AttributeUsage(AttributeTargets.Class, Inherited = false)]
    public sealed class ClaudeBridgeProviderAttribute : Attribute
    {
    }

    public static class ClaudeProviders
    {
        static readonly List<object> registered = new List<object>();
        static readonly List<object> discovered = new List<object>();

        /// <summary>Registers a provider instance (any of the IClaude* interfaces). Registering again moves it to the top.</summary>
        public static void Register(object provider)
        {
            if (provider == null) throw new ArgumentNullException(nameof(provider));
            lock (registered)
            {
                registered.Remove(provider);
                registered.Add(provider);
            }
        }

        public static void Unregister(object provider)
        {
            lock (registered) registered.Remove(provider);
        }

        /// <summary>Used by the editor bridge for [ClaudeBridgeProvider] types; replaces the previous discovery.</summary>
        public static void SetDiscovered(IEnumerable<object> providers)
        {
            lock (registered)
            {
                discovered.Clear();
                discovered.AddRange(providers);
            }
        }

        /// <summary>The provider of type T that wins (latest explicit registration, else the first discovered), or null.</summary>
        public static T Get<T>() where T : class
        {
            var all = GetAll<T>();
            return all.Count > 0 ? all[0] : null;
        }

        /// <summary>All live providers of type T, winner first.</summary>
        public static List<T> GetAll<T>() where T : class
        {
            var list = new List<T>();
            lock (registered)
            {
                for (var i = registered.Count - 1; i >= 0; i--)
                    if (Alive(registered[i]) && registered[i] is T t && !list.Contains(t)) list.Add(t);
                foreach (var d in discovered)
                    if (Alive(d) && d is T t && !list.Contains(t)) list.Add(t);
            }
            return list;
        }

        /// <summary>Drops every registration (tests).</summary>
        public static void Clear()
        {
            lock (registered)
            {
                registered.Clear();
                discovered.Clear();
            }
        }

        // A destroyed UnityEngine.Object compares equal to null through its overloaded operator.
        static bool Alive(object o) => !(o is UnityEngine.Object u) || u != null;
    }
}
