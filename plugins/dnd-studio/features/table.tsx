/**
 * GM mode (pnp-spielleiter): the Table tab, the band above the prompt, the notes added to the model's own table calls,
 * and the two hard guards (handout/secret leaks, talk_npc at a live table). The table must never stall: everything
 * else only annotates.
 */
import { noteProgressCall } from "./progress";
import { prepJobOf } from "../lib/progress";
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
import { autoOpen, Fold, noteTableEnded } from "./dnd-ui";
import { noteMadeResults } from "./review";
import { applyLook } from "./look";
import { forgetBuild } from "./build";
import { jsonOf, studioCall, textOf } from "../lib/studio";
import {
  advance,
  bandParts,
  currentTurn,
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
  isProtectedProfile,
} from "../lib/state";
import {
  Card,
  EmptyState,
  Field,
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

/**
 * The chapter the table plays, so a big campaign's NPCs and scenes are read for it alone: the chapter chosen in the
 * Studio (`chapterPick`), else the chapter of the scene at the table (`tableAt`), from one small overview of the
 * scenes. `{}` when the Studio names none (an older Studio, a campaign without chapters): then all are read.
 */
export async function tableChapter(
  $: EngineInterface,
): Promise<{ chapter?: number; evening?: string }> {
  try {
    const c = await studioCall($, "campaign", { overview: true, only: ["scenes"] });
    return chapterOf(c);
  } catch {
    return {};
  }
}

/** The table's chapter in a campaign overview (see tableChapter). */
export function chapterOf(c: Obj): { chapter?: number; evening?: string } {
  const pick = obj(c.chapterPick);
  const picked = Number(pick.chapter);
  if (Number.isFinite(picked) && picked > 0)
    return {
      chapter: picked,
      ...(typeof pick.evening === "string" && pick.evening ? { evening: pick.evening } : {}),
    };
  const at = Number(c.tableAt);
  const scenes = Array.isArray(c.scenes) ? c.scenes.map(obj) : [];
  const scene = Number.isFinite(at) && at > 0 ? scenes.find((sc) => Number(sc.n) === at) ?? scenes[at - 1] : undefined;
  const ch = Number(scene?.chapter);
  return Number.isFinite(ch) && ch > 0 ? { chapter: ch } : {};
}

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
          ...(await tableChapter($)),
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
 * Takes the turns that wait with nobody to answer them (wait_for_players, one turn a call, a second at most each)
 * and drops them: the Studio has no tool to discard a turn, wait_for_players is the only way to take one.
 */
export async function discardTurns(
  $: EngineInterface,
  count: number,
): Promise<void> {
  let taken = 0;
  try {
    for (let i = 0; i < count; i++) {
      const r = await studioCall($, "wait_for_players", {
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
      // a line said with wait: false reports how it went in the next say_line's before (Ödland chapter 3, 2026-11-23)
      const cut = { ...json, ...obj(json.table), ...(json.before && typeof json.before === "object" && !obj(json.table).interrupted ? obj(json.before) : {}) };
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
      // a talk button cuts nothing since 2026-11-23: a line is only cut by the game master (interrupt); held means the
      // players talk and it plays when they let go
      if (cut.held === true)
        notes.push(
          "**The players are talking** — the line plays when they let go; take their turn next and answer it.",
        );
      if (cut.interrupted === true || unheardRaw) {
        notes.push(
          `**Line cut** — deliver later what they did not hear${unheard ? `: "${truncate(unheard, 160)}"` : ""}, if it still holds.`,
        );
        await patchLive($, () => ({
          warning: "line cut: deliver the rest later",
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
      // only places, fog, an overlay or the weather on the map shown: its markers stay (the Discord test of
      // 2026-11-25 was told off for a reveal_places)
      const mapUpdate =
        !input.picture &&
        !input.title &&
        ["reveal_places", "hide_places", "reveal", "hide", "fog", "places", "overlay", "weather", "effect", "big"].some(
          (k) => input[k] !== undefined,
        );
      if (input.map && !mapUpdate && !(Array.isArray(input.markers) && input.markers.length))
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
          prepared: `${String(json.made ?? json.done ?? "?")}/${String(json.total)}${json.failed ? `, ${Array.isArray(json.failed) ? json.failed.length : String(json.failed)} failed` : ""}${prepJobOf(json) ? " läuft" : ""}`,
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
  // campaign joins get/new/set/export/spoiler (since 2026-10-29): only its writes are guarded, reading stays free
  if (tool === "campaign" && ["get", "export", undefined, ""].includes(input.action as string | undefined))
    return undefined;
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
  if (rules.denyFamily) {
    const profile = (await readLive($)).profile;
    if (isProtectedProfile(profile))
      return `The open Studio profile "${profile}" is on this computer's protected list (plugin option protectedProfiles: real saved evenings), which is never changed: switch to another profile first.`;
  }
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
    { tool: "mcp__plugin_dnd-studio_dnd-studio__campaign" },
    ($, e, next) => guard($, e, next, "campaign"),
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
  const ev = bandEvening(await readEvening($));
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

/** The fight-order field's example from the real group: "z. B. Ada, Borin, Wolf 1" (the label names the thing). */
export function orderExample(view: TableView): string {
  const names = view.party.filter((h) => !h.foe).map((h) => h.name).slice(0, 3);
  const foe = view.party.find((h) => h.foe)?.name ?? "Wolf 1";
  return `z. B. ${[...(names.length ? names : ["Ada", "Borin"]), foe].join(", ")}`;
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
  // A whole-tab empty state carries the one action that helps (R8); cards never repeat the header's „Neu laden“.
  const reload: Action = {
    key: "table-reload",
    label: k.s.reload,
    variant: "primary",
    onPress: () => void refreshTable($),
  };
  if (!view) {
    out.push(
      EmptyState(k, {
        icon: "dice",
        title: "Kein Tisch gelesen",
        text: "Die Studio-App muss laufen.",
        action: reload,
      }),
    );
    return out;
  }
  // `view.error` (a failed read) stands in the pane's fixed status line, see the pane's render in hooks/register.tsx

  // The card „Tisch“: what is open and who hears the players, problems as rows of their own.
  const running = isLive(view, ini);
  const watching = evening.watcher.state === "running";
  const stranded = strandedTurns(view, ini, watching);
  const problems: RenderElement[] = [];
  if (stranded)
    problems.push(
      ListRow(k, {
        key: "desk-stranded",
        status: "warning",
        title: stranded === 1 ? "1 Zug wartet" : `${stranded} Züge warten`,
        meta: "keine Spielleitung hört zu",
      }),
    );
  else if (running && view.turnsWaiting)
    problems.push(
      ListRow(k, {
        key: "desk-turns",
        status: "idle",
        title:
          view.turnsWaiting === 1
            ? "1 Zug wartet"
            : `${view.turnsWaiting} Züge warten`,
      }),
    );
  if (evening.stale)
    problems.push(
      ListRow(k, {
        key: "desk-stale",
        status: "failed",
        title: evening.stale,
        wrap: true,
      }),
    );
  if (view.unheard)
    problems.push(
      ListRow(k, {
        key: "desk-unheard",
        status: "warning",
        title: `Ungehört: ${view.unheard}`,
        wrap: true,
      }),
    );
  const unheardTable = running && !watching;
  const desk: RenderElement[] = running
    ? [
        ListRow(k, {
          key: "desk-window",
          status: view.playersWindow ? "ok" : "idle",
          title: "Spielerfenster",
          pill: view.playersWindow
            ? { text: "offen", tone: "ok" }
            : { text: "zu", tone: "neutral", glyph: false },
        }),
        ...(view.discord || view.listening
          ? [
              ListRow(k, {
                key: "desk-discord",
                status: "ok",
                title: "Discord",
                meta: view.listening
                  ? view.speaker
                    ? `${view.speaker} spricht`
                    : "hört zu"
                  : "",
              }),
            ]
          : []),
        ListRow(k, {
          key: "desk-gm",
          status: watching ? "ok" : "warning",
          title: watching
            ? "Claude hört auf die Spieler"
            : "Niemand hört auf die Spieler",
        }),
      ]
    : [];
  if (desk.length || problems.length)
    out.push(
      Card(k, {
        key: "desk",
        title: {
          icon: "dice",
          title: "Tisch",
          pill: view.paused ? { text: "Pause", tone: "warn" } : undefined,
        },
        children: [...desk, ...problems],
        hint: unheardTable
          ? "Solange niemand zuhört, kommen die Züge der Spieler nicht an; Claude wird beim nächsten Zug erinnert."
          : undefined,
        actions: stranded
          ? [
              {
                key: "turns-drop",
                label: stranded === 1 ? "Zug verwerfen" : "Züge verwerfen",
                icon: "x",
                variant: "secondary",
                danger: true,
                confirm: "Wartende Züge wirklich verwerfen?",
                confirmWord: "Verwerfen",
                onPress: () => void discardTurns($, stranded),
              },
            ]
          : [],
      }),
    );

  // No table running: a quiet empty state instead of the full desk with live buttons; Discord stays to join early.
  if (!running) {
    out.push(
      EmptyState(k, {
        icon: "dice",
        title: "Kein Tisch läuft",
        text: "Der Abend beginnt, sobald Claude ihn eröffnet (etwa „Wir spielen weiter“).",
        action: reload,
      }),
    );
    out.push(renderDiscord($, k, { evening, view, rules, now }));
    return out;
  }

  // Scene card: title in brass, the goal (not spoiler-safe), the scene's sounds as rows that play only on a press
  const { Box, Text } = k;
  const stopSound = (key: string): Action => ({
    key,
    label: "Klang stoppen",
    icon: "stop",
    variant: "secondary",
    onPress: () =>
      void tableAction($, "Klang gestoppt", "play_sound", { stop: true }),
  });
  out.push(
    Card(k, {
      key: "scene",
      title: {
        icon: "book",
        title: view.scene?.place ? `Szene · ${view.scene.place}` : "Szene",
        pill: ini.isActive
          ? { text: `Runde ${ini.round}`, tone: "accent", glyph: false }
          : undefined,
      },
      children: [
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
        ...view.sounds.map((s, i) =>
          ListRow(k, {
            key: `sound-${i}`,
            icon: s.loop ? "music" : "speaker",
            title: s.name,
            meta: s.loop ? "Schleife" : "",
            actions: [
              {
                key: `snd-${i}`,
                label: "Abspielen",
                variant: "secondary",
                onPress: () =>
                  void tableAction($, `Spielt ${s.name}`, "play_sound", {
                    sound: s.file,
                    loop: s.loop,
                    volume: s.volume,
                  }),
              },
            ],
          }),
        ),
      ],
      actions: view.sounds.length ? [stopSound("snd-stop")] : [],
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
  const orderField = {
    key: "ini-order",
    placeholder: orderExample(view),
    onSubmit: (v: string) => void startInitiative($, parseOrder(v)),
  };
  out.push(
    Card(k, {
      key: "ini",
      title: {
        icon: "dice",
        title: ini.isActive ? "Reihenfolge · Kampf" : "Reihenfolge",
        pill: current
          ? { text: `${current} ist dran`, tone: "accent", glyph: false }
          : undefined,
      },
      children: ini.isActive
        ? ini.order.map((n, i) => {
            const hp = hpOf(n);
            const on = i === ini.index;
            if (!k.graphical || !Progress)
              return (
                <Text key={`ini-${i}`} bold={on} dimColor={!on}>
                  {truncate(
                    `${on ? ">" : " "} ${n}${hp ? `  ${hp.hp}/${hp.max}` : ""}`,
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
                {/* Whose turn: bold in the accent (▶ is kept for „start“). */}
                <Box width={14} flexShrink={0}>
                  <Text
                    size="footnote"
                    weight={on ? "bold" : undefined}
                    color={on ? k.t.accentTintText : k.t.text}
                    wrap="truncate-end"
                  >
                    {sanitize(n)}
                  </Text>
                </Box>
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  {hp ? (
                    <Progress
                      // the name stands left already; the bar names the value (seen: the name twice per row)
                      label="Ausdauer"
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
            // Label | field | deed (R4); a surface whose kit has no Input falls back to the pane's own element.
            Field(k, {
              ...orderField,
              label: "Reihenfolge",
              submitLabel: "Starten",
            }) ?? (
              <Box key="ini-order-box" flexDirection="column" width="100%" minWidth={0}>
                {Input({ ...orderField, submitLabel: "Starten" })}
              </Box>
            ),
          ],
      actions: ini.isActive
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
              danger: true,
              confirm: "Kampf wirklich beenden?",
              confirmWord: "Beenden",
              onPress: () => void endInitiative($),
            },
          ]
        : view.party.length
          ? [
              {
                key: "ini-party",
                label: "Gruppe übernehmen",
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
    }),
  );

  // Party: the name is the title, values and spotlight fairness the meta, a condition (or „Gegner“) the pill
  const fair = live.turnAt > 0 || Object.keys(live.addressed).length > 0;
  out.push(
    Card(k, {
      key: "party",
      title: { icon: "user", title: "Gruppe", count: view.party.length },
      empty: "Keine Gruppe.",
      children: view.party.map((h) =>
        ListRow(k, {
          key: `hero-${h.name}`,
          status: h.conditions.length ? "warning" : h.foe ? "idle" : "ok",
          title: h.name,
          meta: [
            h.values,
            h.foe && h.conditions.length ? "Gegner" : "",
            fair && !h.foe
              ? live.addressed[h.name]
                ? `angesprochen vor ${ago(now - live.addressed[h.name]!)}`
                : "noch nicht angesprochen"
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          pill: h.conditions.length
            ? { text: h.conditions.join(", "), tone: "warn" }
            : h.foe
              ? { text: "Gegner", tone: "neutral", glyph: false }
              : undefined,
        }),
      ),
    }),
  );

  // Dice and secrets: drawn only when there is something (R8)
  const rolls = view.rolls.slice(-5);
  if (rolls.length)
    out.push(
      Fold(k, {
        key: "dice",
        icon: "dice",
        title: "Würfel",
        defaultOpen: false,
        count: view.rolls.length,
        children: rolls.map((r, i) =>
          Sentence(
            k,
            r.hidden && rules.spoilerSafe
              ? `${r.who}: verdeckter Wurf`
              : `${r.who}${r.label ? ` · ${r.label}` : ""}: ${r.total}${r.verdict ? ` · ${r.verdict}` : ""}${r.hidden ? " (verdeckt)" : ""}`,
            { faint: i < rolls.length - 1 },
          ),
        ),
      }),
    );
  if (view.secrets.length)
    out.push(
      Fold(k, {
        key: "secrets",
        icon: "eye",
        title: "Geheimes und Geflüstertes",
        count: view.secrets.length,
        defaultOpen: false,
        // spoiler-safe: nothing to unfold, one sentence that names the switch by its place in the Zustand tab
        empty:
          "Verborgen, solange „Spoilerfrei“ an ist (Zustand → Regeln am Tisch).",
        children: rules.spoilerSafe
          ? []
          : view.secrets.slice(-5).map((s) => Sentence(k, `${s.who}: ${s.text}`)),
      }),
    );

  out.push(renderDiscord($, k, { evening, view, rules, now }));

  // Pause · end of the evening · interjections: one card per topic, each with one action row and one hint
  out.push(
    Card(k, {
      key: "pause",
      // the state itself stands once, as the pill of the card „Tisch“
      title: { icon: "pause", title: "Pause" },
      hint: "Für lange Abende: Claude hält das Erlebte fest, sortiert sich und macht danach dort weiter, wo ihr wart.",
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
    }),
    Card(k, {
      key: "evening",
      title: { icon: "moon", title: "Abendende" },
      hint: "Nach dem Abend schreibt Claude die Sitzung auf und merkt sich offene Fäden und wo die Gruppe steht.",
      actions: [
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
        stopSound("end-stop"),
      ],
    }),
    renderInterjections($, k, evening),
  );
  return out;
}
