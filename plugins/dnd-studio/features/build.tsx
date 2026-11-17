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
import { applyLook } from "./look";
import { createHost } from "../lib/host";
import {
  acceptanceOf,
  countFindings,
  findingsPathOf,
  PIPELINE,
  pnpAgentOf,
  reviewRounds,
  stageState,
} from "../lib/model";
import {
  patchCheck,
  patchRuns,
  readCampaign,
  readLive,
  readPreview,
  readRuns,
  setCampaign,
  setPreview,
} from "../lib/state";
import { studioCall } from "../lib/studio";
import { EmptyState, ErrorState, Line, LogBox, Row, Section } from "../lib/ui";
import type { Kit } from "../lib/ui";
import type {
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

/** The person signs the plan off: recorded, and the main thread is told to go on building. */
export async function approvePlan(
  $: EngineInterface,
  run: AgentRun,
): Promise<void> {
  const plan: PlanApproval = {
    file: run.planFile ?? "",
    campaign: run.campaign,
    at: await $.clock.now(),
  };
  await patchCheck($, () => ({ plan }));
  await $.store.set(PLAN_KEY, plan);
  $.ui.toast("✓ Plan approved");
  await submitForPerson(
    $,
    `I approved the pnp-architekt plan${plan.file ? ` (${plan.file})` : ""} in the D&D pane. Continue the build with it (pnp-kampagne: pnp-texter next).`,
  );
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
  const campaign = (await readCampaign($))?.name ?? "";
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
}

/** Marks an agent's run finished and counts its findings file. */
export async function recordEnd(
  $: EngineInterface,
  agentId: string,
  failed: boolean,
): Promise<void> {
  const runs = await readRuns($);
  const run = runs.find((r) => r.id === agentId && r.state === "running");
  if (!run) return;
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

/**
 * The acceptance check (a person's Check/Refresh): the open campaign, the map list and studio_status (GPU jobs), each
 * read once; the checklist rows come from pnp-kampagne §4.
 */
export async function refreshCampaign($: EngineInterface): Promise<void> {
  const now = await $.clock.now();
  let campaign: Record<string, unknown>;
  try {
    campaign = await studioCall($, "campaign", {});
  } catch (err) {
    $.ui.toast(`✗ campaign: ${errText(err)}`);
    await patchCheck($, () => ({
      error: `campaign: ${errText(err)}`,
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
  const errors: string[] = [];
  let maps: Record<string, unknown> = {};
  try {
    maps = await studioCall($, "map", { action: "list" });
  } catch (err) {
    errors.push(`map list: ${errText(err)}`);
  }
  try {
    await noteStudioStatus($, await studioCall($, "studio_status", {}));
  } catch (err) {
    errors.push(`studio_status: ${errText(err)}`);
  }
  const live = await readLive($);
  await patchCheck($, () => ({
    items: acceptanceOf(campaign, maps, live.prepared),
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
      } else if (e.agentId)
        await recordEnd(
          $,
          e.agentId,
          e.reason === "error" || e.reason === "aborted",
        );
      // The main thread's turn: at a live table it must leave a watcher running.
      else if (e.reason === "answer") await noteTurnEnd($);
    } catch {
      // ignore
    }
    return r;
  });
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
        ? "GPU: not checked yet"
        : gpu.running || gpu.queued
          ? `GPU busy · ${gpu.running} running, ${gpu.queued} queued${gpu.step ? ` · ${gpu.step}` : ""}${gpu.progress !== null ? ` ${gpu.progress}%` : ""}`
          : "GPU free",
      secondary:
        gpu?.busyNote ||
        "GPU agents (maler, klang, tischbereit) one after another",
    }),
  );
  if (gpuRunning.length > 1)
    out.push(
      Row(k, {
        key: "gpu-clash",
        status: "warning",
        primary: `${gpuRunning.map((r) => r.agent).join(" + ")} share the GPU at once`,
        secondary: "let one finish before the next starts",
      }),
    );
  out.push(
    Section(k, {
      key: "pipeline",
      title: "Pipeline",
      count: `review round ${reviewRounds(mine)}/3`,
      children: PIPELINE.map((p) => {
        const st = stageState(mine, p.agents);
        const findings = mine
          .filter((r) => p.agents.includes(r.agent) && r.findings !== undefined)
          .slice(-p.agents.length)
          .reduce((n, r) => n + (r.findings ?? 0), 0);
        return Row(k, {
          key: `stage-${p.stage}`,
          status:
            st === "idle"
              ? "idle"
              : st === "running"
                ? "running"
                : st === "failed"
                  ? "failed"
                  : "ok",
          primary: `${p.stage}${p.stage === "Review" && st !== "idle" ? ` · ${findings} findings` : ""}`,
          secondary: p.agents.join(", "),
        });
      }),
    }),
  );
  const planRun = latestPlanRun(mine);
  if (planRun) {
    const approved = isApproved(planRun, check.plan);
    out.push(
      Section(k, {
        key: "plan",
        title: "Plan",
        count: approved
          ? "approved"
          : planRun.state === "running"
            ? "drafting"
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
                ? "pnp-architekt is drafting the plan…"
                : planRun.state === "failed"
                  ? "pnp-architekt failed: start it again"
                  : approved
                    ? `Plan approved${check.plan?.at ? ` ${new Date(check.plan.at).toISOString().slice(0, 16).replace("T", " ")}` : ""}`
                    : "Plan waiting for your sign-off",
            secondary: planRun.planFile ?? "",
            actions:
              planRun.state === "done" && !approved
                ? [
                    {
                      key: "plan-approve",
                      label: "Approve plan",
                      primary: true,
                      onPress: () => void approvePlan($, planRun),
                    },
                    ...(planRun.planFile && !rules.spoilerSafe
                      ? [
                          {
                            key: "plan-show",
                            label: preview ? "Hide" : "Show",
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
      title: "Agents",
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
                primary: `${r.agent}${r.findings !== undefined ? ` · ${r.findings} findings` : ""}`,
                secondary: r.findingsFile ?? "",
              }),
            ),
            ...files.map((r) =>
              Row(k, {
                key: `file-${r.id}`,
                glyph: "›",
                primary: `Open items: ${r.agent}`,
                dim: true,
                actions: rules.spoilerSafe
                  ? []
                  : [
                      {
                        key: `show-${r.id}`,
                        label: preview ? "Hide" : "Show",
                        onPress: () => void togglePreview($, r.findingsFile!),
                      },
                    ],
              }),
            ),
            preview && !rules.spoilerSafe
              ? LogBox(k, { key: "preview", lines: preview.split("\n") })
              : null,
          ].filter((x): x is RenderElement => !!x)
        : [EmptyState(k, "No pnp-* agent has run yet.")],
    }),
  );
  out.push(
    Section(k, {
      key: "check",
      title: "Acceptance",
      count: campaign?.name ?? "",
      actions: [
        {
          key: "check-refresh",
          label: "Check",
          onPress: () => void refreshCampaign($),
        },
      ],
      children: campaign
        ? [
            Line(
              k,
              `${campaign.scenes} scenes · ${campaign.npcs} NPCs · ${campaign.places} places`,
              { dim: true },
            ),
            check.error
              ? ErrorState(k, {
                  key: "check-err",
                  message: check.error,
                  onRetry: () => void refreshCampaign($),
                })
              : null,
            ...check.items.flatMap((it) => [
              Row(k, {
                key: `chk-${it.key}`,
                status: it.status,
                primary: `${it.label} · ${it.counts}`,
                secondary: rules.spoilerSafe ? "" : it.detail,
              }),
              it.fix
                ? Line(k, `fix: ${it.fix}`, { dim: true, indent: 2 })
                : null,
            ]),
            /meine familie/i.test(live.profile)
              ? ErrorState(k, {
                  key: "family",
                  message:
                    'Profile "Meine Familie" is open: writes are denied.',
                })
              : null,
          ].filter((x): x is RenderElement => !!x)
        : [EmptyState(k, "Press Check to read the open campaign.")],
    }),
  );
  return out;
}
