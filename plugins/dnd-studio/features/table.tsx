/**
 * GM mode (pnp-spielleiter): the Table tab, the band above the prompt, the notes added to the model's own table calls,
 * and the two hard guards (handout/secret leaks, talk_npc at a live table). The table must never stall: everything
 * else only annotates.
 */
import type { EngineInterface, On, RenderElement } from "claude-code";

import {
  bandEvening,
  noteDiscord,
  noteStale,
  noteStudioStatus,
  renderDiscord,
  renderInterjections,
  STALE_TEXT,
} from "./evening";
import { applyLook } from "./look";
import { jsonOf, studioCall, textOf } from "../lib/studio";
import {
  advance,
  bandParts,
  currentTurn,
  isLive,
  looksPrivate,
  parseOrder,
  toTableView,
} from "../lib/model";
import {
  patchInitiative,
  patchLive,
  readInitiative,
  readEvening,
  readLive,
  readRules,
  readTable,
  setTable,
} from "../lib/state";
import {
  Actions,
  EmptyState,
  ErrorState,
  Line,
  Row,
  Section,
  truncate,
} from "../lib/ui";
import type { Action, Kit } from "../lib/ui";
import type {
  EveningState,
  Initiative,
  Rules,
  TableLive,
  TableView,
} from "../types";

type Obj = Record<string, unknown>;

/** The campaign's npcs and scenes, kept between table refreshes (only a person's Refresh reads them again). */
let campaignCache: Obj | undefined;

const SILENCE_WARN_S = 12;

/** Reads table_state (and, first time or on demand, the campaign's NPCs and scenes) into the Table view. */
export async function refreshTable(
  $: EngineInterface,
  withCampaign = true,
): Promise<void> {
  const now = await $.clock.now();
  try {
    const state = await studioCall($, "table_state", { log: 40 });
    if (withCampaign || !campaignCache) {
      try {
        campaignCache = await studioCall($, "campaign", {
          only: ["npcs", "scenes"],
        });
      } catch {
        campaignCache = campaignCache ?? {};
      }
    }
    await setTable($, toTableView(state, campaignCache ?? {}, now));
    await applyLook($);
  } catch (err) {
    const prev = await readTable($);
    await setTable($, {
      ...(prev ?? toTableView({}, {}, now)),
      fetchedAt: now,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** One write to the table on a person's press; toasts the outcome and re-reads the table. */
export async function tableAction(
  $: EngineInterface,
  done: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<void> {
  try {
    await studioCall($, tool, args);
    $.ui.toast(done);
  } catch (err) {
    $.ui.toast(
      `✗ ${tool}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    );
  }
  await refreshTable($, false);
}

/** Starts a fight with this order (round 1, first in line). */
export async function startInitiative(
  $: EngineInterface,
  order: string[],
): Promise<Initiative> {
  const out = await patchInitiative($, () => ({
    order,
    index: 0,
    round: 1,
    isActive: order.length > 0,
  }));
  await applyLook($);
  return out;
}

/** Next turn; the spotlight follows when it is a hero of the party (foes clear it). */
export async function nextTurn(
  $: EngineInterface,
  callStudio = true,
): Promise<Initiative> {
  const ini = await patchInitiative($, (i) => (i.isActive ? advance(i) : i));
  const who = currentTurn(ini);
  if (callStudio && who) {
    const view = await readTable($);
    const hero = view?.party.find((h) => h.name === who && !h.foe);
    await tableAction($, `${who}'s turn`, "spotlight", {
      who: hero ? who : "",
    });
  }
  return ini;
}

export async function endInitiative($: EngineInterface): Promise<void> {
  await endInitiativeState($);
  await applyLook($);
}

async function endInitiativeState($: EngineInterface): Promise<void> {
  await patchInitiative($, () => ({
    order: [],
    index: 0,
    round: 0,
    isActive: false,
  }));
}

/** A short text of the GM screen for the model and /dnd-scene. */
export async function tableSummary($: EngineInterface): Promise<string> {
  const view = await readTable($);
  const ini = await readInitiative($);
  if (!view) return "No table read yet: /dnd refreshes it.";
  const lines = [
    `Scene: ${view.scene?.title ?? "—"}${view.paused ? " (paused)" : ""}`,
    `Players' window: ${view.playersWindow ? "open" : "closed"} · Discord: ${view.discord ? "at the table" : "no"}`,
  ];
  if (ini.isActive)
    lines.push(
      `Initiative round ${ini.round}: ${ini.order.map((n, i) => (i === ini.index ? `▶${n}` : n)).join(", ")}`,
    );
  if (view.party.length)
    lines.push(
      `Party: ${view.party.map((h) => `${h.name}${h.values ? ` (${h.values})` : ""}${h.conditions.length ? ` [${h.conditions.join(", ")}]` : ""}`).join("; ")}`,
    );
  if (view.error) lines.push(`Last read failed: ${view.error}`);
  return lines.join("\n");
}

// --- watching the model's own table calls -------------------------------------------------------------------------

function inputOf(e: unknown): Obj {
  const o = (e ?? {}) as Obj;
  return o.input && typeof o.input === "object" ? (o.input as Obj) : o;
}

const PREFIX = "mcp__plugin_dnd-studio_dnd-studio__";

/** What a finished model call teaches the mod, and the notes for the model (empty: nothing to say). */
export async function observe(
  $: EngineInterface,
  tool: string,
  input: Obj,
  text: string,
): Promise<string[]> {
  const now = await $.clock.now();
  const json = jsonOf(text) ?? {};
  const notes: string[] = [];
  const live = await readLive($);
  const view = await readTable($);
  const tableLive = isLive(view, await readInitiative($));
  const touch = (who: unknown): Partial<TableLive> =>
    typeof who === "string" && who
      ? { addressed: { ...live.addressed, [who]: now } }
      : {};

  switch (tool) {
    case "wait_for_players": {
      const lines = (
        Array.isArray(json.lines)
          ? json.lines
          : Array.isArray(json.turn)
            ? json.turn
            : []
      ) as Obj[];
      if (!lines.length) break;
      const addressed = { ...live.addressed };
      for (const l of lines)
        if (typeof l.who === "string") addressed[l.who] = now;
      const secret = lines.find((l) => l.secret === true);
      await patchLive($, () => ({
        turnAt: now,
        addressed,
        secretPending: secret
          ? String(secret.who ?? "a player")
          : live.secretPending,
      }));
      // Wake the band once the silence passes the warning mark.
      $.clock.after(
        (SILENCE_WARN_S + 1) * 1000,
        () => void patchLive($, (l) => ({ tick: l.tick + 1 })),
      );
      if (secret)
        notes.push(
          `**Secret turn from ${String(secret.who ?? "a player")}**: answer by discord whisper or aside only, never aloud or on the players' window.`,
        );
      break;
    }
    case "say_line": {
      await patchLive($, () => ({ saidAt: now, ...touch(input.from) }));
      if (json.interrupted === true || json.held === true || json.unheard) {
        const unheard = typeof json.unheard === "string" ? json.unheard : "";
        notes.push(
          `**The players cut in** — answer them first; deliver later what they did not hear${unheard ? `: "${truncate(unheard, 160)}"` : ""}.`,
        );
        await patchLive($, () => ({
          warning: "players cut in: deliver the rest later",
        }));
      }
      if (json.sounds_not_played || json.sound_note)
        notes.push(
          `**Sound not played**: ${String(json.sound_note ?? "a bound sound was left out")} — start it with play_sound when it fits (the /dnd pane has the scene's buttons).`,
        );
      if (
        input.sound &&
        !input.sound_at &&
        !input.sound_after &&
        String(input.text ?? "").length > 80
      )
        notes.push(
          "The sound starts with the first word: give sound_at when the line names it later.",
        );
      if (live.secretPending && input.table !== false)
        notes.push(
          `${live.secretPending} told you a secret: keep its content out of lines the whole table hears.`,
        );
      break;
    }
    case "show_players": {
      if (input.map && !(Array.isArray(input.markers) && input.markers.length))
        notes.push(
          "A map without markers: nobody knows where they are — add markers for the heroes (and what they see).",
        );
      if (input.clear !== true && (input.title || input.picture))
        notes.push(
          "New scene shown: start pnp-pruefer and pnp-chronist in the background (never wait for them), pnp-vorbereiter on a deviation; read the canon before you go on.",
        );
      if (live.secretPending)
        notes.push(
          `${live.secretPending}'s secret stays off the players' window.`,
        );
      break;
    }
    case "roll_dice":
      await patchLive($, () => touch(input.who));
      if (input.whisper) await noteDiscord($, tool, input, json);
      break;
    case "spotlight":
      await patchLive($, () => touch(input.who));
      break;
    case "discord": {
      const problem = /not_mapped|dms_closed|not_set_up|stream_ended/.exec(
        text,
      )?.[0];
      if (problem) {
        notes.push(
          `**Discord: ${problem}** — the player did not get it; say it at the table another way or fix the mapping.`,
        );
        await patchLive($, () => ({ warning: `discord ${problem}` }));
      }
      await noteDiscord($, tool, input, json);
      if (input.action === "whisper" && json.delivered === false)
        notes.push(
          `**Whisper not delivered** (${String(json.reason ?? "failed")}): ${String(json.why ?? "")} — the secret is still pending.`,
        );
      else if (input.action === "whisper" || input.action === "aside")
        await patchLive($, () => ({ secretPending: "" }));
      if (Array.isArray(json.stream_ended) && json.stream_ended.length)
        notes.push(
          `**Screen share ended** for ${json.stream_ended.map(String).join(", ")}: ask them to share the players' window again.`,
        );
      if (input.action === "leave" && view?.speaker)
        notes.push("A line was still playing when the bot left.");
      break;
    }
    case "set_campaign_entry": {
      const names = [
        input.name,
        ...(Array.isArray(input.entries)
          ? input.entries.map((x) => (x as Obj).name)
          : []),
      ].filter((n): n is string => typeof n === "string" && !!n);
      const recent = [...live.recentEntries, ...names].slice(-8);
      await patchLive($, () => ({ recentEntries: recent }));
      if (names.some((n) => recent.filter((r) => r === n).length > 2))
        notes.push(
          "Several writes to the same entry: make one write per entry (or one call with entries).",
        );
      if (Array.isArray(input.sounds))
        notes.push(
          "sounds replaces the whole list of that entry: give every sound it keeps.",
        );
      break;
    }
    case "paint_campaign":
    case "write_session":
      if (/working/i.test(text))
        notes.push(
          `${tool} is still working: call the same again for the result.`,
        );
      if (tool === "paint_campaign")
        notes.push(
          "paint_campaign replaces an approved picture where the entry had one.",
        );
      break;
    case "make_sound":
      if (tableLive)
        notes.push(
          "make_sound takes GPU time while the table waits: at a live table prefer the prepared, bound sounds.",
        );
      break;
    case "studio_status": {
      const p = json.profile;
      const profile =
        typeof p === "string"
          ? p
          : p && typeof p === "object"
            ? String((p as Obj).name ?? "")
            : "";
      if (profile) await patchLive($, () => ({ profile }));
      await noteStudioStatus($, json);
      if ((await readEvening($)).stale)
        notes.push(
          `**${STALE_TEXT}**: the Studio changed since this session started; its tools may take other arguments now.`,
        );
      break;
    }
    case "prepare_table":
      if (typeof json.total === "number")
        await patchLive($, () => ({
          prepared: `${String(json.made ?? json.done ?? "?")}/${String(json.total)}${json.failed ? `, ${Array.isArray(json.failed) ? json.failed.length : String(json.failed)} failed` : ""}`,
        }));
      break;
    case "table_state":
      if (Object.keys(json).length) {
        await setTable($, toTableView(json, campaignCache ?? {}, now));
        await applyLook($);
      }
      break;
  }
  // Writes to the table: re-read it so the screen follows (one cheap read, no campaign).
  if (
    [
      "show_players",
      "roll_dice",
      "spotlight",
      "set_status",
      "play_sound",
      "give_find",
      "set_pause",
    ].includes(tool)
  )
    $.clock.after(0, () => void refreshTable($, false));
  return notes;
}

/** The body of every watching `tool.call` hook. */
export async function watch(
  $: EngineInterface,
  e: unknown,
  next: (e: never) => Promise<unknown>,
  tool: string,
): Promise<never> {
  const r = (await next(e as never)) as Obj;
  try {
    if (r.deny) return r as never;
    const text = textOf(r.result ?? r);
    const notes = await observe($, tool, inputOf(e), text);
    if (await noteStale($, text))
      notes.push(
        `**${STALE_TEXT}**: the Studio refused arguments Claude's tool list offered (the app was updated). Ask the person to restart Claude Code; until then use only what the error says the tool takes.`,
      );
    const rules = await readRules($);
    if (notes.length && rules.annotate) {
      const context = Array.isArray(r.context) ? (r.context as string[]) : [];
      return { ...r, context: [...context, ...notes] } as never;
    }
  } catch {
    // never stall the table over a note
  }
  return r as never;
}

/** The body of the guarding `tool.check` hooks: the only hard denies of the plugin. */
export async function guard(
  $: EngineInterface,
  e: unknown,
  next: (e: never) => Promise<unknown>,
  tool: string,
): Promise<never> {
  try {
    const rules = await readRules($);
    const input = inputOf((e as Obj).input ?? {});
    if ((tool === "show_players" || tool === "give_find") && rules.denyLeaks) {
      const forWhom = looksPrivate(input);
      if (forWhom)
        return {
          decision: "deny",
          reason: `This looks like a handout or secret for ${forWhom}: deliver it privately (discord whisper with handout/sheet), not on the shared window. The rule can be turned off in /dnd → Health → Rules.`,
        } as never;
    }
    if (
      tool === "talk_npc" &&
      rules.denyTalkNpc &&
      isLive(await readTable($), await readInitiative($))
    )
      return {
        decision: "deny",
        reason:
          "The table is live: speak the NPC yourself with say_line (voice = the NPC); talk_npc is for preparation. Rule toggle: /dnd → Health → Rules.",
      } as never;
    if (rules.denyFamily && /meine familie/i.test((await readLive($)).profile))
      return {
        decision: "deny",
        reason:
          'The open Studio profile is "Meine Familie", which is never changed: switch the profile first.',
      } as never;
  } catch {
    // a failing guard lets the call through
  }
  return next(e as never) as never;
}

/** A watcher that fails hands the call through unchanged: a note is never worth a stalled table. */
export function passThrough(
  _: unknown,
  e: unknown,
  next: (e: never) => unknown,
): never {
  return next(e as never) as never;
}

export function denyOnFailure(): { decision: "deny"; reason: string } {
  return { decision: "deny", reason: "dnd-studio guard failed." };
}

export function registerTable(on: On): void {
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__wait_for_players" },
    ($, e, next) => watch($, e, next, "wait_for_players"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__say_line" },
    ($, e, next) => watch($, e, next, "say_line"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__show_players" },
    ($, e, next) => watch($, e, next, "show_players"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__roll_dice" },
    ($, e, next) => watch($, e, next, "roll_dice"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__spotlight" },
    ($, e, next) => watch($, e, next, "spotlight"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__set_status" },
    ($, e, next) => watch($, e, next, "set_status"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__play_sound" },
    ($, e, next) => watch($, e, next, "play_sound"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__give_find" },
    ($, e, next) => watch($, e, next, "give_find"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__set_pause" },
    ($, e, next) => watch($, e, next, "set_pause"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__discord" },
    ($, e, next) => watch($, e, next, "discord"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__table_state" },
    ($, e, next) => watch($, e, next, "table_state"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__set_campaign_entry" },
    ($, e, next) => watch($, e, next, "set_campaign_entry"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__paint_campaign" },
    ($, e, next) => watch($, e, next, "paint_campaign"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__write_session" },
    ($, e, next) => watch($, e, next, "write_session"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__make_sound" },
    ($, e, next) => watch($, e, next, "make_sound"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__studio_status" },
    ($, e, next) => watch($, e, next, "studio_status"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__prepare_table" },
    ($, e, next) => watch($, e, next, "prepare_table"),
  ).catch(passThrough);

  on(
    "tool.check",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__show_players" },
    ($, e, next) => guard($, e, next, "show_players"),
  ).catch(denyOnFailure);
  on(
    "tool.check",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__give_find" },
    ($, e, next) => guard($, e, next, "give_find"),
  ).catch(denyOnFailure);
  on(
    "tool.check",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__talk_npc" },
    ($, e, next) => guard($, e, next, "talk_npc"),
  ).catch(denyOnFailure);
  on(
    "tool.check",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__set_campaign_entry" },
    ($, e, next) => guard($, e, next, "set_campaign_entry"),
  ).catch(denyOnFailure);
  on(
    "tool.check",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__set_campaign" },
    ($, e, next) => guard($, e, next, "set_campaign"),
  ).catch(denyOnFailure);
  on(
    "tool.check",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__paint_campaign" },
    ($, e, next) => guard($, e, next, "paint_campaign"),
  ).catch(denyOnFailure);

  // The band above the prompt: scene · round · whose turn · silence; nothing outside a live table.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const view = await readTable($);
    const ini = await readInitiative($);
    if (e.props.hasSurvey || !isLive(view, ini)) return next(e);
    const live = await readLive($);
    const now = await $.clock.now();
    const band = bandParts(view, ini, live, now);
    const ev = bandEvening(await readEvening($));
    const { Box, Text } = $.ui.resolve(e);
    const width = Math.max(20, e.props.bodyColumns ?? 80);
    return (
      <Box flexDirection="row" gap={1}>
        <Text>{truncate(`⚔ ${band.text}`, Math.floor(width * 0.6))}</Text>
        {band.silence > SILENCE_WARN_S ? (
          <Text color="yellow">{`· ${band.silence}s silent — filler?`}</Text>
        ) : null}
        <Text color={ev.watching ? "green" : "yellow"}>{`· ${ev.watch}`}</Text>
        {ev.stale ? <Text color="red">{`· ${ev.stale}`}</Text> : null}
        {band.warning ? (
          <Text color="red">
            {truncate(`· ${band.warning}`, Math.floor(width * 0.3))}
          </Text>
        ) : null}
      </Box>
    );
  });
}

// --- the Table tab ------------------------------------------------------------------------------------------------

type InputEl = (props: Record<string, unknown>) => RenderElement;

function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60
    ? `${s}s`
    : s < 3600
      ? `${Math.round(s / 60)}m`
      : `${Math.round(s / 3600)}h`;
}

export function renderTable(
  $: EngineInterface,
  k: Kit,
  Input: InputEl,
  d: {
    view: TableView | null;
    ini: Initiative;
    live: TableLive;
    rules: Rules;
    now: number;
    evening: EveningState;
  },
): RenderElement[] {
  const { view, ini, live, rules, now, evening } = d;
  const out: RenderElement[] = [];
  if (!view) {
    out.push(
      EmptyState(k, "No table read yet. Press Refresh (the app must run)."),
    );
    return out;
  }
  if (view.error)
    out.push(
      ErrorState(k, {
        key: "table-err",
        message: view.error,
        onRetry: () => void refreshTable($),
      }),
    );

  // Table status
  const status = [
    view.playersWindow ? "window ✓" : "window ✗",
    view.discord ? "discord ✓" : "",
    view.listening
      ? `listening${view.speaker ? ` · ${view.speaker} speaks` : ""}`
      : "",
    view.turnsWaiting ? `${view.turnsWaiting} turn(s) waiting` : "",
    view.paused ? "paused" : "",
  ].filter(Boolean);
  out.push(Line(k, status.join(" · "), { dim: true }));
  if (evening.stale) out.push(Line(k, `⚠ ${evening.stale}`, { color: "red" }));
  if (isLive(view, ini))
    out.push(
      Line(
        k,
        evening.watcher.state === "running"
          ? "● Watcher running (wait_for_players watch)"
          : "○ No watcher: players' turns go unnoticed",
        { color: evening.watcher.state === "running" ? "green" : "yellow" },
      ),
    );
  if (view.unheard)
    out.push(Line(k, `Unheard: ${view.unheard}`, { color: "yellow" }));

  // Scene card
  out.push(
    Section(k, {
      key: "scene",
      title: "Scene",
      count: view.scene?.title ?? "—",
      children: [
        view.scene?.place ? Line(k, view.scene.place, { dim: true }) : null,
        view.scene?.notes && !rules.spoilerSafe
          ? Line(k, view.scene.notes, { dim: true })
          : null,
        view.sounds.length
          ? Actions(
              k,
              "sounds",
              [
                ...view.sounds.map((s, i): Action => ({
                  key: `snd-${i}`,
                  label: `${s.loop ? "↻" : "♪"} ${truncate(s.name, 22)}`,
                  onPress: () =>
                    void tableAction($, `Playing ${s.name}`, "play_sound", {
                      sound: s.file,
                      loop: s.loop,
                      volume: s.volume,
                    }),
                })),
                {
                  key: "snd-stop",
                  label: "Stop ambience",
                  onPress: () =>
                    void tableAction($, "Ambience stopped", "play_sound", {
                      stop: true,
                    }),
                },
              ],
              3,
            )
          : null,
      ],
    }),
  );

  // Initiative
  out.push(
    Section(k, {
      key: "ini",
      title: "Initiative",
      count: ini.isActive ? `round ${ini.round}` : "",
      actions: ini.isActive
        ? [
            {
              key: "ini-next",
              label: "Next turn",
              primary: true,
              onPress: () => void nextTurn($),
            },
            {
              key: "ini-end",
              label: "End fight",
              confirm: "Really end?",
              onPress: () => void endInitiative($),
            },
          ]
        : view.party.length
          ? [
              {
                key: "ini-party",
                label: "Party order",
                onPress: () =>
                  void startInitiative(
                    $,
                    view.party.filter((h) => !h.foe).map((h) => h.name),
                  ),
              },
            ]
          : [],
      children: ini.isActive
        ? ini.order.map((n, i) =>
            Row(k, {
              key: `ini-${i}`,
              glyph: i === ini.index ? "▶" : " ",
              primary: n,
              dim: i !== ini.index,
            }),
          )
        : [
            Input({
              key: "ini-order",
              placeholder: "Order: Thorin, Wolf 1, Mara",
              submitLabel: "Start",
              onSubmit: (v: string) => void startInitiative($, parseOrder(v)),
            }),
          ],
    }),
  );

  // Party, with values, conditions and spotlight fairness
  const fair = live.turnAt > 0 || Object.keys(live.addressed).length > 0;
  out.push(
    Section(k, {
      key: "party",
      title: "Party",
      count: view.party.length,
      children: view.party.length
        ? view.party.map((h) =>
            Row(k, {
              key: `hero-${h.name}`,
              status: h.conditions.length ? "warning" : h.foe ? "idle" : "ok",
              primary: `${h.name}${h.foe ? " (foe)" : ""}${h.values ? ` · ${h.values}` : ""}`,
              secondary: [
                h.conditions.join(", "),
                fair && !h.foe
                  ? live.addressed[h.name]
                    ? `addressed ${ago(now - live.addressed[h.name]!)} ago`
                    : "not addressed yet"
                  : "",
              ]
                .filter(Boolean)
                .join(" · "),
            }),
          )
        : [EmptyState(k, "No party.")],
    }),
  );

  // NPCs: stock lines in their voice, picked by hand
  out.push(
    Section(k, {
      key: "npcs",
      title: "NPCs",
      count: view.npcs.length,
      collapsible: true,
      children: view.npcs.map((n) =>
        Row(k, {
          key: `npc-${n.name}`,
          primary: n.name,
          secondary: n.place,
          actions: n.stock.length
            ? n.stock.map((l, i): Action => ({
                key: `npc-${n.name}-${i}`,
                label: truncate(
                  `${l.kind}: ${l.text}${l.how ? ` (${l.how})` : ""}`,
                  34,
                ),
                onPress: () =>
                  void tableAction($, `${n.name}: ${l.text}`, "say_line", {
                    voice: n.name,
                    text: l.text,
                    ...(l.how ? { how: l.how } : {}),
                  }),
              }))
            : [
                {
                  key: `npc-${n.name}-greet`,
                  label: "Greet",
                  onPress: () =>
                    void tableAction($, `${n.name} greets`, "say_line", {
                      voice: n.name,
                      text: "",
                      opener: "greet",
                    }),
                },
              ],
        }),
      ),
    }),
  );

  // Dice and secrets
  const rolls = view.rolls.slice(-5);
  out.push(
    Section(k, {
      key: "dice",
      title: "Dice",
      count: view.rolls.length,
      collapsible: true,
      children: rolls.length
        ? rolls.map((r, i) =>
            Line(
              k,
              r.hidden && rules.spoilerSafe
                ? `${r.who}: hidden roll`
                : `${r.who}${r.label ? ` · ${r.label}` : ""}: ${r.total}${r.verdict ? ` · ${r.verdict}` : ""}${r.hidden ? " (hidden)" : ""}`,
              { dim: i < rolls.length - 1 },
            ),
          )
        : [EmptyState(k, "No rolls yet.")],
    }),
  );
  out.push(
    Section(k, {
      key: "secrets",
      title: "Secrets & whispers",
      count: view.secrets.length,
      collapsible: true,
      defaultOpen: false,
      children: rules.spoilerSafe
        ? [
            EmptyState(
              k,
              "Hidden (spoiler-safe). Turn it off under Health → Rules.",
            ),
          ]
        : view.secrets.slice(-5).map((s) => Line(k, `${s.who}: ${s.text}`)),
    }),
  );

  out.push(renderDiscord($, k, { evening, view, rules, now }));

  // Pause / end of the evening
  out.push(
    Section(k, {
      key: "evening",
      title: "Pause & end of evening",
      collapsible: true,
      defaultOpen: false,
      actions: [
        view.paused
          ? {
              key: "pause-off",
              label: "Resume",
              onPress: () =>
                void tableAction($, "Break over", "set_pause", { on: false }),
            }
          : {
              key: "pause-on",
              label: "Pause",
              onPress: () =>
                void tableAction($, "Break", "set_pause", { on: true }),
            },
      ],
      children: [
        Line(
          k,
          "Context full: Pause → chronist saves canon → /compact → re-read campaign + canon → Resume.",
          { dim: true },
        ),
        Actions(
          k,
          "end",
          [
            {
              key: "end-clear",
              label: "Clear window",
              onPress: () =>
                void tableAction($, "Window cleared", "show_players", {
                  clear: true,
                }),
            },
            {
              key: "end-stop",
              label: "Stop sound",
              onPress: () =>
                void tableAction($, "Sound stopped", "play_sound", {
                  stop: true,
                }),
            },
            {
              key: "end-leave",
              label: "Leave Discord",
              confirm: "Really leave?",
              onPress: () =>
                void tableAction($, "Bot left Discord", "discord", {
                  action: "leave",
                }),
            },
          ],
          3,
        ),
        Line(
          k,
          "Then: recap & fade-out · canon cleanup · write_session · campaign set threads/party_at · debrief.",
          { dim: true },
        ),
        ...renderInterjections($, k, evening),
      ],
    }),
  );
  return out;
}
