/**
 * Build progress with an estimate: the hooks that see the GPU work start and end (the main thread's and every agent's
 * Studio calls), the mod tool `build_progress` (an agent says how much it will make), and what the Build tab and the
 * band show. The arithmetic is in lib/progress.ts.
 */
import type { EngineInterface, On, RenderElement } from "claude-code";

import {
  buildProgress,
  countText,
  endedOf,
  etaText,
  isRefusal,
  JOB_TTL_MS,
  kindOfCall,
  noteEnded,
  noteEntry,
  notePlanned,
  noteQueue,
  noteStarted,
  noteVoiceJob,
  noteVoices,
  openPrepJob,
  preparedText,
  startedIds,
  STEP_KIND,
  VOICE_POLL_MS,
} from "../lib/progress";
import type { BuildProgress, ProgressState } from "../lib/progress";
import { jsonOf, SERVER_KEY, textOf } from "../lib/studio";
import { patchLive, patchProgress, readProgress, readRuns } from "../lib/state";
import { Card, ProgressBlock } from "../lib/ui";
import type { Kit, StatusInfo } from "../lib/ui";

type Obj = Record<string, unknown>;

export const PROGRESS_TOOL = "build_progress";
export const PROGRESS_TOOL_DESCRIPTION =
  "Tells the D&D pane (Build tab, band) how much a build step will make in all, so it can show „x von N“ with a time estimate. Call it once when a step starts, before queueing: step pictures|maps|sounds|clips|3d|refine|write_text with total = how many jobs you will start in all (the pane counts them as they finish); step texts with total = the plan's entries you will write (the pane counts your set_campaign_entry calls, or give done). Changes nothing in the Studio.";

/** The Studio step tools the progress hooks watch themselves (the others reach it through table.tsx's `watch`). */
const OWN_TOOLS = [
  "picture",
  "paint_player",
  "paint_map",
  "picture_tool",
  "animate",
  "make_3d",
  "model_tool",
  "write_text",
];

function inputOf(e: unknown): Obj {
  const o = (e ?? {}) as Obj;
  return o.input && typeof o.input === "object" ? (o.input as Obj) : o;
}

/**
 * What a finished Studio call says about the build's progress (after `next`, never changing it). `tool` without the
 * MCP prefix; `callStart` when the call began (write_text's time). Never throws.
 */
export async function noteProgressCall(
  $: EngineInterface,
  tool: string,
  e: unknown,
  result: Obj,
  callStart: number,
): Promise<void> {
  try {
    if (result.deny) return;
    const input = inputOf(e);
    const text = textOf(result.result ?? result);
    const now = await $.clock.now();
    const kind = kindOfCall(tool, input);
    if (kind) {
      if (isRefusal(text)) return;
      const ids = startedIds(text);
      await patchProgress($, (p) => noteStarted(p, kind, ids, callStart, now));
      followJobs($);
      return;
    }
    if (tool === "jobs") {
      await noteJobsAnswer($, input, text, now);
    } else if (tool === "prepare_table") {
      const json = jsonOf(text);
      if (json) await patchProgress($, (p) => noteVoices(p, json, callStart, now));
      followJobs($);
    } else if (tool === "studio_status") {
      const json = jsonOf(text);
      if (json) await patchProgress($, (p) => noteQueue(p, json, now));
    } else if (tool === "set_campaign_entry") {
      // the texter's entries: only its own writes count
      const agentId = (e as Obj)?.agentId;
      if (typeof agentId !== "string" || isRefusal(text)) return;
      const runs = await readRuns($);
      if (runs.some((r) => r.id === agentId && r.agent === "pnp-texter" && r.state === "running"))
        {
        const n = Array.isArray(input.entries) ? input.entries.length : 1;
        await patchProgress($, (p) => noteEntry(p, now, Math.max(1, n)));
      }
    }
  } catch {
    // progress never stalls a Studio call
  }
}

/** A `jobs` answer (Claude's call or the mod's own poll): finished jobs end, the prepare job's row moves on. */
async function noteJobsAnswer($: EngineInterface, input: Obj, text: string, now: number): Promise<void> {
  const p = await readProgress($);
  const ended = endedOf(input, text, p);
  const data = jsonOf(text) ?? {};
  const hadJob = openPrepJob(p);
  let next = p;
  await patchProgress($, (q) => (next = noteVoiceJob(ended.length ? noteEnded(q, ended, now) : q, input, data, now)));
  // the acceptance row follows the job as the old prepare_table answer did (lib/model.ts reads `prepared`)
  if (hadJob && next.voices !== p.voices) await patchLive($, () => ({ prepared: preparedText(next) }));
}

/** The Studio jobs the mod still waits for: GPU jobs it saw queued and the open prepare job. */
export function openJobIds(p: ProgressState, now: number): string[] {
  // an end that never reaches the Studio's answer (a vanished job) stops being asked after JOB_TTL_MS
  const ids = p.jobs
    .filter((j) => j.endedAt === undefined && !j.id.startsWith("sync-") && now - j.startedAt < JOB_TTL_MS)
    .map((j) => j.id);
  const prep = p.voices && now - p.voices.at < JOB_TTL_MS ? openPrepJob(p) : undefined;
  return prep && !ids.includes(prep) ? [...ids, prep] : ids;
}

let followAt = 0;

/**
 * While the mod tracks open Studio jobs it asks the Studio itself every VOICE_POLL_MS (`jobs wait`, 1 s), so the bars
 * move without Claude's calls (its `jobs watch` runs in Bash, out of the mod's sight). One chain at a time; it stops
 * once nothing is open, a failed call only skips a round.
 */
export function followJobs($: EngineInterface): void {
  void (async () => {
    const now = await $.clock.now();
    if (followAt > now) return;
    if (!openJobIds(await readProgress($), now).length) return;
    followAt = now + VOICE_POLL_MS;
    $.clock.after(VOICE_POLL_MS, () => {
      followAt = 0;
      void pollJobs($).finally(() => followJobs($));
    });
  })().catch(() => undefined);
}

/** One poll: `jobs wait` for the open jobs, its raw text (answerOf would drop a bare array) noted like Claude's call. */
export async function pollJobs($: EngineInterface): Promise<void> {
  try {
    const ids = openJobIds(await readProgress($), await $.clock.now());
    if (!ids.length) return;
    const link = await $.mcp.connect(SERVER_KEY);
    if (!link.isConnected) return;
    const input = { action: "wait", job_ids: ids, timeout_seconds: 1 };
    const res = await $.mcp.call(link.server, "jobs", input);
    if (res.isError) return;
    const blocks = Array.isArray(res.content) ? res.content : [];
    const first = blocks.find((b): b is { text: unknown } => !!b && typeof b === "object" && "text" in b);
    const text = first ? String(first.text) : textOf(res.content);
    await noteJobsAnswer($, input, text, await $.clock.now());
  } catch {
    // the next round tries again
  }
}

export function registerProgress(on: On): void {
  for (const tool of OWN_TOOLS)
    on(
      "tool.call",
      { tool: `mcp__plugin_dnd-studio_dnd-studio__${tool}` },
      async ($, e, next) => {
        const start = await $.clock.now();
        const r = (await next(e)) as Obj;
        await noteProgressCall($, tool, e, r, start);
        return r as never;
      },
    ).catch((_$: unknown, e: unknown, next: (e: never) => unknown) => next(e as never));
}

/** The mod tool build_progress. */
export async function progressTool($: EngineInterface, e: Obj): Promise<string> {
  const input = inputOf(e);
  const step = String(input.step ?? "");
  const total = Number(input.total);
  if (step !== "texts" && !STEP_KIND[step])
    return `Unknown step "${step}": texts, ${Object.keys(STEP_KIND).join(", ")}.`;
  if (!Number.isFinite(total) || total < 0) return "total must be a number ≥ 0.";
  const done = input.done === undefined ? undefined : Number(input.done);
  const now = await $.clock.now();
  await patchProgress($, (p) =>
    notePlanned(p, step, Math.round(total), done !== undefined && Number.isFinite(done) ? Math.round(done) : undefined, now),
  );
  return `Noted: ${step} ${total} in all. The D&D pane shows the progress.`;
}

/** What runs now (Build tab, band). */
export async function readBuildProgress($: EngineInterface): Promise<BuildProgress> {
  followJobs($); // after a reload the chain starts again with the first look
  return buildProgress(await readProgress($), await $.clock.now());
}

/**
 * The Build tab's progress card: the whole build on top ("Bau gesamt"), then each GPU step with „x von N“, a bar and
 * „noch ~M min · fertig gegen HH:MM“ (or „Schätzung folgt“), the texter's entries as a count only. `extra.rows` are
 * further rows of the same card (the GPU's state), `extra.status` its status line. Null: nothing runs and no rows.
 */
export function renderProgress(
  k: Kit,
  p: BuildProgress,
  now: number,
  offsetMin?: number,
  extra: { rows?: RenderElement[]; status?: StatusInfo } = {},
): RenderElement | null {
  const rows = extra.rows ?? [];
  if (!p.steps.length && !p.entries && !rows.length) return null;
  const children: RenderElement[] = [];
  if (p.total && p.steps.length > 1)
    children.push(
      ProgressBlock(k, {
        key: "progress-total",
        label: "Bau gesamt",
        value: p.total.done,
        max: Math.max(1, p.total.total),
        valueText: countText(p.total.done, p.total.total),
        sentence: etaText(p.total.leftMs, now, offsetMin, p.total.partial),
        tone: "info",
      }),
    );
  for (const st of p.steps)
    children.push(
      ProgressBlock(k, {
        key: st.key,
        label: st.label,
        value: st.done,
        max: Math.max(1, st.total),
        valueText: countText(st.done, st.total),
        sentence: etaText(st.leftMs, now, offsetMin),
        tone: "info",
      }),
    );
  if (p.entries)
    children.push(
      ProgressBlock(k, {
        key: "progress-entries",
        label: "Texte (Texter)",
        value: p.entries.done,
        max: Math.max(1, p.entries.total),
        valueText: `${countText(p.entries.done, p.entries.total)} Einträgen`,
        tone: "info",
      }),
    );
  return Card(k, {
    key: "progress",
    title: {
      icon: "hammer",
      title: "Fortschritt",
      count: p.total ? countText(p.total.done, p.total.total) : undefined,
    },
    children: [...children, ...rows],
    hint: p.foreign
      ? `Davor ${p.foreign} ${p.foreign === 1 ? "Job" : "Jobs"} aus dem Studio in der Warteschlange`
      : undefined,
    status: extra.status,
  });
}
