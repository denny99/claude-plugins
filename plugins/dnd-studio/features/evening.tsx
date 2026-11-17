/**
 * The evening around the table: the watcher (`wait_for_players watch` run as a background Bash), the person's
 * interjections for the debrief, the Discord section, and the Studio version (stale MCP schemas after an app update).
 * Everything here only reads, notes and reminds; nothing acts on the table by itself.
 */
import type { EngineInterface, On, RenderElement } from "claude-code";

import {
  debriefText,
  discordOf,
  EMPTY_LISTENER,
  isListenerMode,
  isLive,
  isWatchCommand,
  listenerReturnOf,
  watchIdOf,
  slug,
  staleSchemaOf,
  versionOf,
  whisperOf,
  gpuOf,
} from "../lib/model";
import {
  patchCheck,
  patchEvening,
  patchLive,
  readCampaign,
  readEvening,
  readInitiative,
  readLive,
  readTable,
  setTable,
} from "../lib/state";
import { studioCall } from "../lib/studio";
import {
  EmptyState,
  ErrorState,
  Line,
  Row,
  Section,
  sanitize,
  truncate,
} from "../lib/ui";
import type { Kit } from "../lib/ui";
import type {
  EveningState,
  Interjection,
  ListenerState,
  Rules,
  TableView,
} from "../types";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};

export const STALE_TEXT = "MCP schemas stale — restart Claude";
export const NO_WATCHER_NOTE =
  "Your last turn ended at a live table without a running watcher: the players' turns go unnoticed. Call wait_for_players with watch: true and run its command with Bash run_in_background before you end a turn.";
export const NO_LISTENER_NOTE =
  'Your last answer ended in listener mode (discord listener haiku) without a running pnp-zuhoerer: nothing wakes you when the players speak. Start exactly one dnd-studio:pnp-zuhoerer in the background (Agent, run_in_background: true) at the beginning of each answer to a listener wake (pnp-spielleiter, "Mit dem Zuhörer").';
export const LISTENER_AGENT = "pnp-zuhoerer";

/** True while this plugin submits a prompt itself (a person's button), so it is not taken as an interjection. */
let submitting = false;

/** Submits a prompt for the main thread on a person's press (never on its own). */
export async function submitForPerson(
  $: EngineInterface,
  text: string,
): Promise<void> {
  submitting = true;
  try {
    await $.prompt.submit({ text });
  } finally {
    submitting = false;
  }
}

// --- what studio_status, discord and failing calls tell ------------------------------------------------------------

/** studio_status: GPU jobs and the app version (a changed version means Claude's tool schemas are stale). */
export async function noteStudioStatus(
  $: EngineInterface,
  json: Obj,
): Promise<void> {
  const now = await $.clock.now();
  if (Array.isArray(json.jobs))
    await patchCheck($, () => ({ gpu: gpuOf(json, now) }));
  const v = versionOf(json);
  if (!v) return;
  await patchEvening($, (s) => {
    const start = s.versionAtStart || v;
    return {
      versionAtStart: start,
      versionNow: v,
      stale:
        v !== start
          ? `Studio ${start} → ${v}: ${STALE_TEXT}`
          : s.stale.startsWith("Studio ")
            ? ""
            : s.stale,
    };
  });
}

/** A Studio answer that refuses arguments of Claude's cached schema. */
export async function noteStale(
  $: EngineInterface,
  text: string,
): Promise<boolean> {
  const why = staleSchemaOf(text);
  if (!why) return false;
  await patchEvening($, () => ({ stale: `${why}: ${STALE_TEXT}` }));
  return true;
}

/** discord answers: status, rooms, warnings; whisper delivery (also roll_dice whisper). */
export async function noteDiscord(
  $: EngineInterface,
  tool: string,
  input: Obj,
  json: Obj,
): Promise<void> {
  const now = await $.clock.now();
  const whisper = whisperOf(json, now);
  if (whisper) await patchEvening($, () => ({ whisper }));
  if (tool !== "discord") return;
  const action = String(input.action ?? "status");
  if (
    [
      "status",
      "join",
      "leave",
      "split",
      "aside",
      "go",
      "merge",
      "move",
    ].includes(action)
  ) {
    const info = discordOf(json, now);
    await patchEvening($, (s) => ({
      discord:
        action === "status" ||
        action === "join" ||
        action === "leave" ||
        !s.discord
          ? info
          : {
              ...s.discord,
              rooms: info.rooms.length ? info.rooms : s.discord.rooms,
              channel: info.channel || s.discord.channel,
              streamEnded: info.streamEnded,
              unheard: info.unheard,
              warning: info.warning,
              error: info.error,
              checkedAt: now,
            },
    }));
    if (info.streamEnded.length || info.unheard.length)
      await patchLive($, () => ({
        warning: info.streamEnded.length
          ? `discord stream_ended: ${info.streamEnded.join(", ")}`
          : `discord unheard: ${info.unheard.join(", ")}`,
      }));
  }
}

/** Reads `discord` status (a person's press or Refresh with the bot at the table). */
export async function refreshDiscord($: EngineInterface): Promise<void> {
  try {
    const json = await studioCall($, "discord", { action: "status" });
    await noteDiscord($, "discord", { action: "status" }, json);
  } catch (err) {
    const now = await $.clock.now();
    await patchEvening($, (s) => ({
      discord: {
        ...(s.discord ?? discordOf({}, now)),
        error: err instanceof Error ? err.message.split("\n")[0]! : String(err),
        checkedAt: now,
      },
    }));
  }
}

async function discordAction(
  $: EngineInterface,
  done: string,
  args: Obj,
): Promise<void> {
  try {
    const json = await studioCall($, "discord", args);
    await noteDiscord($, "discord", args, json);
    $.ui.toast(done);
  } catch (err) {
    $.ui.toast(
      `✗ discord: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    );
  }
}

// --- the watcher ---------------------------------------------------------------------------------------------------

/**
 * A Bash call to a watch URL was allowed: that is the watcher. Seen at `tool.check` (observe only) — a `tool.call` or
 * `tool.run` hook on Bash would turn off `run_in_background` for every Bash call of the session, the watch included.
 */
export async function noteBash(
  $: EngineInterface,
  input: Obj,
  agentId?: string,
): Promise<void> {
  const command = String(input.command ?? "");
  if (!isWatchCommand(command)) return;
  // A subagent's watch is the listener's (pnp-zuhoerer, in the foreground): never the GM's watcher.
  if (agentId) return;
  const now = await $.clock.now();
  const watchId = watchIdOf(command);
  const description = String(input.description ?? "").trim();
  // A foreground watch has ended by the time the model reads its answer; only a background one keeps watching.
  const background = input.run_in_background !== false;
  await patchEvening($, () => ({
    watcher: background
      ? { state: "running", watchId, description, startedAt: now, endedAt: 0 }
      : { state: "ended", watchId, description, startedAt: now, endedAt: now },
    remindPending: false,
  }));
}

/** A task notification about the watcher (its URL id, its description or a watch URL): the watch has ended. */
export async function noteTaskNotification(
  $: EngineInterface,
  text: string,
): Promise<boolean> {
  const s = await readEvening($);
  if (s.watcher.state !== "running") return false;
  const { watchId, description } = s.watcher;
  const hit =
    (!!watchId && text.includes(watchId)) ||
    (!!description && text.includes(description)) ||
    /\/watch\//.test(text);
  if (!hit) return false;
  const now = await $.clock.now();
  await patchEvening($, (e) => ({
    watcher: { ...e.watcher, state: "ended", endedAt: now },
  }));
  return true;
}

async function tableIsLive($: EngineInterface): Promise<boolean> {
  return isLive(await readTable($), await readInitiative($));
}

/** The main thread's turn ended: at a live table without a running watcher, remind (toast once, a note on the next prompt). */
export async function noteTurnEnd($: EngineInterface): Promise<boolean> {
  if (!(await tableIsLive($))) return false;
  const s = await readEvening($);
  if (isListenerMode(await readTable($))) {
    // Listener mode: the running pnp-zuhoerer is the watcher.
    const running = await dropExpiredListeners($, s.listener.running);
    if (running.length) return false;
    // It came back during this very turn (or its wake is still on its way): the GM restarts it after reading it.
    const l = s.listener;
    if (s.wakePending) return false;
    if (!l.error && l.endedAt && l.endedAt >= (s.mainTurnAt ?? 0)) return false;
    await patchEvening($, () => ({
      remindPending: true,
      remindListener: true,
    }));
    if (!s.remindPending)
      $.ui.toast(
        "⚠ Answer ended without a listener: start pnp-zuhoerer (listener mode).",
      );
    return true;
  }
  if (s.watcher.state === "running") return false;
  await patchEvening($, () => ({ remindPending: true, remindListener: false }));
  if (!s.remindPending)
    $.ui.toast(
      "⚠ Turn ended without a watcher: players' turns go unnoticed (wait_for_players watch).",
    );
  return true;
}

// --- the listener (pnp-zuhoerer) ---------------------------------------------------------------------------------

/** Listeners started without an agentId carry a made-up id `pnp-zuhoerer-<startedAt>`. */
const SYNTHETIC_PREFIX = `${LISTENER_AGENT}-`;
/** A made-up listener id older than this is a run whose end never reached the mod: dropped. */
const SYNTHETIC_TTL_MS = 15 * 60 * 1000;

const syntheticAt = (id: string): number | undefined => {
  if (!id.startsWith(SYNTHETIC_PREFIX)) return undefined;
  const at = Number(id.slice(SYNTHETIC_PREFIX.length));
  return Number.isFinite(at) ? at : undefined;
};

/** `running` without the made-up ids older than the TTL (stored back when any were dropped). */
async function dropExpiredListeners(
  $: EngineInterface,
  running: string[],
): Promise<string[]> {
  const now = await $.clock.now();
  const keep = running.filter((r) => {
    const at = syntheticAt(r);
    return at === undefined || now - at < SYNTHETIC_TTL_MS;
  });
  if (keep.length !== running.length)
    await patchEvening($, (e) => ({
      listener: {
        ...e.listener,
        running: e.listener.running.filter((r) => keep.includes(r)),
      },
    }));
  return keep;
}

/** The main thread's turn started: a listener return after this belongs to this turn; an earlier wake is now read. */
export async function noteMainTurnStart($: EngineInterface): Promise<void> {
  const now = await $.clock.now();
  await patchEvening($, () => ({ mainTurnAt: now, wakePending: false }));
}

/** A pnp-zuhoerer started (agent.spawn): it is the watcher in listener mode. */
export async function noteListenerSpawn(
  $: EngineInterface,
  agentId: string | undefined,
): Promise<void> {
  const now = await $.clock.now();
  const id = agentId || `${LISTENER_AGENT}-${now}`;
  await patchEvening($, (s) => ({
    listener: {
      ...s.listener,
      running: [...s.listener.running.filter((r) => r !== id), id],
      startedAt: now,
      error: "",
    },
    remindPending: false,
    remindListener: false,
  }));
}

/**
 * An agent's turn ended: when it is a running listener, read its return `{woke, why, turn, between}`. A wake with a
 * turn counts as the players' turn (silence, spotlight fairness, a pending secret). True when it was the listener.
 */
export async function noteListenerEnd(
  $: EngineInterface,
  agentId: string,
  answer: string,
  failed: boolean,
): Promise<boolean> {
  const s = await readEvening($);
  const running = await dropExpiredListeners($, s.listener.running);
  const back = failed ? undefined : listenerReturnOf(answer);
  // A listener spawned without an agentId: its return is matched only when it is the one such run.
  const synthetic = running.filter((r) => syntheticAt(r) !== undefined);
  const id = running.includes(agentId)
    ? agentId
    : back && synthetic.length === 1
      ? synthetic[0]
      : undefined;
  if (!id) return false;
  const now = await $.clock.now();
  const rest = running.filter((r) => r !== id);
  if (!back) {
    await patchEvening($, (e) => ({
      listener: {
        ...e.listener,
        running: rest,
        endedAt: now,
        error: failed
          ? "the listener stopped (error or aborted)"
          : "the listener's answer was not its JSON",
      },
    }));
    return true;
  }
  const lines = back.lines.map((l) => `${l.who}: ${l.text}`);
  await patchEvening($, (e) => ({
    listener: {
      ...e.listener,
      running: rest,
      endedAt: now,
      returned: true,
      woke: back.woke,
      why: back.why,
      turn: lines.length ? lines : back.woke ? [] : e.listener.turn,
      sent: back.sent,
      secret: back.secret,
      // a real wake was answered: what the group said before it is the GM's now
      between: [
        ...(e.listener.returned && e.listener.woke ? [] : e.listener.between),
        ...back.between,
      ].slice(-30),
      error: "",
    },
    wakePending: back.woke,
  }));
  if (back.woke && back.lines.length) {
    const live = await readLive($);
    const addressed = { ...live.addressed };
    for (const l of back.lines) if (l.who) addressed[l.who] = now;
    const secret = back.lines.find((l) => l.secret);
    await patchLive($, () => ({
      turnAt: now,
      addressed,
      secretPending: secret
        ? secret.who || "a player"
        : back.secret
          ? back.lines[0]?.who || "a player"
          : live.secretPending,
    }));
  }
  return true;
}

/** The listener switch on a person's press: `discord` with `listener` haiku/off; the Table view follows at once. */
export async function setListener(
  $: EngineInterface,
  mode: "haiku" | "off",
): Promise<void> {
  try {
    const json = await studioCall($, "discord", { listener: mode });
    await noteDiscord($, "discord", { action: "status" }, json);
    const view = await readTable($);
    if (view) await setTable($, { ...view, listener: mode });
    $.ui.toast(
      mode === "haiku"
        ? "Listener on: open mic, pnp-zuhoerer waits for the GM"
        : "Listener off: talk buttons and the watch",
    );
  } catch (err) {
    $.ui.toast(
      `✗ discord listener: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    );
  }
}

// --- interjections -------------------------------------------------------------------------------------------------

/** The plugin data folder (made by the call). */
async function dataDir($: EngineInterface): Promise<string> {
  const env = await $.process.hookEnv();
  return env.CLAUDE_PLUGIN_DATA ?? "";
}

/** Keeps a line the person typed at the live table, and writes the debrief file in the plugin's data folder. */
export async function recordInterjection(
  $: EngineInterface,
  text: string,
): Promise<Interjection | undefined> {
  const clean = sanitize(text).trim();
  if (!clean) return undefined;
  const now = await $.clock.now();
  const note: Interjection = { at: now, text: clean.slice(0, 600) };
  const s = await patchEvening($, (e) => ({
    notes: [...e.notes, note].slice(-200),
  }));
  try {
    let file = s.notesFile;
    const title =
      (await readCampaign($))?.name ||
      (await readTable($))?.scene?.title ||
      "evening";
    if (!file) {
      const dir = await dataDir($);
      if (!dir) return note;
      file = `${dir.replace(/[\\/]+$/, "")}/debrief-${slug(title)}-${new Date(now).toISOString().slice(0, 10)}.md`;
      await patchEvening($, () => ({ notesFile: file }));
    }
    await $.fs.write(file, debriefText(title, s.notes));
  } catch {
    // the list in the pane is kept even when the file cannot be written
  }
  return note;
}

export async function clearInterjections($: EngineInterface): Promise<void> {
  await patchEvening($, () => ({ notes: [], notesFile: "" }));
}

/** Only what the person typed: the composer (or a remote bridge), no slash command, no meta or task notification. */
export function isPersonsPrompt(e: {
  text?: string;
  isMeta?: boolean;
  command?: unknown;
  origin?: { kind?: string };
}): boolean {
  if (submitting || e.isMeta || e.command) return false;
  const kind = e.origin?.kind;
  return (
    (kind === "composer" || kind === "bridge") &&
    !String(e.text ?? "")
      .trim()
      .startsWith("/")
  );
}

export function registerEvening(on: On): void {
  // Observe only: never tool.call/tool.run on Bash (that would end backgrounding for the whole session).
  on("tool.check", { tool: "Bash" }, async ($, e, next) => {
    const verdict = await next(e);
    try {
      const input = obj(e.input);
      if (
        e.tool_use_id &&
        verdict.decision !== "deny" &&
        isWatchCommand(String(input.command ?? ""))
      )
        await noteBash($, input, e.agentId);
    } catch {
      // watching never changes a verdict
    }
    return verdict;
  }).catch(($, e, next) => next(e));

  on("turn.start", async ($, e, next) => {
    try {
      if (!e.agentId) await noteMainTurnStart($);
    } catch {
      // timing never delays a turn
    }
    return next(e);
  });

  on("prompt.submit", async ($, e, next) => {
    let context: string[] = [];
    try {
      if (
        e.origin?.kind === "task-notification" ||
        /<task-notification>/.test(e.text)
      ) {
        await noteTaskNotification($, e.text);
        // a returned agent reaches the main thread: a pending wake is delivered with it
        if ((await readEvening($)).wakePending)
          await patchEvening($, () => ({ wakePending: false }));
      } else if (isPersonsPrompt(e)) {
        const s = await readEvening($);
        if (s.remindPending) {
          context = [s.remindListener ? NO_LISTENER_NOTE : NO_WATCHER_NOTE];
          await patchEvening($, () => ({
            remindPending: false,
            remindListener: false,
          }));
        }
        if (await tableIsLive($)) await recordInterjection($, e.text);
      }
    } catch {
      // a note is never worth a lost prompt
    }
    const r = await next(e);
    if (!context.length || "drop" in r) return r;
    return { ...r, context: [...(r.context ?? []), ...context] };
  });
}

// --- rendering -----------------------------------------------------------------------------------------------------

/** The band's evening parts: watcher state and the stale-schema warning. */
export function bandEvening(
  s: EveningState,
  listenerMode = false,
): {
  watch: string;
  watching: boolean;
  stale: string;
} {
  const stale = s.stale ? STALE_TEXT : "";
  if (listenerMode) {
    const l = s.listener;
    const skipped = l.returned && !l.woke ? l.between.length : 0;
    if (l.running.length > 1)
      return {
        watching: false,
        watch: `${l.running.length} listeners running (one is enough)`,
        stale,
      };
    if (l.running.length)
      return {
        watching: true,
        watch: `listener: waiting · ${skipped} skipped`,
        stale,
      };
    return {
      watching: false,
      watch:
        l.returned && l.woke
          ? `listener woke: ${l.why || "a turn"}`
          : "no listener",
      stale,
    };
  }
  return {
    watching: s.watcher.state === "running",
    watch: s.watcher.state === "running" ? "watching" : "no watcher",
    stale,
  };
}

/** The Listener section of the Table tab: switch, state, last wake and turn, what the group discussed without the GM. */
export function renderListener(
  $: EngineInterface,
  k: Kit,
  d: { evening: EveningState; view: TableView | null; rules: Rules },
): RenderElement {
  const on = isListenerMode(d.view);
  const l: ListenerState = d.evening.listener ?? EMPTY_LISTENER;
  const children: RenderElement[] = [];
  if (!on && !l.returned && !l.running.length)
    children.push(
      EmptyState(
        k,
        "Off: talk buttons and the watch. On: open mic, pnp-zuhoerer (Haiku) wakes the GM only when needed.",
      ),
    );
  else {
    children.push(
      Row(k, {
        key: "ls-state",
        status: l.running.length === 1 ? "running" : "warning",
        primary:
          l.running.length > 1
            ? `${l.running.length} listeners running: one is enough`
            : l.running.length
              ? "Listener waiting for the players"
              : on
                ? "No listener running"
                : "Listener switched off",
      }),
    );
    if (l.error)
      children.push(Line(k, `✗ ${l.error}`, { color: "red", indent: 1 }));
    if (l.returned)
      children.push(
        Line(
          k,
          `Last return: ${l.woke ? "woke" : "not woken"}${l.why ? ` · ${l.why}` : ""}${l.sent ? " · sent" : ""}`,
          { dim: !l.woke },
        ),
      );
    if (l.turn.length) {
      const hide = l.secret && d.rules.spoilerSafe;
      children.push(Line(k, "Last turn:", { bold: true }));
      for (const t of hide ? ["(secret turn, hidden)"] : l.turn.slice(-6))
        children.push(Line(k, t, { indent: 1 }));
    }
    children.push(
      Line(k, `Discussed without the GM: ${l.between.length}`, { bold: true }),
    );
    for (const b of l.between.slice(-8))
      children.push(Line(k, b, { dim: true, indent: 1 }));
  }
  return Section(k, {
    key: "listener",
    title: "Listener",
    count: on ? "on" : "off",
    collapsible: true,
    defaultOpen: on,
    actions: [
      on
        ? {
            key: "listener-off",
            label: "Listener off",
            confirm: "Really switch the listener off?",
            onPress: () => void setListener($, "off"),
          }
        : {
            key: "listener-on",
            label: "Listener on",
            onPress: () => void setListener($, "haiku"),
          },
    ],
    children,
  });
}

/** The interjection list, inside the end-of-evening section. */
export function renderInterjections(
  $: EngineInterface,
  k: Kit,
  s: EveningState,
): RenderElement[] {
  const head = Line(
    k,
    `Interjections for the debrief: ${s.notes.length}${s.notesFile ? ` · ${s.notesFile}` : ""}`,
    { bold: true },
  );
  if (!s.notes.length)
    return [head, EmptyState(k, "Nothing typed at the live table yet.")];
  const shown = s.notes.slice(-Math.max(3, Math.min(10, k.rows - 8)));
  return [
    head,
    ...shown.map((n) =>
      Line(k, `${new Date(n.at).toISOString().slice(11, 16)} ${n.text}`, {
        dim: true,
        indent: 1,
      }),
    ),
    Row(k, {
      key: "notes",
      primary: "",
      dim: true,
      actions: [
        {
          key: "notes-clear",
          label: "Clear list",
          confirm: "Really clear?",
          onPress: () => void clearInterjections($),
        },
      ],
    }),
  ];
}

/** The Discord section of the Table tab: players, rooms, last whisper, warnings; buttons only on press. */
export function renderDiscord(
  $: EngineInterface,
  k: Kit,
  d: {
    evening: EveningState;
    view: TableView | null;
    rules: Rules;
    now: number;
  },
): RenderElement {
  const { evening, view } = d;
  const info = evening.discord;
  const atTable = !!view?.discord || !!info?.connected;
  const children: RenderElement[] = [];
  if (!info)
    children.push(
      EmptyState(
        k,
        atTable
          ? "Press Status to read the bot."
          : "The bot is not at the table.",
      ),
    );
  else {
    if (info.error)
      children.push(
        ErrorState(k, {
          key: "discord-err",
          message: info.error,
          onRetry: () => void refreshDiscord($),
        }),
      );
    children.push(
      Line(
        k,
        info.connected
          ? `In ${info.channel || "the voice channel"}`
          : "Not in a voice channel",
        { dim: true },
      ),
    );
    const mappedChars = new Set(
      info.members.map((m) => m.character).filter(Boolean),
    );
    for (const m of info.members)
      children.push(
        Row(k, {
          key: `dm-${m.name}`,
          status: m.character ? "ok" : "warning",
          primary: m.character
            ? `${m.character} · ${m.name}`
            : `${m.name} · not mapped`,
        }),
      );
    if (info.connected)
      for (const h of view?.party ?? [])
        if (!h.foe && !mappedChars.has(h.name))
          children.push(
            Row(k, {
              key: `dh-${h.name}`,
              status: "warning",
              primary: `${h.name}: no player here`,
              secondary: "party set discord, or the player says /ich-bin",
            }),
          );
    for (const r of info.rooms)
      children.push(
        Line(
          k,
          `${r.bot ? "▶ " : "  "}${r.name}: ${r.members.join(", ") || "empty"}`,
          { dim: !r.bot },
        ),
      );
    if (info.missing.length)
      children.push(
        Row(k, {
          key: "d-missing",
          status: "warning",
          primary: `Setup: ${info.missing.join(", ")}`,
        }),
      );
    if (info.streamEnded.length)
      children.push(
        Row(k, {
          key: "d-stream",
          status: "failed",
          primary: `Screen share ended: ${info.streamEnded.join(", ")}`,
          secondary: "ask them to share the players' window again",
        }),
      );
    if (info.unheard.length)
      children.push(
        Row(k, {
          key: "d-unheard",
          status: "warning",
          primary: `May not hear the bot: ${info.unheard.join(", ")}`,
          secondary: "ask them to leave the room and come in again",
        }),
      );
    if (info.warning && !info.streamEnded.length && !info.unheard.length)
      children.push(
        Row(k, { key: "d-warn", status: "warning", primary: info.warning }),
      );
  }
  const w = evening.whisper;
  if (w)
    children.push(
      Row(k, {
        key: "d-whisper",
        status: w.delivered ? "ok" : "failed",
        primary: `Last whisper to ${w.to || "?"}: ${w.delivered ? "delivered" : `not delivered (${w.reason || "failed"})`}`,
        secondary: w.delivered ? "" : truncate(w.why, 200),
      }),
    );
  return Section(k, {
    key: "discord",
    title: "Discord",
    count: info ? `${info.members.length} players` : "",
    collapsible: true,
    defaultOpen: atTable,
    actions: [
      {
        key: "discord-status",
        label: "Status",
        onPress: () => void refreshDiscord($),
      },
      ...(info?.connected
        ? info.rooms.length > 1
          ? [
              {
                key: "discord-merge",
                label: "Merge rooms",
                confirm: "Really merge?",
                onPress: () =>
                  void discordAction($, "Party together again", {
                    action: "merge",
                  }),
              },
            ]
          : []
        : [
            {
              key: "discord-join",
              label: "Join",
              onPress: () =>
                void discordAction($, "Bot joined the voice channel", {
                  action: "join",
                }),
            },
          ]),
    ],
    children,
  });
}
