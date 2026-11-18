import { expect, test } from "claude-code/testing";
import { findShown } from "./shown";
import { band, pane, PREFIX, world } from "./world";

import {
  bandProgress,
  buildProgress,
  clockText,
  EMPTY_PROGRESS,
  endedOf,
  ESTIMATE_PENDING,
  etaText,
  noteEnded,
  noteEntry,
  notePlanned,
  noteStarted,
  noteVoices,
  startedIds,
} from "../lib/progress";
import type { ProgressState } from "../lib/progress";

const T0 = 1_700_000_000_000; // 2023-11-14 22:13:20 UTC
const MIN = 60_000;

/** Ten pictures queued at T0, the first three seen done after 2, 5 and 9 minutes (shares 2, 3 and 4 min). */
function threeDone(): ProgressState {
  const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
  let s = noteStarted(EMPTY_PROGRESS, "picture", ids, T0, T0);
  s = noteEnded(s, [{ id: "p0" }], T0 + 2 * MIN);
  s = noteEnded(s, [{ id: "p1" }], T0 + 5 * MIN);
  s = noteEnded(s, [{ id: "p2" }], T0 + 9 * MIN);
  return s;
}

test("progress: the estimate from 3 finished jobs is their moving mean times the jobs left", () => {
  const now = T0 + 9 * MIN;
  const p = buildProgress(threeDone(), now);
  expect(p.steps.length).toBe(1);
  const st = p.steps[0]!;
  expect(st.label).toBe("Bilder");
  expect([st.done, st.total]).toEqual([3, 10]);
  // mean (2 + 3 + 4) / 3 = 3 min, 7 left → 21 min
  expect(st.leftMs).toBe(21 * MIN);
  // CET (offset -60): 22:22 UTC now + 21 min = 23:43 local
  expect(etaText(st.leftMs, now, -60)).toBe("noch ~21 min · fertig gegen 23:43");
  expect(p.total).toEqual({ done: 3, total: 10, leftMs: 21 * MIN, partial: false });
});

test("progress: without a finished job the step says „Schätzung folgt“", () => {
  const s = noteStarted(EMPTY_PROGRESS, "sound", ["s1", "s2"], T0, T0);
  const p = buildProgress(s, T0 + MIN);
  expect([p.steps[0]!.done, p.steps[0]!.total]).toEqual([0, 2]);
  expect(p.steps[0]!.leftMs).toBeNull();
  expect(etaText(p.steps[0]!.leftMs, T0 + MIN)).toBe(ESTIMATE_PENDING);
  expect(bandProgress(p, 24)).toBe("Klänge 0/2");
});

test("progress: the clock is local time", () => {
  // the given zone
  expect(clockText(T0, -60)).toBe("23:13");
  expect(clockText(T0, 0)).toBe("22:13");
  expect(clockText(T0, 300)).toBe("17:13");
  // left out: the computer's zone, as Date shows it
  const d = new Date(T0 + 42 * MIN);
  const local = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  expect(clockText(T0 + 42 * MIN)).toBe(local);
});

test("progress: voices from prepare_table, the Studio's own queue goes first, answers in their real shapes", () => {
  // prepare_table: 20 new lines in a 30 s call → 1.5 s a line; 140 of 320 made → 180 left → 4.5 min
  let s = noteVoices(EMPTY_PROGRESS, { made: 140, new: 20, total: 320, failed: [] }, T0, T0 + 30_000);
  let p = buildProgress(s, T0 + 30_000);
  expect(p.steps[0]!.label).toBe("Stimmen");
  expect(p.steps[0]!.leftMs).toBe(180 * 1500);
  expect(bandProgress(p, 24)).toBe("Stimmen 140/320 · ~5 min");
  // the band cuts the separator before the time, then the time
  expect(bandProgress(p, 22)).toBe("Stimmen 140/320 ~5 min");
  expect(bandProgress(p, 16)).toBe("Stimmen 140/320");

  // start answers: one id, a list, jobs[]; jobs wait: per job, finished for all, only a count
  expect(startedIds(JSON.stringify({ id: "j1", mode: "sound", queued: true }))).toEqual(["j1"]);
  expect(startedIds(JSON.stringify({ job_ids: ["a", "b"] }))).toEqual(["a", "b"]);
  expect(startedIds(JSON.stringify({ jobs: [{ id: "x", queued: true }, { id: "y", queued: true }] }))).toEqual(["x", "y"]);
  s = noteStarted(EMPTY_PROGRESS, "picture", ["a", "b", "c"], T0, T0);
  expect(endedOf({ job_ids: ["a", "b"] }, JSON.stringify({ finished: false, jobs: [{ id: "a", done: true }, { id: "b" }] }), s)).toEqual([{ id: "a" }]);
  expect(endedOf({ job_ids: ["a", "b"] }, JSON.stringify({ finished: true }), s)).toEqual([{ id: "a" }, { id: "b" }]);
  expect(endedOf({ job_ids: ["a", "b", "c"] }, JSON.stringify({ finished: false, done: 2 }), s)).toEqual([{ id: "a" }, { id: "b" }]);
  expect(endedOf({ action: "cancel", job_ids: ["c"] }, "{}", s)).toEqual([{ id: "c", failed: true }]);

  // a foreign job in the Studio's queue (not started through these tools) is waited for first
  s = threeDone();
  s = { ...s, foreign: { kinds: ["picture"], at: T0 + 9 * MIN } };
  p = buildProgress(s, T0 + 9 * MIN);
  expect(p.foreign).toBe(1);
  expect(p.steps[0]!.leftMs).toBe(24 * MIN);
});

test("progress: the band shows the build step only while something runs; the Build tab shows each step and the whole build", async ($, on) => {
  const w = world(on);
  let waits = 0;
  on("tool.call", (_, e) => {
    if (e.tool === `${PREFIX}picture`)
      return { result: [{ type: "text", text: JSON.stringify({ id: `pic${(e as { input?: { name?: string } }).input?.name}`, mode: "picture", queued: true }) }] } as never;
    if (e.tool === `${PREFIX}jobs`) {
      waits++;
      const asked = ((e as { input?: { job_ids?: string[] } }).input?.job_ids ?? []);
      return { result: [{ type: "text", text: JSON.stringify({ finished: true, jobs: asked.map((id) => ({ id, done: true, results: [{ id: `r-${id}`, kind: "image", file: `/out/${id}.png` }] })) }) }] } as never;
    }
    return { result: [{ type: "text", text: "{}" }] } as never;
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });

  const words = async () => {
    const b = await $.ui.mount({ ...band(), surface: "desktop" });
    const t = (await b.findAll({ type: "Text" })).map((x) => x.text).join(" ");
    await b.unmount();
    return t;
  };
  // calm: no build text in the band
  expect(await words()).not.toContain("Bilder");

  // an agent (the maler) says 4 pictures and queues 2
  await $.tool.call({ tool: "mcp__dnd-studio__build_progress", input: { step: "pictures", total: 4 } } as never);
  await $.tool.call({ tool: `${PREFIX}picture`, input: { idea: "a", name: "A" }, agentId: "maler-1" } as never);
  await $.tool.call({ tool: `${PREFIX}picture`, input: { idea: "b", name: "B" }, agentId: "maler-1" } as never);
  expect(await words()).toContain("Bilder 0/4");

  await w.clock.advance(3 * MIN);
  await $.tool.call({ tool: `${PREFIX}jobs`, input: { action: "wait", job_ids: ["picA"] }, agentId: "maler-1" } as never);
  expect(waits).toBe(1);
  // one picture took 3 min, 3 left → ~9 min
  expect(await words()).toContain("Bilder 1/4 · ~9 min");

  // the Build tab: x von N, the estimate and the local finish time
  await $.command.run({ command: "dnd", args: "build" } as never).catch(() => undefined);
  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect((await findShown(ui, /1 von 4/))?.text).toContain("1 von 4");
  const finish = clockText(T0 + 3 * MIN + 9 * MIN);
  expect((await findShown(ui, /fertig gegen/))?.text).toContain(`noch ~9 min · fertig gegen ${finish}`);
  await ui.unmount();

  // the second picture done, the maler says it stops at 2: all done, the band is calm again
  await w.clock.advance(3 * MIN);
  await $.tool.call({ tool: `${PREFIX}jobs`, input: { action: "wait", job_ids: ["picB"] } } as never);
  expect(await words()).toContain("Bilder 2/4");
  await $.tool.call({ tool: "mcp__dnd-studio__build_progress", input: { step: "pictures", total: 2 } } as never);
  expect(await words()).not.toContain("Bilder");
});

test("progress: the texter's entries are a count from the plan, without a time", () => {
  let s = notePlanned(EMPTY_PROGRESS, "texts", 12, undefined, T0);
  s = noteEntry(s, T0 + MIN, 3);
  const p = buildProgress(s, T0 + MIN);
  expect(p.entries).toEqual({ done: 3, total: 12 });
  expect(p.steps.length).toBe(0);
  expect(p.total).toBeNull();
  expect(bandProgress(p, 24)).toBe("Texte 3/12");
  expect(bandProgress(buildProgress(noteEntry(s, T0 + 2 * MIN, 9), T0 + 2 * MIN), 24)).toBeNull();
});
