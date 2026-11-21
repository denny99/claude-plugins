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
  clockTime,
  localDay,
  personsNotes,
  personsText,
} from "../lib/model";
import {
  patchCheck,
  patchEvening,
  patchLive,
  campaignName,
  readEvening,
  readInitiative,
  readLive,
  readTable,
  setTable,
} from "../lib/state";
import { studioCall } from "../lib/studio";
import {
  askAction,
  askClaude,
  askTurnStart,
  isAsked,
  Card,
  sanitize,
  ListRow,
  Sentence,
  Toggle,
  truncate,
} from "../lib/ui";
import { Fold } from "./dnd-ui";
import type { Action, AskOptions, AskResult, Kit } from "../lib/ui";
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
  'Your last answer ended in listener mode (discord listener haiku) without a running pnp-zuhoerer: nothing wakes you when the players speak. Start exactly one dnd-studio:pnp-zuhoerer in the background (Agent, run_in_background: true) at the beginning of each answer to a listener wake (pnp-spielleiter, references/zuhoerer.md).';
export const LISTENER_AGENT = "pnp-zuhoerer";

/**
 * Submits a prompt for the main thread on a person's press (never on its own), through the kit's `askClaude`: a toast
 * at once, the same task (`key`) only once until Claude answered that prompt. A producer (`text` as a function) runs
 * only after the lock is taken, so a second press never runs it twice.
 */
export async function submitForPerson(
  $: EngineInterface,
  opts: AskOptions,
): Promise<AskResult> {
  // No module-wide "submitting" flag: $.prompt.submit stays pending while the prompt waits in the queue, and a flag
  // held that long dropped every line the person typed meanwhile (Runde 3: „passt“, a message sent mid-turn). The
  // plugin's own prompt arrives with origin `plugin`, which isPersonsPrompt never takes.
  return await askClaude($, opts);
}

/**
 * A pane button that asks Claude (kit `askAction`): „✓ An Claude geschickt“ while the task waits for its answer (a
 * press only toasts), else as given; `confirm` asks first (never while locked). `fresh`: once answered the button is
 * back to its own label (a new batch, e.g. newly judged items), not „Nochmal schicken“.
 */
export function personAsk(
  $: EngineInterface,
  k: Kit,
  a: Parameters<typeof askAction>[2],
  opts: { confirm?: string; fresh?: boolean } = {},
): Action {
  const locked = isAsked(k.asked, a.key);
  const base = askAction($, k, a);
  const shown =
    !locked && opts.fresh
      ? {
          ...base,
          label: a.label,
          icon: a.icon ?? base.icon,
          variant: a.variant ?? base.variant,
        }
      : base;
  return {
    ...shown,
    onPress: () =>
      void submitForPerson($, { text: a.text, key: a.key, toast: a.toast }),
    ...(opts.confirm && !locked ? { confirm: opts.confirm } : {}),
  };
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
      `✗ Discord: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
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
        "⚠ Claude hat ohne Zuhörer geantwortet: die Spieler werden gerade nicht gehört. Claude wird beim nächsten Zug daran erinnert.",
      );
    return true;
  }
  if (s.watcher.state === "running") return false;
  await patchEvening($, () => ({ remindPending: true, remindListener: false }));
  if (!s.remindPending)
    $.ui.toast(
      "⚠ Niemand hört gerade auf die Spieler: ihre Züge kommen nicht an. Claude wird beim nächsten Zug daran erinnert.",
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
          ? "Der Zuhörer ist abgebrochen"
          : "Der Zuhörer kam mit einer unlesbaren Antwort zurück",
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
        ? "Zuhörer an: die Spieler sprechen einfach los, ohne Sprechknopf; Claude meldet sich, wenn ein Zug es braucht."
        : "Zuhörer aus: die Spieler nutzen wieder die Sprechknöpfe unter der Nachricht des Bots.",
    );
  } catch (err) {
    $.ui.toast(
      `✗ Zuhörer nicht umgeschaltet: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    );
  }
}

// --- interjections -------------------------------------------------------------------------------------------------

/** Where the debrief goes: the plugin data folder when the engine exports it, else `$TMPDIR/dnd-studio/<session>` ($.fs.write makes the folders). */
async function dataDir($: EngineInterface): Promise<string> {
  const data = await $.env.get("CLAUDE_PLUGIN_DATA").catch(() => undefined);
  if (data) return data;
  const id = await $.session.id().catch(() => "session");
  const tmp = await $.env.get("TMPDIR").catch(() => undefined);
  const temp = tmp ? undefined : await $.env.get("TEMP").catch(() => undefined);
  const base = (tmp || temp || "/tmp").replace(/[\\/]+$/, "");
  return `${base}/dnd-studio/${id.replace(/[^\w.-]/g, "_")}`;
}

/** Keeps a line the person typed at the live table, and writes the debrief file in the plugin's data folder. */
export async function recordInterjection(
  $: EngineInterface,
  text: string,
): Promise<Interjection | undefined> {
  // only what the person typed: the app's <system-reminder> blocks (session ids) and the like never land here
  const clean = personsText(sanitize(text));
  if (!clean) return undefined;
  const now = await $.clock.now();
  const note: Interjection = { at: now, text: clean.slice(0, 600) };
  // the first interjection of an evening starts its own debrief file (the last evening's stays where it is)
  const s = await patchEvening($, (e) => ({
    notes: [...e.notes, note].slice(-200),
    notesFile: e.notes.length ? e.notesFile : "",
  }));
  try {
    let file = s.notesFile;
    const title =
      (await campaignName($)) ||
      (await readTable($))?.scene?.title ||
      "evening";
    if (!file) {
      const dir = await dataDir($);
      if (!dir) return note;
      file = `${dir.replace(/[\\/]+$/, "")}/debrief-${slug(title)}-${localDay(now)}.md`;
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

/**
 * Interjections belong to one evening. Once the table is read as no longer live (the evening ended: in Claude, in the
 * Studio, by a profile switch there), the list is emptied: its lines are in the debrief file, which stays named in
 * the card until the next evening's first interjection. Checked on the person's next prompt and each main turn, so a
 * new table never shows the last evening's lines. A table never read yet (null) ends nothing.
 */
export async function endInterjections($: EngineInterface): Promise<boolean> {
  const s = await readEvening($);
  if (!s.notes.length) return false;
  const view = await readTable($);
  if (!view || isLive(view, await readInitiative($))) return false;
  await patchEvening($, () => ({ notes: [] }));
  return true;
}

/**
 * Only what the person typed: the composer (or a remote bridge), no slash command, no meta or task notification. A
 * plugin's own prompt (a pane button) comes as origin `plugin` and is left out by its origin alone, also while the
 * person types in the meantime or into a running turn.
 */
export function isPersonsPrompt(e: {
  text?: string;
  isMeta?: boolean;
  command?: unknown;
  origin?: { kind?: string };
}): boolean {
  if (e.isMeta || e.command) return false;
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
      if (!e.agentId) {
        await noteMainTurnStart($);
        await endInterjections($);
      }
    } catch {
      // timing never delays a turn
    }
    const r = await next(e);
    try {
      // kit „ask Claude“: the turn carrying a sent prompt binds it (only that turn's end answers it)
      await askTurnStart($, e);
    } catch {
      // the lock falls back to its timeout
    }
    return r;
  });

  // Another Studio profile is another evening: its interjections and debrief file are not this one's.
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__profile" },
    async ($, e, next) => {
      const r = await next(e);
      try {
        if ((e as unknown as Obj).action === "use" && !("deny" in r) && !r.isError)
          await clearInterjections($);
      } catch {
        // the list is never worth a lost answer
      }
      return r;
    },
  );

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
        await endInterjections($);
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

/** The band's words for stale tool schemas (the model's notes keep STALE_TEXT). */
export const BAND_STALE = "Studio aktualisiert – Claude neu starten";

/** The band's evening parts: watcher state and the stale-schema warning. */
export function bandEvening(
  s: EveningState,
  listenerMode = false,
): {
  watch: string;
  watching: boolean;
  stale: string;
} {
  const stale = s.stale ? BAND_STALE : "";
  if (listenerMode) {
    const l = s.listener;
    const skipped = l.returned && !l.woke ? l.between.length : 0;
    if (l.running.length > 1)
      return {
        watching: false,
        watch: `${l.running.length} Zuhörer laufen (einer reicht)`,
        stale,
      };
    if (l.running.length)
      return {
        watching: true,
        watch: `Zuhörer wartet · ${skipped} übersprungen`,
        stale,
      };
    // Woken is the normal hand-over, not a warning: the GM is answering now (the band turns back from orange).
    return {
      watching: Boolean(l.returned && l.woke),
      watch:
        l.returned && l.woke
          ? `Zuhörer hat geweckt: ${l.why || "ein Zug"}`
          : "kein Zuhörer",
      stale,
    };
  }
  return {
    watching: s.watcher.state === "running",
    watch: s.watcher.state === "running" ? "Spieler werden gehört" : "Spieler ungehört",
    stale,
  };
}

/**
 * The Zuhörer card of the Table tab, the one place the listener's state stands: the switch (key `listener`), then
 * what the listener does right now, its last wake and turn, and what the group discussed without the GM.
 */
export function renderListener(
  $: EngineInterface,
  k: Kit,
  d: { evening: EveningState; view: TableView | null; rules: Rules },
): RenderElement {
  const on = isListenerMode(d.view);
  const l: ListenerState = d.evening.listener ?? EMPTY_LISTENER;
  const n = l.running.length;
  const rows: (RenderElement | null)[] = [
    Toggle(k, {
      key: "listener",
      label: "Offenes Mikro",
      on,
      onToggle: (next) => void setListener($, next ? "haiku" : "off"),
    }),
  ];
  // The switch says on/off; this row only says what the switch cannot: whether a listener really runs. A listener
  // that woke the GM is the normal hand-over (the GM answers now), not a warning.
  const woke = l.returned && l.woke;
  const skipped = l.returned && !l.woke ? l.between.length : 0;
  if (n || on)
    rows.push(
      ListRow(k, {
        key: "ls-state",
        status: n === 1 ? "running" : !n && woke ? "ok" : "warning",
        title:
          n > 1
            ? `${n} Zuhörer laufen`
            : n
              ? "Wartet auf die Spieler"
              : woke
                ? "Spielleitung ist dran"
                : "Kein Zuhörer läuft",
        meta:
          n > 1
            ? "einer reicht"
            : n && skipped
              ? `${skipped} übersprungen`
              : "",
      }),
    );
  if (l.returned)
    rows.push(
      ListRow(k, {
        key: "ls-back",
        icon: "clock",
        title: "Zuletzt zurück",
        meta: [l.why, l.sent ? "gesendet" : ""].filter(Boolean).join(" · "),
        pill: l.woke
          ? { text: "geweckt", tone: "ok" }
          : { text: "nicht geweckt", tone: "neutral", glyph: false },
      }),
    );
  if (l.turn.length) {
    const hide = l.secret && d.rules.spoilerSafe;
    rows.push(
      ListRow(k, {
        key: "ls-turn",
        icon: "chat",
        title: "Letzter Zug",
        meta: hide ? "geheim, verborgen" : "",
        under: hide
          ? undefined
          : l.turn.slice(-6).map((t) => Sentence(k, t, { faint: true })),
      }),
    );
  }
  if (l.between.length)
    rows.push(
      ListRow(k, {
        key: "ls-between",
        icon: "chat",
        title: "Ohne Spielleitung besprochen",
        meta: String(l.between.length),
        details: () =>
          l.between.slice(-8).map((b) => Sentence(k, b, { faint: true })),
      }),
    );
  return Card(k, {
    key: "listener-card",
    title: { icon: "mic", title: "Zuhörer" },
    children: rows,
    hint: "Mit offenem Mikro sprechen die Spieler ohne Sprechknopf; Claude meldet sich, wenn ein Zug die Spielleitung braucht.",
    status: l.error ? { text: l.error, tone: "bad" } : undefined,
  });
}

/** The Einwürfe card of the Table tab: what the person typed at the running table, kept for the debrief. */
export function renderInterjections(
  $: EngineInterface,
  k: Kit,
  s: EveningState,
): RenderElement {
  // older entries may still carry the app's attached blocks: shown (and counted) as the person typed them
  const notes = personsNotes(s.notes);
  const shown = notes.slice(-Math.max(3, Math.min(10, k.rows - 8)));
  // the file of last evening's notes: a text action in the one action row (R2), not a knob inside the content
  const notesFile = s.notesFile;
  const file: Action | null = notesFile
    ? {
        key: "notes-file",
        label: "Datei kopieren",
        variant: "link",
        onPress: ((e?: { surface?: string }) =>
          k.copy(notesFile, e?.surface)) as () => void,
      }
    : null;
  return Card(k, {
    key: "notes",
    title: { icon: "chat", title: "Einwürfe", count: notes.length },
    children: [
      ...(shown.length
        ? shown.map((n) =>
            Sentence(k, `${clockTime(n.at)} ${n.text}`, { faint: true }),
          )
        : [
            Sentence(k, "Am laufenden Tisch noch nichts getippt.", {
              faint: true,
            }),
          ]),
    ],
    hint: "Was du bei laufendem Tisch in den Chat tippst, steht hier für die Nachbesprechung.",
    actions: notes.length
      ? [
          {
            key: "notes-clear",
            label: "Liste leeren",
            icon: "trash",
            variant: "secondary",
            danger: true,
            confirm: "Einwürfe wirklich leeren?",
            confirmWord: "Leeren",
            onPress: () => void clearInterjections($),
          },
          ...(file ? [file] : []),
        ]
      : file
        ? [file]
        : [],
  });
}

/** The Discord card of the Table tab: players, rooms, last whisper, warnings; buttons only on press. */
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
  // One hint per card (R7), the most urgent: what the people at the table have to do, never a sentence per row.
  let hint = "";
  if (info) {
    if (info.connected && info.channel)
      children.push(
        ListRow(k, {
          key: "d-channel",
          icon: "mic",
          title: "Sprachkanal",
          meta: info.channel,
        }),
      );
    const mappedChars = new Set(
      info.members.map((m) => m.character).filter(Boolean),
    );
    for (const m of info.members)
      children.push(
        ListRow(k, {
          key: `dm-${m.name}`,
          status: m.character ? "ok" : "warning",
          title: m.character || m.name,
          meta: m.character ? m.name : "",
          pill: m.character
            ? undefined
            : { text: "nicht zugeordnet", tone: "warn" },
        }),
      );
    let unmapped = info.members.some((m) => !m.character);
    if (info.connected)
      for (const h of view?.party ?? [])
        if (!h.foe && !mappedChars.has(h.name)) {
          unmapped = true;
          children.push(
            ListRow(k, {
              key: `dh-${h.name}`,
              status: "warning",
              title: h.name,
              pill: { text: "kein Spieler", tone: "warn" },
            }),
          );
        }
    for (const r of info.rooms)
      children.push(
        ListRow(k, {
          key: `dr-${r.name}`,
          icon: r.bot ? "speaker" : "dots",
          tone: r.bot ? "ok" : undefined,
          title: r.name,
          meta: r.members.join(", ") || "leer",
        }),
      );
    if (info.missing.length)
      children.push(
        ListRow(k, {
          key: "d-missing",
          status: "warning",
          title: "Einrichtung fehlt",
          meta: info.missing.join(", "),
        }),
      );
    if (info.streamEnded.length)
      children.push(
        ListRow(k, {
          key: "d-stream",
          status: "failed",
          title: "Bildschirmfreigabe beendet",
          meta: info.streamEnded.join(", "),
        }),
      );
    if (info.unheard.length)
      children.push(
        ListRow(k, {
          key: "d-unheard",
          status: "warning",
          title: "Hört den Bot evtl. nicht",
          meta: info.unheard.join(", "),
        }),
      );
    if (info.warning && !info.streamEnded.length && !info.unheard.length)
      children.push(
        ListRow(k, {
          key: "d-warn",
          status: "warning",
          title: info.warning,
          wrap: true,
        }),
      );
    hint = info.streamEnded.length
      ? "Wer die Freigabe beendet hat, teilt das Spielerfenster neu."
      : info.unheard.length
        ? "Wer den Bot nicht hört, betritt den Raum neu."
        : unmapped
          ? "Spieler ordnen sich im Discord mit /ich-bin einem Helden zu."
          : "";
  }
  const w = evening.whisper;
  if (w)
    children.push(
      ListRow(k, {
        key: "d-whisper",
        status: w.delivered ? "ok" : "failed",
        title: `Letztes Flüstern an ${w.to || "?"}`,
        meta: w.delivered ? "" : w.reason || "fehlgeschlagen",
        pill: w.delivered
          ? { text: "zugestellt", tone: "ok" }
          : { text: "nicht zugestellt", tone: "bad" },
        details:
          !w.delivered && w.why
            ? [Sentence(k, truncate(w.why, 200), { faint: true })]
            : undefined,
      }),
    );
  const actions: Action[] = [];
  // Without a voice channel joining is what the card is for; the header's „Neu laden“ re-reads the bot.
  if (!info?.connected)
    actions.push({
      key: "discord-join",
      label: "Beitreten",
      icon: "plug",
      variant: "primary",
      onPress: () =>
        void discordAction($, "Bot ist im Sprachkanal", { action: "join" }),
    });
  else if (info.rooms.length > 1)
    actions.push({
      key: "discord-merge",
      label: "Räume zusammenlegen",
      icon: "link",
      variant: "secondary",
      confirm: "Räume wirklich zusammenlegen?",
      confirmWord: "Zusammenlegen",
      onPress: () =>
        void discordAction($, "Gruppe wieder zusammen", { action: "merge" }),
    });
  if (atTable)
    actions.push({
      key: "discord-leave",
      label: "Verlassen",
      icon: "power",
      variant: "secondary",
      danger: true,
      confirm: "Discord wirklich verlassen?",
      onPress: () =>
        void discordAction($, "Bot hat Discord verlassen", {
          action: "leave",
        }),
    });
  // Only a failed read gets its own retry: the header's „Neu laden“ asks the bot only while it is at the table.
  if (info?.error)
    actions.push({
      key: "discord-status",
      label: k.s.retry,
      variant: "link",
      onPress: () => void refreshDiscord($),
    });
  return Fold(k, {
    key: "discord",
    icon: "chat",
    title: "Discord",
    pill: info
      ? info.connected
        ? {
            text: `${info.members.length} Spieler`,
            tone: "ok",
            glyph: false,
          }
        : { text: "nicht verbunden", tone: "neutral", glyph: false }
      : undefined,
    defaultOpen: atTable,
    actions,
    hint,
    status: info?.error
      ? { text: `Discord antwortet nicht: ${info.error}`, tone: "bad" }
      : undefined,
    empty: atTable ? "Der Bot ist am Tisch." : "Der Bot ist nicht am Tisch.",
    children,
  });
}
