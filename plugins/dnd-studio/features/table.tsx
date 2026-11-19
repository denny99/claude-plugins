/**
 * GM mode (pnp-spielleiter): the Table tab, the band above the prompt, the notes added to the model's own table calls,
 * and the two hard guards (handout/secret leaks, talk_npc at a live table). The table must never stall: everything
 * else only annotates.
 */
import { noteProgressCall } from "./progress";
import type { EngineInterface, On, RenderElement } from "claude-code";

import {
  bandEvening,
  noteDiscord,
  noteStale,
  noteStudioStatus,
  renderDiscord,
  renderInterjections,
  renderListener,
  STALE_TEXT,
} from "./evening";
import { autoOpen, Fold, noteTableEnded } from "./dnd-ui";
import { noteMadeResults } from "./review";
import { applyLook } from "./look";
import { forgetBuild } from "./build";
import { jsonOf, studioCall, textOf } from "../lib/studio";
import {
  advance,
  bandParts,
  currentTurn,
  isListenerMode,
  isLive,
  strandedTurns,
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
  setCampaign,
  profileName,
} from "../lib/state";
import {
  Actions,
  Card,
  CardTitle,
  EmptyState,
  Line,
  ListRow,
  Section,
  Sentence,
  sanitize,
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
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};

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
    await checkTableOpen($);
    await followLiveTable($);
  } catch (err) {
    const prev = await readTable($);
    await setTable($, {
      ...(prev ?? toTableView({}, {}, now)),
      fetchedAt: now,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

let followUntil = 0;

/**
 * While a table is live the pane re-reads it every LIVE_POLL_MS (one cheap table_state, no campaign), so an evening
 * that ends outside Claude (the window closed in the Studio, the bot gone, the profile switched) takes its scene look,
 * launcher line and watcher warning with it. One chain at a time; it stops at the first read that is not live.
 */
async function followLiveTable($: EngineInterface): Promise<void> {
  if (!isLive(await readTable($), await readInitiative($))) return;
  const now = await $.clock.now();
  if (followUntil > now) return;
  followUntil = now + LIVE_POLL_MS;
  $.clock.after(LIVE_POLL_MS, () => {
    followUntil = 0;
    void refreshTable($, false);
  });
}

const LIVE_POLL_MS = 30_000;

/**
 * Takes the turns that wait with nobody to answer them (wait_for_players quiet, one turn a call, a second at most
 * each) and drops them: the Studio has no tool to discard a turn, wait_for_players is the only way to take one.
 */
export async function discardTurns(
  $: EngineInterface,
  count: number,
): Promise<void> {
  let taken = 0;
  try {
    for (let i = 0; i < count; i++) {
      const r = await studioCall($, "wait_for_players", {
        quiet: true,
        timeout_seconds: 1,
      });
      if (r.finished !== true) break;
      taken++;
    }
    $.ui.toast(
      taken ? `✓ ${taken} ${taken === 1 ? "Zug" : "Züge"} verworfen` : "Kein Zug mehr da",
    );
  } catch (err) {
    $.ui.toast(
      `✗ Züge nicht verworfen: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    );
  }
  await refreshTable($, false);
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
      `✗ Das Studio hat abgelehnt: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    );
  }
  await refreshTable($, false);
}

/** Starts a fight with this order: round 1, BEFORE the first in line, so the first `next` gives them the turn. */
export async function startInitiative(
  $: EngineInterface,
  order: string[],
): Promise<Initiative> {
  const out = await patchInitiative($, () => ({
    order,
    index: -1,
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
      // The Studio nests the cut under `table` (say_line's table part); older answers had it on top.
      const cut = { ...json, ...obj(json.table) };
      const unheardRaw = cut.unheard;
      const unheard =
        typeof unheardRaw === "string"
          ? unheardRaw
          : Array.isArray(unheardRaw)
            ? // parts come as {voice, text, how} (say_line with parts): their words, not "[object Object]"
              unheardRaw
                .map((p) =>
                  typeof p === "string" ? p : String(obj(p).text ?? ""),
                )
                .filter(Boolean)
                .join(" ")
            : "";
      const listenerCut =
        cut.interrupted === true &&
        (isListenerMode(view) || /the listener cut/i.test(String(cut.note)));
      if (listenerCut) {
        notes.push(
          `**The listener cut the line** — do nothing more at the table: wait for the listener's return (pnp-zuhoerer), then answer the turn it brings${unheard ? `; afterwards deliver what they did not hear if it still holds: "${truncate(unheard, 160)}"` : ""}.`,
        );
        await patchLive($, () => ({
          warning: "listener cut the line: wait for its return",
        }));
      } else if (cut.interrupted === true || cut.held === true || unheardRaw) {
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
      const mode =
        input.listener === "haiku" || input.listener === "off"
          ? String(input.listener)
          : typeof json.listener === "string"
            ? json.listener
            : "";
      if (mode && view) await setTable($, { ...view, listener: mode });
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
      await noteMadeResults($, tool, input, text);
      break;
    case "results":
    case "jobs":
      await noteMadeResults($, tool, input, text);
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
    case "profile": {
      // another profile, another campaign: the header and the build forget the old one's name
      if (input.action === "use") {
        await setCampaign($, null);
        await patchLive($, () => ({ profile: "" }));
        $.clock.after(0, () => void profileName($));
      }
      // a profile made anew or deleted takes the kept build of a profile with that name along
      const name =
        input.action === "new"
          ? input.name
          : input.action === "delete"
            ? input.profile
            : undefined;
      if (typeof name === "string" && name.trim() && !/error|not found|refus/i.test(text.slice(0, 200)))
        await forgetBuild($, { profile: name.trim() });
      break;
    }
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
      "discord",
      "open_players",
      "profile",
    ].includes(tool)
  )
    $.clock.after(0, () => void refreshTable($, false));
  await checkTableOpen($);
  return notes;
}

/** Opens the pane once when a table goes live (userConfig autoOpen); a table that ended may open it again. */
async function checkTableOpen($: EngineInterface): Promise<void> {
  if (isLive(await readTable($), await readInitiative($)))
    await autoOpen($, "table");
  else noteTableEnded();
}

/** The body of every watching `tool.call` hook. */
export async function watch(
  $: EngineInterface,
  e: unknown,
  next: (e: never) => Promise<unknown>,
  tool: string,
): Promise<never> {
  const start = await $.clock.now();
  const r = (await next(e as never)) as Obj;
  // build progress (jobs, voices, the GPU queue, the texter's entries): its own try, never in the way
  await noteProgressCall($, tool, e, r, start);
  try {
    if (r.deny) return r as never;
    // The listener's own take (pnp-zuhoerer, a subagent, quiet): its turn reaches the GM with the listener's return.
    if (tool === "wait_for_players" && (e as Obj)?.agentId) return r as never;
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

/** The deny reason of the guarding `tool.check` hooks for this call, or undefined. */
async function guardReason(
  $: EngineInterface,
  e: unknown,
  tool: string,
): Promise<string | undefined> {
  const rules = await readRules($);
  const input = inputOf((e as Obj).input ?? {});
  if ((tool === "show_players" || tool === "give_find") && rules.denyLeaks) {
    const forWhom = looksPrivate(input);
    if (forWhom)
      return `This looks like a handout or secret for ${forWhom}: deliver it privately (discord whisper with handout/sheet), not on the shared window. The rule can be turned off in /dnd → Health → Rules.`;
  }
  if (
    tool === "talk_npc" &&
    rules.denyTalkNpc &&
    isLive(await readTable($), await readInitiative($))
  )
    return "The table is live: speak the NPC yourself with say_line (voice = the NPC); talk_npc is for preparation. Rule toggle: /dnd → Health → Rules.";
  if (rules.denyFamily && /meine familie/i.test((await readLive($)).profile))
    return 'The open Studio profile is "Meine Familie", which is never changed: switch the profile first.';
  return undefined;
}

/**
 * The body of the guarding `tool.check` hooks: the only hard denies of the plugin. A deny is returned AFTER `next(e)`
 * (a stricter verdict beneath stands): answering without next makes the engine report this hook as skipped.
 */
export async function guard(
  $: EngineInterface,
  e: unknown,
  next: (e: never) => Promise<unknown>,
  tool: string,
): Promise<never> {
  let reason: string | undefined;
  try {
    reason = await guardReason($, e, tool);
  } catch {
    // a failing guard lets the call through
  }
  const verdict = (await next(e as never)) as { decision?: string } | undefined;
  if (!reason || verdict?.decision === "deny") return verdict as never;
  return { decision: "deny", reason } as never;
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
    { tool: "mcp__plugin_dnd-studio_dnd-studio__open_players" },
    ($, e, next) => watch($, e, next, "open_players"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__profile" },
    ($, e, next) => watch($, e, next, "profile"),
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

  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__results" },
    ($, e, next) => watch($, e, next, "results"),
  ).catch(passThrough);
  on(
    "tool.call",
    { tool: "mcp__plugin_dnd-studio_dnd-studio__jobs" },
    ($, e, next) => watch($, e, next, "jobs"),
  ).catch(passThrough);
}

/**
 * What the launcher strip says about a live table (null: no live table). Band v3: `short` is the starter's status
 * ("Tisch läuft · Runde 3", without a fight "Tisch läuft"); `status` is the whole sentence ("Das Tor im Nebel · Runde 3
 * · Thorin ist dran"), which the band no longer shows (the Table tab has scene, round and turn). `hints` are every hint (watcher, silence, stale schemas, the Studio's
 * warning); the band shows only the most urgent warn/bad one (`bandHint`).
 */
export async function bandStatus($: EngineInterface): Promise<{
  short: string;
  status: string;
  hints: { text: string; tone: "ok" | "warn" | "bad" }[];
} | null> {
  const view = await readTable($);
  const ini = await readInitiative($);
  if (!isLive(view, ini)) return null;
  const live = await readLive($);
  const now = await $.clock.now();
  const band = bandParts(view, ini, live, now);
  const ev = bandEvening(await readEvening($), isListenerMode(view));
  const hints: { text: string; tone: "ok" | "warn" | "bad" }[] = [];
  if (band.silence > SILENCE_WARN_S)
    hints.push({ text: `${band.silence} s still – Füller?`, tone: "warn" });
  hints.push({ text: ev.watch, tone: ev.watching ? "ok" : "warn" });
  // the band has a few words: the step that helps; the Table tab says why (BAND_STALE)
  if (ev.stale) hints.push({ text: "Claude neu starten", tone: "bad" });
  if (band.warning) hints.push({ text: band.warning, tone: "bad" });
  const short = ini.isActive ? `Tisch läuft · Runde ${ini.round}` : "Tisch läuft";
  return { short, status: band.text, hints };
}

/** The one hint the band shows (pure): the first `bad`, else the first `warn`; `ok` hints stay in the Table tab. */
export function bandHint(
  hints: readonly { text: string; tone: "ok" | "warn" | "bad" }[],
): { text: string; tone: "warn" | "bad" } | undefined {
  const hint = hints.find((h) => h.tone === "bad") ?? hints.find((h) => h.tone === "warn");
  return hint ? { text: hint.text, tone: hint.tone as "warn" | "bad" } : undefined;
}

// --- the Table tab ------------------------------------------------------------------------------------------------

type InputEl = (props: Record<string, unknown>) => RenderElement;

/** The fight-order field's example from the real group: "z. B. Ada, Borin, Wolf 1". */
export function orderExample(view: TableView): string {
  const names = view.party.filter((h) => !h.foe).map((h) => h.name).slice(0, 3);
  const foe = view.party.find((h) => h.foe)?.name ?? "Wolf 1";
  return `Reihenfolge, z. B. ${[...(names.length ? names : ["Ada", "Borin"]), foe].join(", ")}`;
}

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
      EmptyState(k, {
        icon: "dice",
        title: "Kein Tisch gelesen",
        text: "Aktualisieren drücken (die Studio-App muss laufen).",
      }),
    );
    return out;
  }
  // `view.error` (a failed read) stands in the pane's fixed status line, see the pane's render in hooks/register.tsx

  // Table status: one sentence, problems first
  const status = [
    view.playersWindow ? "Spielerfenster offen" : "Spielerfenster zu",
    view.discord ? "Discord" : "",
    view.listening
      ? `hört zu${view.speaker ? ` · ${view.speaker} spricht` : ""}`
      : "",
    view.turnsWaiting ? `${view.turnsWaiting} Züge warten` : "",
    view.paused ? "Pause" : "",
    isListenerMode(view) ? "Zuhörer an" : "",
  ].filter(Boolean);
  const running = isLive(view, ini);
  if (running) out.push(Sentence(k, status.join(" · "), { faint: true }));
  const stranded = strandedTurns(
    view,
    ini,
    evening.watcher.state === "running",
  );
  if (stranded)
    out.push(
      Sentence(
        k,
        `⚠ ${stranded === 1 ? "1 Zug wartet" : `${stranded} Züge warten`}, keine Spielleitung hört zu`,
        { tone: "warn" },
      ),
      Actions(
        k,
        "stranded",
        [
          {
            key: "turns-drop",
            label: stranded === 1 ? "Zug verwerfen" : "Züge verwerfen",
            icon: "x",
            variant: "secondary",
            confirm: "Wirklich verwerfen?",
            onPress: () => void discardTurns($, stranded),
          },
        ],
        3,
      ) as RenderElement,
    );
  if (evening.stale)
    out.push(Sentence(k, `⚠ ${evening.stale}`, { tone: "bad" }));
  if (isLive(view, ini) && isListenerMode(view)) {
    const ev = bandEvening(evening, true);
    out.push(
      Sentence(k, `${ev.watching ? "●" : "○"} ${ev.watch}`, {
        tone: ev.watching ? "ok" : "warn",
      }),
    );
  } else if (isLive(view, ini))
    out.push(
      Sentence(
        k,
        evening.watcher.state === "running"
          ? "● Claude hört auf die Spieler"
          : "○ Niemand hört auf die Spieler – ihre Züge kommen nicht an. Claude wird beim nächsten Zug erinnert; sonst Claude bitten, wieder zuzuhören.",
        { tone: evening.watcher.state === "running" ? "ok" : "warn" },
      ),
    );
  if (view.unheard)
    out.push(Sentence(k, `Ungehört: ${view.unheard}`, { tone: "warn" }));

  // No table running: a quiet empty state instead of the full desk with live buttons; Discord stays to join early.
  if (!running) {
    out.push(
      EmptyState(k, {
        icon: "dice",
        title: "Kein Tisch läuft",
        text: "Claude bitten, den Abend zu beginnen (etwa „Wir spielen weiter“). Sobald das Spielerfenster oder Discord eine Szene zeigt, erscheint hier das Pult.",
      }),
    );
    out.push(renderDiscord($, k, { evening, view, rules, now }));
    return out;
  }

  // Scene card: title in brass, the goal (not spoiler-safe), sound chips that play only on a press
  const { Box, Text } = k;
  out.push(
    Card(k, {
      key: "scene",
      children: [
        CardTitle(k, {
          icon: "book",
          title: view.scene?.place ? `Szene · ${view.scene.place}` : "Szene",
          pill: ini.isActive
            ? { text: `Runde ${ini.round}`, tone: "accent", glyph: false }
            : undefined,
        }),
        view.scene?.title
          ? k.graphical
            ? (
                <Text size="heading" weight="bold" color={k.t.accentTintText}>
                  {sanitize(view.scene.title)}
                </Text>
              )
            : <Text bold>{truncate(view.scene.title, k.cols)}</Text>
          : Sentence(k, "Noch keine Szene gezeigt", { faint: true }),
        view.scene?.notes && !rules.spoilerSafe
          ? Sentence(k, view.scene.notes)
          : null,
        view.sounds.length
          ? Actions(
              k,
              "sounds",
              [
                ...view.sounds.map((s, i): Action => ({
                  key: `snd-${i}`,
                  label: truncate(s.name, 22),
                  icon: s.loop ? "music" : "speaker",
                  variant: "secondary",
                  onPress: () =>
                    void tableAction($, `Spielt ${s.name}`, "play_sound", {
                      sound: s.file,
                      loop: s.loop,
                      volume: s.volume,
                    }),
                })),
                {
                  key: "snd-stop",
                  label: "Stille",
                  icon: "stop",
                  variant: "secondary",
                  onPress: () =>
                    void tableAction($, "Atmosphäre aus", "play_sound", {
                      stop: true,
                    }),
                },
              ],
              4,
            )
          : null,
      ],
    }),
  );

  // Order: whose turn, HP bars from the party values, one primary "next turn"
  const hpOf = (name: string): { hp: number; max: number } | null => {
    const h = view.party.find((p) => p.name === name);
    const m = h?.values.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { hp: Number(m[1]), max: Number(m[2]) } : null;
  };
  const Progress = k.Progress;
  const current = ini.isActive ? ini.order[ini.index] : "";
  out.push(
    Card(k, {
      key: "ini",
      children: [
        CardTitle(k, {
          icon: "dice",
          title: ini.isActive ? "Reihenfolge · Kampf" : "Reihenfolge",
          pill: current
            ? { text: `${current} ist dran`, tone: "accent", glyph: "▶" }
            : undefined,
        }),
        ...(ini.isActive
          ? ini.order.map((n, i) => {
              const hp = hpOf(n);
              const on = i === ini.index;
              if (!k.graphical || !Progress)
                return (
                  <Text key={`ini-${i}`} bold={on} dimColor={!on}>
                    {truncate(
                      `${on ? "▶" : " "} ${n}${hp ? `  ${hp.hp}/${hp.max}` : ""}`,
                      k.cols,
                    )}
                  </Text>
                );
              const low = hp && hp.hp * 3 <= hp.max;
              return (
                <Box
                  key={`ini-${i}`}
                  flexDirection="row"
                  alignItems="center"
                  gap={1}
                >
                  <Box width={14} flexShrink={0}>
                    <Text
                      size="footnote"
                      weight={on ? "bold" : undefined}
                      color={on ? k.t.accentTintText : k.t.text}
                      wrap="truncate-end"
                    >
                      {sanitize(`${on ? "▶ " : ""}${n}`)}
                    </Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    {hp ? (
                      <Progress
                        label={sanitize(n)}
                        value={hp.hp}
                        max={hp.max}
                        valueText={`${hp.hp}/${hp.max}`}
                        color={low ? k.t.tones.bad.fg : k.t.tones.ok.fg}
                      />
                    ) : null}
                  </Box>
                </Box>
              );
            })
          : [
              <Box key="ini-order-box" flexDirection="column" width="100%" minWidth={0}>
                {Input({
                  key: "ini-order",
                  placeholder: orderExample(view),
                  submitLabel: "Start",
                  onSubmit: (v: string) => void startInitiative($, parseOrder(v)),
                })}
              </Box>,
            ]),
        Actions(
          k,
          "ini-acts",
          ini.isActive
            ? [
                {
                  key: "ini-next",
                  label: "Nächster Zug",
                  icon: "next",
                  variant: "primary",
                  onPress: () => void nextTurn($),
                },
                {
                  key: "ini-end",
                  label: "Kampf beenden",
                  icon: "x",
                  variant: "secondary",
                  confirm: "Wirklich beenden?",
                  onPress: () => void endInitiative($),
                },
              ]
            : view.party.length
              ? [
                  {
                    key: "ini-party",
                    label: "Gruppe als Reihenfolge",
                    icon: "list",
                    variant: "secondary",
                    onPress: () =>
                      void startInitiative(
                        $,
                        view.party.filter((h) => !h.foe).map((h) => h.name),
                      ),
                  },
                ]
              : [],
          3,
        ),
      ],
    }),
  );

  // Party, with values, conditions and spotlight fairness
  const fair = live.turnAt > 0 || Object.keys(live.addressed).length > 0;
  out.push(
    Card(k, {
      key: "party",
      children: [
        CardTitle(k, {
          icon: "user",
          title: "Gruppe",
          count: view.party.length,
        }),
        ...(view.party.length
          ? view.party.map((h) =>
              ListRow(k, {
                key: `hero-${h.name}`,
                status: h.conditions.length ? "warning" : h.foe ? "idle" : "ok",
                title: `${h.name}${h.foe ? " (Gegner)" : ""}${h.values ? ` · ${h.values}` : ""}`,
                meta: [
                  h.conditions.join(", "),
                  fair && !h.foe
                    ? live.addressed[h.name]
                      ? `angesprochen vor ${ago(now - live.addressed[h.name]!)}`
                      : "noch nicht angesprochen"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
              }),
            )
          : [Sentence(k, "Keine Gruppe.", { faint: true })]),
      ],
    }),
  );

  // NPCs: stock lines in their voice, picked by hand
  for (const n of view.npcs)
    out.push(
      Card(k, {
        key: `npc-card-${n.name}`,
        children: [
          CardTitle(k, {
            icon: "chat",
            title: n.place ? `${n.name} · ${n.place}` : n.name,
            pill: { text: "mit Stimme", tone: "neutral", glyph: false },
          }),
          Actions(
            k,
            `npc-${n.name}`,
            n.stock.length
              ? n.stock.map((l, i): Action => ({
                  key: `npc-${n.name}-${i}`,
                  label: truncate(
                    `„${l.text}“${l.how ? ` (${l.how})` : ""}`,
                    40,
                  ),
                  variant: "link",
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
                    label: "Begrüßen",
                    variant: "link",
                    onPress: () =>
                      void tableAction($, `${n.name} grüßt`, "say_line", {
                        voice: n.name,
                        text: "",
                        opener: "greet",
                      }),
                  },
                ],
            k.narrow ? 1 : 4,
          ),
        ],
      }),
    );

  // Listener line: who listens on Discord and what was said last
  const disc = evening.discord;
  if (view.discord || isListenerMode(view)) {
    const last = view.turnsWaiting ? "" : (evening.notes.at(-1)?.text ?? "");
    out.push(
      ListRow(k, {
        key: "listener-line",
        icon: "mic",
        tone: isListenerMode(view) ? "ok" : "neutral",
        title: isListenerMode(view) ? "Zuhörer hört zu" : "Zuhörer aus",
        meta: [
          "Discord",
          disc?.members.length ? `${disc.members.length} Spieler` : "",
          last ? `zuletzt: „${truncate(last, 40)}“` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      }),
    );
  }

  // Dice and secrets
  const rolls = view.rolls.slice(-5);
  out.push(
    Fold(k, {
      key: "dice",
      icon: "dice",
      title: "Würfel",
      defaultOpen: false,
      count: view.rolls.length,
      children: rolls.length
        ? rolls.map((r, i) =>
            Sentence(
              k,
              r.hidden && rules.spoilerSafe
                ? `${r.who}: verdeckter Wurf`
                : `${r.who}${r.label ? ` · ${r.label}` : ""}: ${r.total}${r.verdict ? ` · ${r.verdict}` : ""}${r.hidden ? " (verdeckt)" : ""}`,
              { faint: i < rolls.length - 1 },
            ),
          )
        : [Sentence(k, "Noch nicht gewürfelt.", { faint: true })],
    }),
  );
  out.push(
    Fold(k, {
      key: "secrets",
      icon: "eye",
      title: "Geheimes und Geflüstertes",
      count: view.secrets.length,
      defaultOpen: false,
      children: rules.spoilerSafe
        ? [
            Sentence(
              k,
              "Verborgen (spoilerfrei). Abschalten unter Zustand → Regeln.",
              { faint: true },
            ),
          ]
        : view.secrets.slice(-5).map((s) => Sentence(k, `${s.who}: ${s.text}`)),
    }),
  );

  out.push(renderListener($, k, { evening, view, rules }));
  out.push(renderDiscord($, k, { evening, view, rules, now }));

  // Pause / end of the evening
  out.push(
    Fold(k, {
      key: "evening",
      icon: "moon",
      title: "Pause und Abendende",
      pill: view.paused ? { text: "Pause", tone: "warn" } : undefined,
      defaultOpen: false,
      actions: [
        view.paused
          ? {
              key: "pause-off",
              label: "Weiter",
              icon: "play",
              variant: "secondary",
              onPress: () =>
                void tableAction($, "Pause vorbei", "set_pause", { on: false }),
            }
          : {
              key: "pause-on",
              label: "Pause",
              icon: "pause",
              variant: "secondary",
              onPress: () =>
                void tableAction($, "Pause", "set_pause", { on: true }),
            },
      ],
      children: [
        Sentence(
          k,
          "Wenn Claude der Faden ausgeht (langer Abend): Pause drücken, Claude hält das Erlebte fest, sortiert sich und macht nach „Weiter“ dort weiter, wo ihr wart.",
          { faint: true },
        ),
        Actions(
          k,
          "end",
          [
            {
              key: "end-clear",
              label: "Fenster leeren",
              icon: "x",
              variant: "secondary",
              onPress: () =>
                void tableAction($, "Fenster geleert", "show_players", {
                  clear: true,
                }),
            },
            {
              key: "end-stop",
              label: "Klang stoppen",
              icon: "stop",
              variant: "secondary",
              onPress: () =>
                void tableAction($, "Klang gestoppt", "play_sound", {
                  stop: true,
                }),
            },
          ],
          3,
        ),
        Sentence(
          k,
          "Nach dem Abend: Rückblick und Ausklang · Claude schreibt die Sitzung auf und merkt sich offene Fäden und wo die Gruppe steht · Nachbesprechung.",
          { faint: true },
        ),
        ...renderInterjections($, k, evening),
      ],
    }),
  );
  return out;
}
