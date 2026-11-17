/**
 * Build mode (pnp-kampagne): which pnp-* agents ran for the campaign (agent.spawn / turn.complete), the reviewers'
 * findings counts from their Mängel files, and a live acceptance checklist from the campaign overview.
 */
import type { EngineInterface, On, RenderElement } from "claude-code";

import { applyLook } from "./look";
import { createHost } from "../lib/host";
import {
  countFindings,
  findingsPathOf,
  PIPELINE,
  pnpAgentOf,
  reviewRounds,
  stageState,
} from "../lib/model";
import {
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
import type { AgentRun, CampaignInfo, Rules, TableLive } from "../types";

const STORE_KEY = "runs";

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

/** Reads the open campaign's overview for the checklist (a person's Refresh). */
export async function refreshCampaign($: EngineInterface): Promise<void> {
  try {
    const o = await studioCall($, "campaign", { overview: true });
    const info: CampaignInfo = {
      name: typeof o.name === "string" ? o.name : "",
      scenes: count(o.scenes),
      npcs: count(o.npcs),
      places: count(o.places),
      broken: count(o.brokenReferences),
      fetchedAt: await $.clock.now(),
    };
    await setCampaign($, info);
  } catch (err) {
    $.ui.toast(
      `✗ campaign: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    );
  }
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
      if (!("deny" in r && r.deny))
        await recordSpawn($, e.subagentType, r.agentId, e.prompt);
    } catch {
      // tracking never blocks an agent
    }
    return r;
  });
  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    try {
      if (e.agentId)
        await recordEnd(
          $,
          e.agentId,
          e.reason === "error" || e.reason === "aborted",
        );
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
  },
): Promise<RenderElement[]> {
  const { runs, campaign, live, rules } = d;
  const preview = await readPreview($);
  const mine = campaign?.name
    ? runs.filter((r) => !r.campaign || r.campaign === campaign.name)
    : runs;
  const out: RenderElement[] = [];
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
            Row(k, {
              key: "chk-broken",
              status: campaign.broken ? "failed" : "ok",
              primary: `Broken references: ${campaign.broken}`,
            }),
            Line(
              k,
              `${campaign.scenes} scenes · ${campaign.npcs} NPCs · ${campaign.places} places`,
              { dim: true },
            ),
            Row(k, {
              key: "chk-prep",
              status: live.prepared
                ? /failed/.test(live.prepared)
                  ? "failed"
                  : "ok"
                : "idle",
              primary: `Voices prepared: ${live.prepared || "not run yet"}`,
            }),
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
