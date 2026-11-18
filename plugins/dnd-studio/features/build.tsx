/**
 * Build mode (pnp-kampagne): which pnp-* agents ran for the campaign (agent.spawn / turn.complete), the reviewers'
 * findings counts from their Mängel files, and a live acceptance checklist from the campaign overview.
 */
import type { EngineInterface, On, RenderElement } from "claude-code";

import {
  LISTENER_AGENT,
  noteListenerEnd,
  noteListenerSpawn,
  noteStudioStatus,
  noteTurnEnd,
  submitForPerson,
} from "./evening";
import { autoOpen } from "./dnd-ui";
import { applyLook } from "./look";
import { createHost } from "../lib/host";
import {
  acceptanceOf,
  countFindings,
  findingsPathOf,
  PIPELINE,
  agentLabel,
  pnpAgentOf,
  reviewRounds,
  localDateTime,
  stageState,
} from "../lib/model";
import {
  campaignName,
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
} from "../lib/state";
import { isCampaign, studioCall } from "../lib/studio";
import {
  Actions,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  ListRow,
  LogBox,
  Row,
  Section,
  Sentence,
  Stepper,
} from "../lib/ui";
import type { Kit, StepState } from "../lib/ui";
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

/** Is this plan run signed off? */
export function isApproved(run: AgentRun, plan: PlanApproval | null): boolean {
  return (
    !!plan &&
    plan.file === (run.planFile ?? "") &&
    plan.at >= (run.endedAt ?? run.startedAt)
  );
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
 * thread is told to go on building in that campaign.
 */
export async function approvePlan(
  $: EngineInterface,
  run: AgentRun,
  campaign = "",
): Promise<void> {
  const plan: PlanApproval = {
    file: run.planFile ?? "",
    campaign: run.campaign || campaign,
    at: await $.clock.now(),
  };
  await patchCheck($, () => ({ plan }));
  await $.store.set(PLAN_KEY, plan);
  $.ui.toast("✓ Bauplan abgesegnet");
  await submitForPerson($, approvalPrompt(plan.file, plan.campaign ?? ""));
}

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
  const run: AgentRun = {
    id: agentId || `${agent}-${await $.clock.now()}`,
    agent,
    campaign,
    state: "running",
    startedAt: await $.clock.now(),
    findingsFile: /review|nachbesserer/.test(agent)
      ? findingsPathOf(prompt)
      : undefined,
    planFile: agent === "pnp-architekt" ? findingsPathOf(prompt) : undefined,
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
    // the session may be gone; the next "Neu prüfen" reads again
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
    const listed = Array.isArray(base[list]) ? (base[list] as unknown[]) : [];
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
    for (const want of readGroups(
      Array.isArray(base[list]) ? base[list] : [],
      key,
    ))
      if (!(await readByNames($, list, key, want, rows))) {
        ok = false;
        break;
      }
    if (ok) out[list] = [...rows.values()];
    else {
      // the overview's rows still count; their details are unknown, so their rows are not checked
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
    scenes: count(campaign.scenes),
    npcs: count(campaign.npcs),
    places: count(campaign.places),
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
    await noteStudioStatus($, await studioCall($, "studio_status", {}));
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

/** Shows (or hides) the start of a findings file in the pane. */
export async function togglePreview(
  $: EngineInterface,
  path: string,
): Promise<void> {
  if (await readPreview($)) return setPreview($, "");
  const host = await createHost($);
  const text = await host.readText(path.replace(/^~/, host.home));
  await setPreview($, text ?? `Cannot read ${path}`);
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
    return r;
  });
}

/** "Offene Punkte beheben lassen": asks Claude to start the named agent for every open item. */
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

async function fixOpen($: EngineInterface, open: AcceptItem[]): Promise<void> {
  await submitForPerson($, fixPrompt(open));
}

/** The check's error line with "Erneut versuchen" as a real (secondary) button below it, not bare text. */
function checkError(k: Kit, $: EngineInterface, message: string): RenderElement {
  const { Box } = k;
  return (
    <Box key="check-err-box" flexDirection="column" gap={1}>
      {ErrorState(k, { key: "check-err", message })}
      {Actions(k, "check-err-acts", [
        {
          key: "check-err-retry",
          label: k.s.retry,
          icon: "refresh",
          variant: "secondary",
          onPress: () => void refreshCampaign($),
        },
      ])}
    </Box>
  );
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
  const preview = await readPreview($);
  const campName = campaign?.name || (await campaignName($));
  const mine = campaign?.name
    ? runs.filter((r) => !r.campaign || r.campaign === campaign.name)
    : runs;
  const out: RenderElement[] = [];
  // GPU: the Studio paints, speaks and makes sounds one job after another.
  const gpu = check.gpu;
  const gpuRunning = mine.filter(
    (r) => r.state === "running" && GPU_AGENTS.includes(r.agent),
  );
  out.push(
    Row(k, {
      key: "gpu",
      status: !gpu ? "idle" : gpu.running || gpu.queued ? "running" : "ok",
      primary: !gpu
        ? "GPU: noch nicht geprüft"
        : gpu.running || gpu.queued
          ? `GPU belegt · ${gpu.running} läuft, ${gpu.queued} warten${gpu.doing ? ` · macht gerade: ${gpu.doing}` : ""}${gpu.progress !== null ? ` ${gpu.progress}%` : ""}`
          : "GPU frei",
      secondary:
        gpu?.busyNote || "Bilder, Klänge und Stimmen werden nacheinander gemacht",
    }),
  );
  if (gpuRunning.length > 1)
    out.push(
      Row(k, {
        key: "gpu-clash",
        status: "warning",
        primary: `${gpuRunning.map((r) => agentLabel(r.agent)).join(" + ")} teilen sich gerade die GPU`,
        secondary: "erst einen fertig werden lassen",
      }),
    );
  const STAGE_DE: Record<string, string> = {
    Lore: "Welt-Notizen abgleichen",
    Plan: "Bauplan",
    Texts: "Texte",
    Pictures: "Bilder",
    Sounds: "Klänge",
    Voices: "Stimmen vorbereiten",
    Review: "Abnahme und drei Prüfungen",
    Fixes: "Nachbessern",
  };
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
  out.push(
    Card(k, {
      key: "pipeline",
      children: [
        CardTitle(k, {
          icon: "hammer",
          title: campName ? `Bau-Abschnitte · ${campName}` : "Bau-Abschnitte",
          count: `${steps.filter((x) => x.state === "done").length} von ${steps.length} · Prüfrunde ${reviewRounds(mine)}/3`,
        }),
        Stepper(k, { key: "stages", steps }),
      ],
    }),
  );
  const planRun = latestPlanRun(mine);
  if (planRun) {
    const approved = isApproved(planRun, check.plan);
    out.push(
      Section(k, {
        key: "plan",
        title: "Bauplan",
        count: approved
          ? "abgesegnet"
          : planRun.state === "running"
            ? "entsteht"
            : "",
        children: [
          Row(k, {
            key: "plan-row",
            status:
              planRun.state === "running"
                ? "running"
                : planRun.state === "failed"
                  ? "failed"
                  : approved
                    ? "ok"
                    : "warning",
            primary:
              planRun.state === "running"
                ? "Der Architekt schreibt den Bauplan …"
                : planRun.state === "failed"
                  ? "Der Architekt ist gescheitert: neu starten"
                  : approved
                    ? `Bauplan abgesegnet${check.plan?.at ? ` ${localDateTime(check.plan.at)}` : ""}`
                    : "Bauplan wartet auf deine Freigabe",
            secondary: [
              planRun.campaign || campName
                ? `Kampagne: ${planRun.campaign || campName}`
                : "",
              planRun.planFile ? fileName(planRun.planFile) : "",
            ]
              .filter(Boolean)
              .join(" · "),
            actions:
              planRun.state === "done" && !approved
                ? [
                    {
                      key: "plan-approve",
                      label: "Bauplan absegnen",
                      primary: true,
                      confirm: `In „${planRun.campaign || campName || "die offene Kampagne"}“ weiterbauen?`,
                      onPress: () => void approvePlan($, planRun, campName),
                    },
                    ...(planRun.planFile && !rules.spoilerSafe
                      ? [
                          {
                            key: "plan-open",
                            label: "Öffnen",
                            onPress: () => void openFile($, planRun.planFile!),
                          },
                          {
                            key: "plan-show",
                            label: preview ? "Ausblenden" : "Zeigen",
                            onPress: () =>
                              void togglePreview($, planRun.planFile!),
                          },
                        ]
                      : []),
                  ]
                : [],
          }),
        ],
      }),
    );
  }
  const files = mine.filter((r) => r.findingsFile).slice(-4);
  out.push(
    Section(k, {
      key: "runs",
      title: "Agenten",
      count: mine.length,
      collapsible: true,
      children: mine.length
        ? [
            ...mine.slice(-8).map((r) =>
              Row(k, {
                key: `run-${r.id}`,
                status:
                  r.state === "running"
                    ? "running"
                    : r.state === "failed"
                      ? "failed"
                      : "ok",
                primary: `${agentLabel(r.agent)}${r.findings !== undefined ? ` · ${r.findings} Mängel` : ""}`,
                secondary: r.findingsFile ? fileName(r.findingsFile) : "",
              }),
            ),
            ...files.map((r) =>
              Row(k, {
                key: `file-${r.id}`,
                glyph: "›",
                primary: `Mängel: ${agentLabel(r.agent)}`,
                dim: true,
                actions: rules.spoilerSafe
                  ? []
                  : [
                      {
                        key: `open-${r.id}`,
                        label: "Öffnen",
                        onPress: () => void openFile($, r.findingsFile!),
                      },
                      {
                        key: `show-${r.id}`,
                        label: preview ? "Ausblenden" : "Zeigen",
                        onPress: () => void togglePreview($, r.findingsFile!),
                      },
                    ],
              }),
            ),
            preview && !rules.spoilerSafe
              ? LogBox(k, { key: "preview", lines: preview.split("\n") })
              : null,
          ].filter((x): x is RenderElement => !!x)
        : [EmptyState(k, "Noch kein Agent gelaufen.")],
    }),
  );
  const open = check.items.filter(
    (it) => it.status === "failed" || it.status === "warning",
  );
  // A part of the campaign could not be read: its rows are not checked, and the fix waits for a full check.
  const unchecked = check.items.filter((it) => it.unchecked);
  const canFix = !unchecked.length && open.some((it) => it.fix);
  out.push(
    Card(k, {
      key: "check",
      children: [
        CardTitle(k, {
          icon:
            campaign && (open.length || unchecked.length) ? "alert" : "check",
          tone: campaign && open.length ? "bad" : undefined,
          title: "Abnahme-Check",
          pill: campaign
            ? open.length
              ? { text: `${open.length} offen`, tone: "bad" }
              : unchecked.length
                ? { text: `${unchecked.length} nicht geprüft`, tone: "neutral" }
                : check.items.length
                  ? { text: "alles da", tone: "ok" }
                  : undefined
            : undefined,
          count: campName,
        }),
        ...(campaign
          ? [
              Sentence(
                k,
                headCounts(campaign),
                { faint: true },
              ),
              check.error ? checkError(k, $, check.error) : null,
              ...check.items.map((it) =>
                ListRow(k, {
                  key: `chk-${it.key}`,
                  status: it.status,
                  title: `${it.label} · ${it.counts}`,
                  wrap: true,
                  meta: rules.spoilerSafe ? "" : it.detail,
                  pill: it.fix
                    ? {
                        text: `${it.status === "idle" ? "starten" : "beheben"}: ${agentLabel(it.fix)}`,
                        tone: it.status === "idle" ? "neutral" : "info",
                        glyph: false,
                      }
                    : undefined,
                }),
              ),
              /meine familie/i.test(live.profile)
                ? ErrorState(k, {
                    key: "family",
                    message:
                      "Profil „Meine Familie“ ist offen: Schreiben wird abgelehnt.",
                  })
                : null,
              unchecked.length && open.some((it) => it.fix)
                ? Sentence(
                    k,
                    "„Offene Punkte beheben lassen“ ist gesperrt, bis jeder Teil der Kampagne gelesen ist: „Neu prüfen“ versucht es noch einmal.",
                    { faint: true },
                  )
                : canFix
                  ? Sentence(
                    k,
                    `„Offene Punkte beheben lassen“ bittet Claude, ${agentLabel(open.map((it) => it.fix).filter(Boolean).join(", ")).split(", ").filter((v, i, a) => a.indexOf(v) === i).join(", ")} zu starten. Sie schreiben und malen direkt in ${campName ? `„${campName}“` : "die offene Kampagne"}; danach wird neu geprüft.`,
                    { faint: true },
                  )
                  : null,
            ]
          : [
              check.error
                ? checkError(k, $, check.error)
                : Sentence(k, "„Neu prüfen“ liest die offene Kampagne.", {
                    faint: true,
                  }),
            ]),
        Actions(
          k,
          "check-acts",
          [
            ...(canFix
              ? [
                  {
                    key: "check-fix",
                    label: "Offene Punkte beheben lassen",
                    icon: "wand" as const,
                    variant: "primary" as const,
                    // two steps, like the plan's sign-off: the agents write straight into this campaign
                    confirm: `In „${campName || "die offene Kampagne"}“ beheben lassen?`,
                    onPress: () => void fixOpen($, open),
                  },
                ]
              : []),
            {
              key: "check-refresh",
              label: "Neu prüfen",
              icon: "refresh",
              variant: "secondary",
              onPress: () => void refreshCampaign($),
            },
          ],
          2,
        ),
      ].filter((x): x is RenderElement => !!x),
    }),
  );
  if (mine.length || check.plan)
    out.push(
      Actions(
        k,
        "build-reset",
        [
          {
            key: "build-reset",
            label: "Bau-Stand zurücksetzen",
            icon: "x",
            variant: "secondary",
            confirm: "Wirklich zurücksetzen?",
            onPress: () => void resetBuild($),
          },
        ],
        2,
      ) as RenderElement,
    );
  return out;
}
