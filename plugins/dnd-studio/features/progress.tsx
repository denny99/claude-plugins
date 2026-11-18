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
  kindOfCall,
  noteEnded,
  noteEntry,
  notePlanned,
  noteQueue,
  noteStarted,
  noteVoices,
  startedIds,
  STEP_KIND,
} from "../lib/progress";
import type { BuildProgress } from "../lib/progress";
import { jsonOf, textOf } from "../lib/studio";
import { patchProgress, readProgress, readRuns } from "../lib/state";
import { Card, CardTitle, ProgressBlock, Sentence } from "../lib/ui";
import type { Kit } from "../lib/ui";

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
      return;
    }
    if (tool === "jobs") {
      const p = await readProgress($);
      const ended = endedOf(input, text, p);
      if (ended.length) await patchProgress($, (q) => noteEnded(q, ended, now));
    } else if (tool === "prepare_table") {
      const json = jsonOf(text);
      if (json) await patchProgress($, (p) => noteVoices(p, json, callStart, now));
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
  return buildProgress(await readProgress($), await $.clock.now());
}

/**
 * The Build tab's progress card: the whole build on top ("Bau gesamt"), then each GPU step with „x von N“, a bar and
 * „noch ~M min · fertig gegen HH:MM“ (or „Schätzung folgt“), the texter's entries as a count only. Null: nothing runs.
 */
export function renderProgress(
  k: Kit,
  p: BuildProgress,
  now: number,
  offsetMin?: number,
): RenderElement | null {
  if (!p.steps.length && !p.entries) return null;
  const children: RenderElement[] = [
    CardTitle(k, {
      icon: "hammer",
      title: "Fortschritt",
      count: p.total ? `Bau gesamt ${countText(p.total.done, p.total.total)}` : undefined,
    }),
  ];
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
  if (p.foreign)
    children.push(
      Sentence(k, `Davor ${p.foreign} ${p.foreign === 1 ? "Job" : "Jobs"} aus dem Studio in der Warteschlange`, {
        faint: true,
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
  return Card(k, { key: "progress", children });
}
