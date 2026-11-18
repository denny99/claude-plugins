/**
 * Runde 3 [2 live]: the build (runs, plan sign-off) belongs to a campaign in a Studio profile, not to the campaign's
 * name alone. A new campaign of an old name starts at 0, a deleted profile takes its build along.
 */
import { expect, test } from "claude-code/testing";

import { isApproved, runsOf, sameBuild } from "../features/build";
import type { AgentRun } from "../types";
import { PREFIX, pane, toolResult, world } from "./world";
import { findShown } from "./shown";

const T = 1_700_000_000_000;
const run = (
  id: string,
  campaign: string,
  profile?: string,
  agent = "pnp-texter",
): AgentRun => ({
  id,
  agent,
  campaign,
  profile,
  state: "done",
  startedAt: T - 5000,
  endedAt: T - 4000,
});

test("runs and the plan sign-off match on profile and campaign, older records on the name", () => {
  const runs = [
    run("a", "Testtisch", "Testtisch"),
    run("b", "Testtisch", "Ödland"),
    run("c", "Testtisch"),
    run("d", "Rostmark", "Ödland"),
  ];
  expect(runsOf(runs, "Ödland", "Testtisch").map((r) => r.id)).toEqual(["b", "c"]);
  expect(runsOf(runs, "Testtisch", "Testtisch").map((r) => r.id)).toEqual(["a", "c"]);
  expect(sameBuild({ campaign: "K", profile: "A" }, "B", "K")).toBe(false);
  expect(sameBuild({ campaign: "K" }, "B", "K")).toBe(true);

  const plan = { ...run("p", "K", "A", "pnp-architekt"), planFile: "bauplan-k.md" };
  expect(isApproved(plan, { file: "bauplan-k.md", campaign: "K", profile: "A", at: T })).toBe(true);
  // the same file name signed off in another profile's campaign K is not this plan's sign-off
  expect(isApproved(plan, { file: "bauplan-k.md", campaign: "K", profile: "B", at: T })).toBe(false);
});

test("a new campaign of an old name and a new or deleted profile start the build at 0", async ($, on) => {
  const w = world(on);
  on("tool.call", () => toolResult({ ok: true }) as never);
  w.store.set("runs", [
    run("old-1", "Testtisch", undefined, "pnp-architekt"),
    run("old-2", "Testtisch"),
    run("prof", "Andere", "Testtisch"),
    run("rost", "Die Rostmark-Chroniken", "Ödland"),
  ]);
  w.store.set("plan-approval", { file: "bauplan-testtisch.md", campaign: "Testtisch", at: T - 1000 });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });

  // a profile made anew under the name takes that profile's build along, the legacy runs stay (no profile)
  await $.tool.call({ tool: `${PREFIX}profile`, action: "new", name: "Testtisch" } as never);
  expect((w.store.get("runs") as AgentRun[]).map((r) => r.id)).toEqual(["old-1", "old-2", "rost"]);

  // the new campaign of the old name: its old build and plan sign-off are gone, the Rostmark stays
  await $.tool.call({ tool: `${PREFIX}campaign`, action: "new", name: "Testtisch" } as never);
  expect((w.store.get("runs") as AgentRun[]).map((r) => r.id)).toEqual(["rost"]);
  expect(w.store.has("plan-approval")).toBe(false);

  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  await $.command.run({ command: "dnd", args: "build" } as never).catch(() => undefined);
  expect((await findShown(ui, /von 8/))?.text).toContain("0 von 8");
  await ui.unmount();
});

test("a new pnp agent records the open profile; a renamed campaign keeps its build, a removed one loses it", async ($, on) => {
  const w = world(on);
  on("tool.call", () => toolResult({ ok: true }) as never);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.agent.spawn({
    tool_use_id: "t1",
    prompt: "Bau den Plan. Datei: ~/kampagne/plan.md",
    description: "arch",
    subagentType: "dnd-studio:pnp-architekt",
    parentModel: "opus",
  } as never);
  const first = (w.store.get("runs") as AgentRun[])[0]!;
  expect(first.profile).toBe("Test");
  const name = first.campaign;
  expect(name).toBeTruthy();

  await $.tool.call({ tool: `${PREFIX}campaign`, action: "set", campaign: name, new_name: "Neu" } as never);
  expect((w.store.get("runs") as AgentRun[]).map((r) => r.campaign)).toEqual(["Neu"]);
  await $.tool.call({ tool: `${PREFIX}campaign`, action: "set", campaign: "Neu", remove: true } as never);
  expect(w.store.get("runs")).toEqual([]);
});
