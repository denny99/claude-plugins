/**
 * Build mode (pnp-kampagne): which pnp-* agents ran for the campaign (agent.spawn / turn.complete), the reviewers'
 * findings counts from their Mängel files, and a live acceptance checklist from the campaign overview.
 */
import { readBuildProgress, renderProgress } from "./progress";
import type { EngineInterface, On, RenderElement } from "claude-code";

import {
  LISTENER_AGENT,
  noteListenerEnd,
  noteListenerSpawn,
  noteStudioStatus,
  noteTurnEnd,
  personAsk,
} from "./evening";
import { autoOpen } from "./dnd-ui";
import { applyLook } from "./look";
import { createHost } from "../lib/host";
import {
  acceptanceOf,
  countFindings,
  findingsPathOf,
  planPathOf,
  PIPELINE,
  agentLabel,
  pnpAgentOf,
  reviewRounds,
  localDateTime,
  stageState,
} from "../lib/model";
import {
  campaignName,
  noteProfile,
  profileName,
  readCheck,
  patchCheck,
  patchRuns,
  readCampaign,
  readLive,
  readPreview,
  readRuns,
  readTab,
  setCampaign,
  setPreview,
  toggleRule,
  isProtectedProfile,
} from "../lib/state";
import { isCampaign, listCount, studioCall } from "../lib/studio";
import {
  Card,
  askTurnComplete,
  isAsked,
  KeyValue,
  ListRow,
  LogBox,
  openAction,
  Stepper,
} from "../lib/ui";
import type {
  Action,
  Kit,
  ListRowProps,
  PillProps,
  StatusInfo,
  StepState,
} from "../lib/ui";
import { openArgv } from "./review";
import type {
  AcceptItem,
  AgentRun,
  BuildCheck,
  CampaignInfo,
  PlanApproval,
  Rules,
  TableLive,
} from "../types";

const STORE_KEY = "runs";
const PLAN_KEY = "plan-approval";
const GPU_AGENTS = ["pnp-maler", "pnp-klang", "pnp-tischbereit"];

/** The file's own name ("bauplan-krug.md"), not the temp path it lives under. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

/** Opens a plan or findings file with the system's viewer; a refusal comes back as a toast. */
async function openFile($: EngineInterface, path: string): Promise<void> {
  const host = await createHost($);
  const argv = openArgv(host.platform, path.replace(/^~(?=\/|\\|$)/, host.home));
  if (!argv) {
    $.ui.toast(`Kann hier nicht öffnen: ${fileName(path)}`);
    return;
  }
  void $.process
    .run(argv, {} as never)
    .catch((err: unknown) =>
      $.ui.toast(`Öffnen fehlgeschlagen: ${String(err).split("\n")[0]}`),
    );
}

/** Loads the last plan sign-off kept in the store. */
export async function loadPlanApproval($: EngineInterface): Promise<void> {
  const kept = (await $.store.get(PLAN_KEY)) as PlanApproval | undefined;
  if (kept && typeof kept === "object" && typeof kept.at === "number")
    await patchCheck($, (c) => (c.plan ? {} : { plan: kept }));
}

/** The newest pnp-architekt run (the plan the pane offers for sign-off). */
export function latestPlanRun(runs: AgentRun[]): AgentRun | undefined {
  return [...runs].reverse().find((r) => r.agent === "pnp-architekt");
}

/**
 * Do two records name the same build: the same campaign in the same Studio profile? A side that does not know its
 * profile (a record from before 0.6.2, or the Studio could not say) matches any profile.
 */
export function sameBuild(
  a: { campaign?: string; profile?: string },
  profile: string,
  campaign: string,
): boolean {
  return (
    (a.campaign ?? "") === campaign &&
    (!a.profile || !profile || a.profile === profile)
  );
}

/** The runs of the build on this profile and campaign (all runs while no campaign is known). */
export function runsOf(
  runs: AgentRun[],
  profile: string,
  campaign: string,
): AgentRun[] {
  return campaign
    ? runs.filter((r) => !r.campaign || sameBuild(r, profile, campaign))
    : runs;
}

/** Is this plan run signed off (the same plan file, after the run, in the run's campaign and profile)? */
export function isApproved(run: AgentRun, plan: PlanApproval | null): boolean {
  return (
    !!plan &&
    plan.file === (run.planFile ?? "") &&
    plan.at >= (run.endedAt ?? run.startedAt) &&
    (!run.campaign ||
      !plan.campaign ||
      sameBuild(plan, run.profile ?? "", run.campaign))
  );
}

/**
 * Forgets the kept build of one campaign (in a profile) or of a whole profile: a campaign made anew, removed or a
 * profile made anew or deleted starts at 0 instead of inheriting the build of an older one with the same name.
 * Records without a profile (before 0.6.2) go with their campaign's name. Returns how many runs went.
 */
export async function forgetBuild(
  $: EngineInterface,
  which: { profile: string; campaign?: string },
): Promise<number> {
  const hit = (a: { campaign?: string; profile?: string }) =>
    which.campaign !== undefined
      ? sameBuild(a, which.profile, which.campaign)
      : !!which.profile && a.profile === which.profile;
  const before = await readRuns($);
  const kept = before.filter((r) => !hit(r));
  if (kept.length !== before.length) {
    await patchRuns($, () => kept);
    await saveRuns($, kept);
  }
  const plan = (await readCheck($)).plan;
  if (plan && hit(plan)) {
    await patchCheck($, () => ({ plan: null }));
    await $.store.delete(PLAN_KEY);
  }
  if (kept.length !== before.length) await applyLook($);
  return before.length - kept.length;
}

/** A campaign renamed in its profile keeps its build under the new name. */
export async function renameBuild(
  $: EngineInterface,
  profile: string,
  from: string,
  to: string,
): Promise<void> {
  if (!from || !to || from === to) return;
  const moved = (await readRuns($)).map((r) =>
    sameBuild(r, profile, from) ? { ...r, campaign: to } : r,
  );
  await saveRuns($, await patchRuns($, () => moved));
  const plan = (await readCheck($)).plan;
  if (plan && sameBuild(plan, profile, from)) {
    const next = { ...plan, campaign: to };
    await patchCheck($, () => ({ plan: next }));
    await $.store.set(PLAN_KEY, next);
  }
}

/** The prompt the plan's sign-off sends: German, names the campaign, and asks Claude to confirm it before writing. */
export function approvalPrompt(file: string, campaign: string): string {
  const where = campaign ? ` für die Kampagne „${campaign}“` : "";
  return (
    `Ich habe den Bauplan des Architekten${file ? ` (${file})` : ""}${where} im D&D-Panel abgesegnet. ` +
    `Bau damit weiter, als Nächstes schreibt der Texter die Szenen. ` +
    `Sag mir vor dem ersten Schreibaufruf, in welche Kampagne du schreibst${campaign ? ` (sie muss „${campaign}“ sein)` : ""}, und warte auf mein Ja.`
  );
}

/**
 * The person signs the plan off (the pane asked first: "In ‚<Kampagne>‘ weiterbauen?"): recorded, and the main
 * thread is told to go on building in that campaign. Runs as the producer of the button's `askClaude`, so a second
 * press while the first is on its way records nothing twice. Returns the prompt.
 */
export async function approvePlan(
  $: EngineInterface,
  run: AgentRun,
  campaign = "",
): Promise<string> {
  const plan: PlanApproval = {
    file: run.planFile ?? "",
    campaign: run.campaign || campaign,
    profile: run.profile || (await profileName($)),
    at: await $.clock.now(),
  };
  await patchCheck($, () => ({ plan }));
  await $.store.set(PLAN_KEY, plan);
  return approvalPrompt(plan.file, plan.campaign ?? "");
}

/** Toast of the plan's sign-off (the kit adds „ – kommt nach der laufenden Antwort.“ while Claude is busy). */
export const PLAN_TOAST = "✓ Bauplan abgesegnet – an Claude geschickt.";

/** Forgets the build's kept state: the agent runs and the plan's sign-off (pane and store). */
export async function resetBuild($: EngineInterface): Promise<void> {
  await patchRuns($, () => []);
  await $.store.delete(STORE_KEY);
  await patchCheck($, () => ({ plan: null }));
  await $.store.delete(PLAN_KEY);
  $.ui.toast("✓ Bau-Stand zurückgesetzt");
  await applyLook($);
}

/** Loads the runs kept from earlier sessions (marks those still "running" as failed: their session is gone). */
export async function loadRuns($: EngineInterface): Promise<void> {
  const kept = await $.store.get(STORE_KEY);
  if (!Array.isArray(kept)) return;
  await patchRuns($, (now) =>
    now.length
      ? now
      : (kept as AgentRun[]).map((r) =>
          r.state === "running" ? { ...r, state: "failed" } : r,
        ),
  );
}

async function saveRuns($: EngineInterface, runs: AgentRun[]): Promise<void> {
  await $.store.set(STORE_KEY, runs);
}

/** Records a started pnp-* agent. */
export async function recordSpawn(
  $: EngineInterface,
  subagentType: string,
  agentId: string | undefined,
  prompt: string,
): Promise<void> {
  const agent = pnpAgentOf(subagentType);
  if (!agent) return;
  const campaign = await campaignName($);
  const profile = await profileName($);
  const run: AgentRun = {
    id: agentId || `${agent}-${await $.clock.now()}`,
    agent,
    campaign,
    profile,
    state: "running",
    startedAt: await $.clock.now(),
    findingsFile: /review|nachbesserer/.test(agent)
      ? findingsPathOf(prompt)
      : undefined,
    planFile: agent === "pnp-architekt" ? planPathOf(prompt) : undefined,
  };
  await saveRuns($, await patchRuns($, (runs) => [...runs, run]));
  await applyLook($);
  if (PIPELINE.some((p) => p.agents.includes(agent)))
    await autoOpen($, "build");
}

/** Marks an agent's run finished and counts its findings file. */
export async function recordEnd(
  $: EngineInterface,
  agentId: string,
  failed: boolean,
): Promise<AgentRun | undefined> {
  const runs = await readRuns($);
  const run = runs.find((r) => r.id === agentId && r.state === "running");
  if (!run) return undefined;
  let findings: number | undefined;
  if (run.findingsFile) {
    const host = await createHost($);
    const text = await host.readText(run.findingsFile.replace(/^~/, host.home));
    if (text !== undefined) findings = countFindings(text);
  }
  const endedAt = await $.clock.now();
  await saveRuns(
    $,
    await patchRuns($, (list) =>
      list.map((r) =>
        r.id === agentId
          ? { ...r, state: failed ? "failed" : "done", endedAt, findings }
          : r,
      ),
    ),
  );
  await applyLook($);
  return run;
}

let recheck: Promise<void> | null = null;
let recheckAgain = false;

/**
 * After a build agent ended (done or failed): the acceptance check reads the campaign again, so the card shows what
 * the agent wrote. Only while the Build tab is open and was checked before (on the run's campaign); runs ending while
 * a check is reading coalesce into one more check after it, never one per agent. Never throws (it runs detached).
 */
export async function recheckAfterRun(
  $: EngineInterface,
  run: AgentRun,
): Promise<void> {
  try {
    if ((await readTab($)) !== "build") return;
    const checked = await readCampaign($);
    if (!checked) return;
    if (run.campaign && checked.name && run.campaign !== checked.name) return;
    if (recheck) {
      recheckAgain = true;
      return await recheck;
    }
    recheck = (async () => {
      do {
        recheckAgain = false;
        await refreshCampaign($);
      } while (recheckAgain);
    })().finally(() => {
      recheck = null;
    });
    await recheck;
  } catch {
    // the session may be gone; the next "Neu laden" reads again
  }
}

/** "1 Szene · 2 NPCs · 0 Orte": the campaign's head counts in singular or plural. */
export function headCounts(c: { scenes: number; npcs: number; places: number }): string {
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  return [
    n(c.scenes, "Szene", "Szenen"),
    n(c.npcs, "NPC", "NPCs"),
    n(c.places, "Ort", "Orte"),
  ].join(" · ");
}

function count(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.count === "number") return o.count;
    return Object.keys(o).length;
  }
  return 0;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message.split("\n")[0]! : String(err);
}

/** The lists the acceptance check reads in full (acceptanceOf: picture, text, notes, map, voice, sheet ...). */
const CHECK_LISTS = [
  ["scenes", "title"],
  ["places", "name"],
  ["npcs", "name"],
] as const;
/** At most this many entries per `names` read when a whole list is too big for one answer. */
const NAMES_PER_READ = 8;
/**
 * At most this many characters of entries (the overview's `chars`) per `names` read. An entry's JSON is about twice
 * its `chars` (variants, sounds, files), and every answer repeats the campaign's summary and threads (~8k), so 25k
 * keeps a read well under the engine's cut at 100 000 characters; a read cut anyway is halved.
 */
const CHARS_PER_READ = 25_000;
/** A list whose entries' `chars` add up to more than this is never read whole (its JSON is about twice that). */
const WHOLE_READ_MAX = 40_000;

/** The overview's rows of one list in reads of at most NAMES_PER_READ entries and CHARS_PER_READ characters. */
function readGroups(rows: unknown[], key: string): string[][] {
  const groups: string[][] = [];
  let group: string[] = [];
  let size = 0;
  for (const e of rows) {
    const row = (e ?? {}) as Record<string, unknown>;
    const title = String(row[key] ?? "");
    if (!title) continue;
    const chars = typeof row.chars === "number" ? row.chars : 0;
    if (
      group.length &&
      (group.length >= NAMES_PER_READ || size + chars > CHARS_PER_READ)
    ) {
      groups.push(group);
      group = [];
      size = 0;
    }
    group.push(title);
    size += chars;
  }
  if (group.length) groups.push(group);
  return groups;
}

/**
 * Reads the entries `want` of one list by name into `rows`; a read that is cut, unreadable or misses one of them is
 * halved, down to one entry. False when a single entry still cannot be read.
 */
async function readByNames(
  $: EngineInterface,
  list: string,
  key: string,
  want: string[],
  rows: Map<string, unknown>,
): Promise<boolean> {
  let got: unknown;
  try {
    got = (await studioCall($, "campaign", { only: [list], names: want }))[list];
  } catch {
    got = undefined;
  }
  if (Array.isArray(got)) {
    const read = got.map((e) => (e ?? {}) as Record<string, unknown>);
    const titles = new Set(read.map((r) => String(r[key] ?? "")));
    if (want.every((t) => titles.has(t))) {
      for (const row of read) rows.set(String(row.n ?? row[key]), row);
      return true;
    }
  }
  if (want.length < 2) return false;
  const half = Math.ceil(want.length / 2);
  return (
    (await readByNames($, list, key, want.slice(0, half), rows)) &&
    readByNames($, list, key, want.slice(half), rows)
  );
}

/**
 * The overview's rows of one list. A big campaign's compact overview only counts its biggest lists (`truncated` names
 * them, the list itself is left out): then the rows come chapter by chapter (`countsByChapter`, each read with
 * `overview` and `chapter`, which also brings the entries of no chapter, so rows are kept by their n), or, without
 * chapters, from one overview of that list alone. An older Studio always answers the list.
 */
async function overviewRows(
  $: EngineInterface,
  base: Record<string, unknown>,
  list: string,
): Promise<unknown[]> {
  if (Array.isArray(base[list])) return base[list] as unknown[];
  if (!listCount(base, list)) return [];
  const byChapter = (base.countsByChapter ?? {}) as Record<string, Record<string, unknown>>;
  const chapters = Object.entries(byChapter)
    .filter(([ch, c]) => ch !== "-" && Number(c?.[list]) > 0 && Number.isFinite(Number(ch)))
    .map(([ch]) => Number(ch));
  const reads = chapters.length
    ? chapters.map((chapter) => ({ overview: true, only: [list], chapter }))
    : [{ overview: true, only: [list] }];
  const rows = new Map<string, unknown>();
  for (const args of reads) {
    const got = await studioCall($, "campaign", args).catch(() => ({}) as Record<string, unknown>);
    for (const e of Array.isArray(got[list]) ? (got[list] as unknown[]) : []) {
      const r = (e ?? {}) as Record<string, unknown>;
      rows.set(String(r.n ?? JSON.stringify(r)), e);
    }
  }
  return [...rows.values()];
}

/**
 * The open campaign for the check, read in parts: one whole `campaign get` of a big campaign is hundreds of KB, which
 * the engine cuts at its MCP output limit, so its JSON never parsed and every count read 0. The overview (names and
 * sizes) gives the name, threads, party_at and references; each checked list is read on its own (`only`), and a list
 * still too big is read a few entries at a time by name (by their sizes, halved when still cut). Throws when the
 * overview is no campaign; a list that cannot be read lands in `errors` and `unread`.
 */
async function readWholeCampaign(
  $: EngineInterface,
  errors: string[],
  unread: string[],
): Promise<Record<string, unknown>> {
  const base = await studioCall($, "campaign", { overview: true });
  if (!isCampaign(base))
    throw new Error(
      base.truncated
        ? "die Antwort des Studios war zu lang und wurde abgeschnitten"
        : `keine Kampagne in der Antwort: ${String(base.text ?? "").slice(0, 120)}`,
    );
  const out: Record<string, unknown> = { ...base };
  for (const [list, key] of CHECK_LISTS) {
    const listed = await overviewRows($, base, list);
    const chars = listed.reduce<number>((sum, e) => {
      const c = (e as Record<string, unknown> | null)?.chars;
      return sum + (typeof c === "number" ? c : 0);
    }, 0);
    // a list whose texts alone pass WHOLE_READ_MAX is always cut: read it by name at once
    const whole =
      chars > WHOLE_READ_MAX
        ? ({} as Record<string, unknown>)
        : await studioCall($, "campaign", { only: [list] }).catch(
            () => ({}) as Record<string, unknown>,
          );
    if (Array.isArray(whole[list])) {
      out[list] = whole[list];
      continue;
    }
    const rows = new Map<string, unknown>();
    let ok = true;
    for (const want of readGroups(listed, key))
      if (!(await readByNames($, list, key, want, rows))) {
        ok = false;
        break;
      }
    if (ok) out[list] = [...rows.values()];
    else {
      // the overview's rows still count; their details are unknown, so their rows are not checked
      if (listed.length) out[list] = listed;
      unread.push(list);
      errors.push(
        `Kampagne (${LIST_DE[list] ?? list}): Antwort zu groß oder unlesbar, diese Zeilen sind nicht geprüft`,
      );
    }
  }
  return out;
}

const LIST_DE: Record<string, string> = {
  scenes: "Szenen",
  npcs: "NPCs",
  places: "Orte",
};

/**
 * The acceptance check (a person's Check/Refresh): the open campaign, the map list and studio_status (GPU jobs), each
 * read once; the checklist rows come from pnp-kampagne §4.
 */
export async function refreshCampaign($: EngineInterface): Promise<void> {
  const now = await $.clock.now();
  let campaign: Record<string, unknown>;
  const errors: string[] = [];
  const unread: string[] = [];
  try {
    campaign = await readWholeCampaign($, errors, unread);
  } catch (err) {
    $.ui.toast(`✗ Kampagne nicht gelesen: ${errText(err)}`);
    // no stale counts beside the error: what was read before is not this answer
    await setCampaign($, null);
    await patchCheck($, () => ({
      error: `Kampagne nicht gelesen: ${errText(err)}`,
      items: [],
      checkedAt: now,
    }));
    return;
  }
  const info: CampaignInfo = {
    name:
      typeof campaign.open === "string"
        ? campaign.open
        : typeof campaign.name === "string"
          ? campaign.name
          : "",
    scenes: listCount(campaign, "scenes"),
    npcs: listCount(campaign, "npcs"),
    places: listCount(campaign, "places"),
    broken: count(campaign.brokenReferences),
    fetchedAt: now,
  };
  await setCampaign($, info);
  let maps: Record<string, unknown> = {};
  try {
    maps = await studioCall($, "map", { action: "list" });
  } catch (err) {
    errors.push(`Kartenliste: ${errText(err)}`);
  }
  try {
    const status = await studioCall($, "studio_status", {});
    await noteStudioStatus($, status);
    await noteProfile($, status);
  } catch (err) {
    errors.push(`Studio-Zustand: ${errText(err)}`);
  }
  const live = await readLive($);
  await patchCheck($, () => ({
    items: acceptanceOf(campaign, maps, live.prepared, unread),
    checkedAt: now,
    error: errors.join(" · "),
  }));
}

/**
 * The one previewed file as the preview atom keeps it: the row that opened it on the first line (two runs may name
 * the same file), the file's text after it. So only that row unfolds.
 */
export function previewOf(raw: string): { row: string; text: string } {
  const cut = raw.indexOf("\n");
  return cut < 0
    ? { row: raw, text: "" }
    : { row: raw.slice(0, cut), text: raw.slice(cut + 1) };
}

/** Shows the start of a plan or findings file under the row `row`, or folds it when that row shows it. */
export async function togglePreview(
  $: EngineInterface,
  path: string,
  row = path,
): Promise<void> {
  if (previewOf(await readPreview($)).row === row) return setPreview($, "");
  const host = await createHost($);
  const text = await host.readText(path.replace(/^~/, host.home));
  await setPreview($, `${row}\n${text ?? `Nicht lesbar: ${fileName(path)}`}`);
}

export function registerBuild(on: On): void {
  on("agent.spawn", async ($, e, next) => {
    const r = await next(e);
    try {
      if (!("deny" in r && r.deny)) {
        // The listener runs at every answer of the evening: the evening tracks it, not the build.
        if (pnpAgentOf(e.subagentType) === LISTENER_AGENT)
          await noteListenerSpawn($, r.agentId);
        else await recordSpawn($, e.subagentType, r.agentId, e.prompt);
      }
    } catch {
      // tracking never blocks an agent
    }
    return r;
  });
  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    try {
      if (
        e.agentId &&
        (await noteListenerEnd(
          $,
          e.agentId,
          e.answer,
          e.reason === "error" || e.reason === "aborted",
        ))
      ) {
        // the listener's return is read; it is no build run
      } else if (e.agentId) {
        const ended = await recordEnd(
          $,
          e.agentId,
          e.reason === "error" || e.reason === "aborted",
        );
        if (ended) void recheckAfterRun($, ended);
      }
      // The main thread's turn: at a live table it must leave a watcher running.
      else if (e.reason === "answer") await noteTurnEnd($);
    } catch {
      // ignore
    }
    try {
      // kit „ask Claude“: the end of the turn that carried a sent prompt answers it (subagent turns are skipped)
      await askTurnComplete($, e);
    } catch {
      // the lock falls back to its timeout
    }
    return r;
  });
}

/** "Offene Punkte beheben": asks Claude to start the named agent for every open item. */
export function fixPrompt(open: AcceptItem[]): string {
  const lines = open
    .filter((it) => it.fix)
    .map(
      (it) =>
        `- ${it.label} (${it.counts})${it.detail ? `: ${it.detail}` : ""} → ${agentLabel(it.fix)} (${it.fix.replace(/\s*\(.*\)$/, "")})`,
    );
  return [
    "Abnahme-Check im D&D-Panel: diese Punkte sind offen. Lass sie von den genannten Agenten beheben (Kampagnen-Anleitung, Abschnitt Nachbessern) und prüfe danach neu:",
    ...lines,
  ].join("\n");
}

/**
 * What a row of a plan or findings file offers: „↗ Öffnen“ (the system's viewer) and „Details“, which unfolds the
 * file's start under this row. One file is previewed at a time; only its row reads „Schließen“.
 */
function fileParts(
  $: EngineInterface,
  k: Kit,
  key: string,
  path: string,
  shown: { row: string; text: string },
): Pick<ListRowProps, "actions" | "details" | "open" | "onToggle"> {
  return {
    actions: [
      openAction(k, {
        key: `${key}-open`,
        onPress: () => void openFile($, path),
      }),
    ],
    details: () => [
      LogBox(k, { key: `${key}-preview`, lines: shown.text.split("\n") }),
    ],
    open: shown.row === key,
    onToggle: () => void togglePreview($, path, key),
  };
}

const STAGE_DE: Record<string, string> = {
  Lore: "Welt-Notizen abgleichen",
  Plan: "Bauplan",
  Texts: "Texte und Welt-Effekte",
  Pictures: "Bilder und Schleifen",
  Sounds: "Klänge und Stimmungsmusik",
  Voices: "Stimmen und Tiefenkarten",
  Review: "Abnahme und drei Prüfungen",
  Fixes: "Nachbessern",
};

/** The pill of a check row: its state in one word (who fixes it stands behind „Details“). */
function checkPill(it: AcceptItem): PillProps | undefined {
  if (it.status === "failed") return { text: "fehlt", tone: "bad", glyph: false };
  if (it.status === "warning") return { text: "offen", tone: "warn", glyph: false };
  if (it.status === "idle" && it.fix)
    return { text: "offen", tone: "neutral", glyph: false };
  return undefined;
}

export async function renderBuild(
  $: EngineInterface,
  k: Kit,
  d: {
    runs: AgentRun[];
    campaign: CampaignInfo | null;
    live: TableLive;
    rules: Rules;
    check: BuildCheck;
  },
): Promise<RenderElement[]> {
  const { runs, campaign, live, rules, check } = d;
  const shown = previewOf(await readPreview($));
  // the campaign's name stands in the pane's header only; here it is asked for in the two-step questions
  const campName = campaign?.name || (await campaignName($));
  const mine = runsOf(runs, live.profile, campaign?.name ?? "");
  const out: RenderElement[] = [];
  // GPU: the Studio paints, speaks and makes sounds one job after another. Its state is a row of the progress card.
  const gpu = check.gpu;
  const gpuRunning = mine.filter(
    (r) => r.state === "running" && GPU_AGENTS.includes(r.agent),
  );
  const gpuBusy = !!gpu && gpu.running + gpu.queued > 0;
  const gpuRows =
    gpu || gpuRunning.length
      ? [
          ListRow(k, {
            key: "gpu",
            status: !gpu ? "idle" : gpuBusy ? "running" : "ok",
            title: "GPU",
            meta: [
              gpuBusy ? `${gpu.running} läuft, ${gpu.queued} warten` : "",
              gpuBusy ? gpu.doing : "",
              gpuBusy && gpu.progress !== null ? `${gpu.progress} %` : "",
              gpu?.busyNote ?? "",
            ]
              .filter(Boolean)
              .join(" · "),
            pill: !gpu
              ? { text: "nicht geprüft", tone: "neutral", glyph: false }
              : gpuBusy
                ? { text: "belegt", tone: "info", glyph: false }
                : { text: "frei", tone: "ok", glyph: false },
          }),
        ]
      : [];
  // Progress with an estimate on top: the whole build and each GPU step (x von N, bar, time left, local clock).
  const progress = renderProgress(
    k,
    await readBuildProgress($),
    await $.clock.now(),
    undefined,
    {
      rows: gpuRows,
      status:
        gpuRunning.length > 1
          ? {
              text: `${gpuRunning.map((r) => agentLabel(r.agent)).join(" + ")} teilen sich gerade die GPU`,
              tone: "warn",
            }
          : undefined,
    },
  );
  if (progress) out.push(progress);
  const steps = PIPELINE.map((p) => {
    const st = stageState(mine, p.agents);
    const findings = mine
      .filter((r) => p.agents.includes(r.agent) && r.findings !== undefined)
      .slice(-p.agents.length)
      .reduce((n, r) => n + (r.findings ?? 0), 0);
    const running = mine.filter(
      (r) => p.agents.includes(r.agent) && r.state === "running",
    );
    return {
      key: `stage-${p.stage}`,
      title: `${STAGE_DE[p.stage] ?? p.stage}${p.stage === "Review" && st !== "idle" ? ` · ${findings} Mängel` : ""}`,
      detail: running.length
        ? `${running.map((r) => agentLabel(r.agent)).join(", ")} ${running.length > 1 ? "arbeiten" : "arbeitet"}`
        : agentLabel(p.agents.join(", ")),
      state: (st === "idle"
        ? "todo"
        : st === "running"
          ? "active"
          : st === "failed"
            ? "failed"
            : "done") as StepState,
    };
  });
  const rounds = reviewRounds(mine);
  out.push(
    Card(k, {
      key: "pipeline",
      title: {
        icon: "hammer",
        title: "Bau-Abschnitte",
        subtitle: rounds ? `Prüfrunde ${rounds} von 3` : undefined,
        count: `${steps.filter((x) => x.state === "done").length} von ${steps.length}`,
      },
      children: [Stepper(k, { key: "stages", steps })],
    }),
  );
  const planRun = latestPlanRun(mine);
  // a run kept from before 0.12.2 may name a skill reference as its plan (…/references/sprechen.md): no plan card then
  if (planRun && !/[\\/](references|skills|agents)[\\/]/i.test(planRun.planFile ?? "")) {
    // the build went on after the plan (texts, pictures, sounds, reviews): the plan was taken, also without the button
    const planEnd = planRun.endedAt ?? planRun.startedAt;
    const approved =
      isApproved(planRun, check.plan) ||
      mine.some((r) => r.agent !== "pnp-architekt" && r.startedAt > planEnd);
    const file = planRun.planFile;
    out.push(
      Card(k, {
        key: "plan",
        title: {
          icon: "scroll",
          title: "Bauplan",
          pill:
            planRun.state === "running"
              ? { text: "entsteht", tone: "info" }
              : planRun.state === "failed"
                ? { text: "gescheitert", tone: "bad" }
                : approved
                  ? { text: "abgesegnet", tone: "ok" }
                  : { text: "wartet auf Freigabe", tone: "warn" },
        },
        children: file
          ? [
              ListRow(k, {
                key: "plan-row",
                icon: "scroll",
                title: fileName(file),
                meta:
                  approved && check.plan?.at
                    ? localDateTime(check.plan.at)
                    : "",
                // the plan's text tells the story: hidden while the person plays along
                ...(planRun.state === "done" && !rules.spoilerSafe
                  ? fileParts($, k, "plan", file, shown)
                  : {}),
              }),
            ]
          : [],
        empty:
          planRun.state === "running"
            ? "Der Architekt schreibt noch."
            : "Der Architekt hat keine Plan-Datei genannt.",
        actions:
          planRun.state === "done" &&
          (!approved || isAsked(k.asked, "plan-approve"))
            ? {
                // stays with a pill „geschickt“ until Claude answered the sign-off
                primary: personAsk(
                  $,
                  k,
                  {
                    key: "plan-approve",
                    label: "Bauplan absegnen",
                    variant: "primary",
                    text: () => approvePlan($, planRun, campName),
                    toast: PLAN_TOAST,
                  },
                  {
                    confirm: `In „${planRun.campaign || campName || "die offene Kampagne"}“ weiterbauen?`,
                  },
                ),
              }
            : undefined,
      }),
    );
  }
  // An empty list is not drawn: before the first agent there is nothing to say here.
  if (mine.length)
    out.push(
      Card(k, {
        key: "runs",
        title: { icon: "list", title: "Agenten", count: mine.length },
        children: mine.slice(-8).map((r) =>
          ListRow(k, {
            key: `run-${r.id}`,
            status:
              r.state === "running"
                ? "running"
                : r.state === "failed"
                  ? "failed"
                  : "ok",
            title: agentLabel(r.agent),
            meta:
              r.findings !== undefined
                ? `${r.findings} ${r.findings === 1 ? "Mangel" : "Mängel"}`
                : "",
            // the findings file belongs to the run's own row (no second row per file)
            ...(r.findingsFile && r.state !== "running" && !rules.spoilerSafe
              ? fileParts($, k, `run-${r.id}`, r.findingsFile, shown)
              : {}),
          }),
        ),
      }),
    );
  const open = check.items.filter(
    (it) => it.status === "failed" || it.status === "warning",
  );
  // A part of the campaign could not be read: its rows are not checked, and the fix waits for a full check.
  const unchecked = check.items.filter((it) => it.unchecked);
  const canFix = !unchecked.length && open.some((it) => it.fix);
  const family = isProtectedProfile(live.profile)
    ? `Profil „${live.profile}“ ist geschützt: Schreiben wird abgelehnt.`
    : "";
  // One status: the read's error (it names the parts that were not read) before the profile's refusal.
  const checkStatus: StatusInfo | undefined = check.error
    ? { text: check.error, tone: "bad" }
    : campaign && family
      ? { text: family, tone: "warn" }
      : undefined;
  const stacked = k.graphical && k.narrow;
  const checkActs: { primary?: Action; secondary: Action[] } = {
    secondary: [],
  };
  if (canFix || isAsked(k.asked, "check-fix"))
    // two steps, like the plan's sign-off: the agents write straight into this campaign
    checkActs.primary = personAsk(
      $,
      k,
      {
        key: "check-fix",
        label: "Offene Punkte beheben",
        icon: "wand",
        variant: "primary",
        text: fixPrompt(open),
      },
      { confirm: `In „${campName || "die offene Kampagne"}“ beheben lassen?` },
    );
  if (mine.length || check.plan)
    checkActs.secondary.push({
      key: "build-reset",
      label: "Bau-Stand zurücksetzen",
      variant: "secondary",
      danger: true,
      confirm: "Agenten-Läufe und Freigabe des Bauplans vergessen?",
      confirmWord: "Zurücksetzen",
      onPress: () => void resetBuild($),
    });
  out.push(
    Card(k, {
      key: "check",
      title: {
        icon: campaign && (open.length || unchecked.length) ? "alert" : "check",
        tone: campaign && open.length ? "bad" : undefined,
        title: "Abnahme-Check",
        subtitle: campaign ? headCounts(campaign) : undefined,
        pill: campaign
          ? open.length
            ? { text: `${open.length} offen`, tone: "bad" }
            : unchecked.length
              ? { text: `${unchecked.length} nicht geprüft`, tone: "neutral" }
              : check.items.length
                ? { text: "alles da", tone: "ok" }
                : undefined
          : undefined,
      },
      children: campaign
        ? check.items.map((it) => {
            const facts = [
              !rules.spoilerSafe && it.detail
                ? { label: "Betrifft", value: it.detail }
                : null,
              it.fix
                ? {
                    label: it.status === "idle" ? "Startet" : "Behebt",
                    value: agentLabel(it.fix),
                  }
                : null,
            ].filter((x): x is { label: string; value: string } => !!x);
            return ListRow(k, {
              key: `chk-${it.key}`,
              status: it.status,
              // a narrow wrapping row has no place for the meta (kit): the count then stays in the title
              title: stacked ? `${it.label} · ${it.counts}` : it.label,
              wrap: true,
              meta: stacked ? "" : it.counts,
              pill: checkPill(it),
              details: facts.length
                ? () => [
                    KeyValue(k, {
                      key: `chk-${it.key}-facts`,
                      bare: true,
                      rows: facts,
                    }),
                  ]
                : undefined,
            });
          })
        : [],
      // the pane's header re-reads the campaign („Neu laden“): the card has no reload of its own
      empty: check.error ? undefined : "Die offene Kampagne ist noch nicht gelesen.",
      status: checkStatus,
      actions: checkActs,
    }),
  );
  return out;
}
