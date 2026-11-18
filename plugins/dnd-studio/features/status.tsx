/**
 * The mod tool `build_status`: what the Build tab shows, as words for Claude (Denny 2026-11-18: „damit ich fragen kann
 * wie weit wir sind und wann fertig“). The build's progress with the time left, the pnp agents running and the last
 * that ended, and the acceptance check. Spoiler-safe as the pane: names of what is missing only when the rule is off.
 * Reads only, changes nothing.
 */
import type { EngineInterface } from "claude-code";

import { buildProgress, countText, etaText } from "../lib/progress";
import { readCheck, readProgress, readRules, readRuns } from "../lib/state";

export const STATUS_TOOL = "build_status";
export const STATUS_TOOL_DESCRIPTION =
  "Reads the D&D pane's Build tab: the build's progress (each GPU step „x von N“ with time left and finish time, the whole build, the texter's entries), the pnp agents running now and the last ones that ended, and the acceptance check (each row with counts, open or ok, and the agent that fixes it). Use it when the person asks how far the build is or when it is done. Spoiler-safe like the pane. Changes nothing.";

const STATE = { running: "läuft", done: "fertig", failed: "abgebrochen" } as const;
const OPEN = new Set(["failed", "warning"]);

function since(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export async function statusTool($: EngineInterface): Promise<string> {
  const now = await $.clock.now();
  const [p, runs, check, rules] = await Promise.all([readProgress($), readRuns($), readCheck($), readRules($)]);
  const progress = buildProgress(p, now);
  const out: string[] = [];

  out.push("FORTSCHRITT");
  if (!progress.steps.length && !progress.entries) out.push("Nothing runs on the GPU for the build now.");
  if (progress.total && progress.steps.length > 1)
    out.push(`Bau gesamt: ${countText(progress.total.done, progress.total.total)} · ${etaText(progress.total.leftMs, now, undefined, progress.total.partial)}`);
  for (const st of progress.steps) out.push(`${st.label}: ${countText(st.done, st.total)} · ${etaText(st.leftMs, now)}`);
  if (progress.foreign) out.push(`Davor ${progress.foreign} fremde Jobs in der Warteschlange.`);
  if (progress.entries) out.push(`Texte (Texter): ${countText(progress.entries.done, progress.entries.total)} Einträgen`);

  const running = runs.filter((r) => r.state === "running");
  const ended = runs.filter((r) => r.state !== "running").sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)).slice(0, 5);
  out.push("", "AGENTEN");
  if (!running.length && !ended.length) out.push("No pnp agent has run yet.");
  for (const r of running) out.push(`${r.agent}: läuft seit ${since(now - r.startedAt)}`);
  for (const r of ended)
    out.push(`${r.agent}: ${STATE[r.state]} vor ${since(now - (r.endedAt ?? r.startedAt))}${typeof r.findings === "number" ? ` · ${r.findings} Mängel` : ""}`);

  out.push("", "ABNAHME-CHECK");
  if (!check.checkedAt) out.push("Not checked yet (the Build tab checks when a campaign is open).");
  else {
    const open = check.items.filter((it) => OPEN.has(it.status));
    out.push(`geprüft vor ${since(now - check.checkedAt)} · ${open.length ? `${open.length} offen` : "alles da"}${check.error ? ` · Fehler: ${check.error}` : ""}`);
    for (const it of check.items) {
      const state = it.unchecked ? "nicht geprüft" : OPEN.has(it.status) ? "offen" : "ok";
      const fix = OPEN.has(it.status) && it.fix ? ` → ${it.fix}` : "";
      const names = OPEN.has(it.status) && it.detail && !rules.spoilerSafe ? `: ${it.detail}` : "";
      out.push(`${it.label} · ${it.counts} · ${state}${fix}${names}`);
    }
  }
  return out.join("\n");
}
