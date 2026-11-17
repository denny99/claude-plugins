/**
 * The evening around the table: the watcher (`wait_for_players watch` run as a background Bash), the person's
 * interjections for the debrief, the Discord section, and the Studio version (stale MCP schemas after an app update).
 * Everything here only reads, notes and reminds; nothing acts on the table by itself.
 */
import type { EngineInterface, On, RenderElement } from "claude-code";

import {
  debriefText,
  discordOf,
  isLive,
  isWatchCommand,
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
  readTable,
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
import type { EveningState, Interjection, Rules, TableView } from "../types";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};

export const STALE_TEXT = "MCP schemas stale — restart Claude";
export const NO_WATCHER_NOTE =
  "Your last turn ended at a live table without a running watcher: the players' turns go unnoticed. Call wait_for_players with watch: true and run its command with Bash run_in_background before you end a turn.";

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

/** A finished Bash call: a watch URL started in the background is the watcher. */
export async function noteBash(
  $: EngineInterface,
  input: Obj,
  result: Obj,
): Promise<void> {
  const command = String(input.command ?? "");
  if (!isWatchCommand(command)) return;
  const now = await $.clock.now();
  const out = obj(result.result ?? result);
  const id = String(out.backgroundTaskId ?? result.backgroundTaskId ?? "");
  const background = input.run_in_background === true || !!id;
  await patchEvening($, () => ({
    watcher: background
      ? { state: "running", taskId: id, startedAt: now, endedAt: 0 }
      : { state: "ended", taskId: id, startedAt: now, endedAt: now },
    remindPending: false,
  }));
}

/** A task notification naming the watcher's task: the watch has ended (the players have something, or it timed out). */
export async function noteTaskNotification(
  $: EngineInterface,
  text: string,
): Promise<boolean> {
  const s = await readEvening($);
  if (s.watcher.state !== "running") return false;
  const hit = s.watcher.taskId
    ? text.includes(s.watcher.taskId)
    : /\/watch\//.test(text);
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
  if (s.watcher.state === "running") return false;
  await patchEvening($, () => ({ remindPending: true }));
  if (!s.remindPending)
    $.ui.toast(
      "⚠ Turn ended without a watcher: players' turns go unnoticed (wait_for_players watch).",
    );
  return true;
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

/** A failing watcher hands the Bash call through unchanged. */
export function passBash(
  _: unknown,
  e: unknown,
  next: (e: never) => unknown,
): never {
  return next(e as never) as never;
}

export function registerEvening(on: On): void {
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const r = await next(e);
    try {
      const input = obj((e as unknown as Obj).input ?? e);
      if (isWatchCommand(String(input.command ?? "")))
        await noteBash($, input, obj(r));
    } catch {
      // watching never blocks a call
    }
    return r;
  }).catch(passBash);

  on("prompt.submit", async ($, e, next) => {
    let context: string[] = [];
    try {
      if (
        e.origin?.kind === "task-notification" ||
        /<task-notification>/.test(e.text)
      )
        await noteTaskNotification($, e.text);
      else if (isPersonsPrompt(e)) {
        const s = await readEvening($);
        if (s.remindPending) {
          context = [NO_WATCHER_NOTE];
          await patchEvening($, () => ({ remindPending: false }));
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
export function bandEvening(s: EveningState): {
  watch: string;
  watching: boolean;
  stale: string;
} {
  return {
    watching: s.watcher.state === "running",
    watch: s.watcher.state === "running" ? "watching" : "no watcher",
    stale: s.stale ? STALE_TEXT : "",
  };
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
