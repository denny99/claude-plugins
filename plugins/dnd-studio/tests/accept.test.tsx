import { expect, test } from "claude-code/testing";

import { findShown } from "./shown";

import { acceptanceOf, gpuOf } from "../lib/model";
import { CAMPAIGN, MAPS, pane, STATUS, world } from "./world";

test("pure: the §4 checklist names what is missing and who fixes it", () => {
  const items = acceptanceOf(CAMPAIGN, MAPS, "10/12, 2 failed");
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  expect(by.scenes).toMatchObject({
    status: "failed",
    counts: "1/2",
    detail: "Im Wald (picture/text/recipe)",
    fix: "pnp-maler, pnp-texter",
  });
  expect(by.maps).toMatchObject({
    status: "failed",
    detail: "Bree",
    fix: "pnp-maler",
  });
  expect(by.pins).toMatchObject({
    status: "failed",
    counts: "1/2",
    detail: "Wald",
    fix: "pnp-maler",
  });
  // The mute dog needs no voice; Bartel lacks his sheet.
  expect(by.npcs).toMatchObject({
    status: "failed",
    counts: "1/2",
    detail: "Bartel (sheet)",
    fix: "pnp-texter",
  });
  expect(by.start).toMatchObject({ status: "ok", counts: "1/1" });
  expect(by.threads).toMatchObject({ status: "ok" });
  expect(by.broken).toMatchObject({ status: "ok", counts: "0" });
  expect(by.prepare).toMatchObject({
    status: "failed",
    fix: "pnp-tischbereit",
  });

  const empty = acceptanceOf({ open: "X", threads: [], scenes: [] }, {}, "");
  const e = Object.fromEntries(empty.map((i) => [i.key, i]));
  expect(e.threads?.status).toBe("warning");
  expect(e.prepare).toMatchObject({
    status: "idle",
    counts: "not run yet",
    fix: "pnp-tischbereit",
  });
  expect(e.scenes?.status).toBe("failed");

  const noStart = acceptanceOf(
    {
      ...CAMPAIGN,
      scenes: [
        {
          title: "Das Tor",
          place: "Bree",
          text: "t",
          notes: "Rezept",
          picture: "p",
        },
      ],
    },
    MAPS,
    "12/12",
  );
  expect(noStart.find((i) => i.key === "start")).toMatchObject({
    status: "failed",
    fix: "pnp-texter",
  });
  expect(noStart.find((i) => i.key === "prepare")?.status).toBe("ok");

  expect(gpuOf(STATUS, 1)).toMatchObject({
    running: 1,
    queued: 1,
    step: "KSampler",
    progress: 40,
  });
  expect(gpuOf({ jobs: [] }, 1)).toMatchObject({ running: 0, queued: 0 });
});

test("Build: Check reads campaign, maps and studio_status; rows show status and fix hints; spoiler-safe hides names", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  expect(w.calls.map((c) => c.tool)).toEqual([
    "campaign",
    "map",
    "studio_status",
  ]);
  expect(w.calls[1]?.args).toEqual({ action: "list" });

  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect((await findShown(ui, /GPU belegt/))?.text).toBe(
    "● GPU belegt · 1 läuft, 1 warten · KSampler 40%",
  );
  expect(
    await findShown(ui, /Scenes: picture \+ text \+ recipe · 1\/2/),
  ).toBeDefined();
  expect(await findShown(ui, /Maps painted/)).toBeDefined();
  expect(
    await findShown(ui, /Start squares in scene notes · 1\/1/),
  ).toBeDefined();
  expect(await findShown(ui, /Threads and party_at set/)).toBeDefined();
  expect(await findShown(ui, /prepare_table · not run yet/)).toBeDefined();
  expect(await findShown(ui, /fix: pnp-maler, pnp-texter/)).toBeDefined();
  expect(await findShown(ui, /fix: pnp-tischbereit/)).toBeDefined();
  // spoiler-safe by default: counts, no names
  expect(await findShown(ui, /Im Wald/)).toBeUndefined();
  await ui.unmount();
});

test("Build: the plan is signed off by a press, recorded, and the main thread is told to go on", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.agent.spawn({
    tool_use_id: "t1",
    prompt: "Entwirf den Bauplan. Plan-Datei: ~/kampagne/plan.md",
    description: "arch1",
    subagentType: "dnd-studio:pnp-architekt",
    parentModel: "opus",
  } as never);
  await $.command.run({ command: "dnd", args: "build" } as never);
  let ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(await findShown(ui, /schreibt den Bauplan/)).toBeDefined();
  expect(
    await ui.find({ type: "Button", key: "plan-approve" }),
  ).toBeUndefined();
  await ui.unmount();

  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "x",
    agentId: "arch1",
    reason: "answer",
  } as never);
  ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(
    await findShown(ui, /Bauplan wartet auf deine Freigabe/),
  ).toBeDefined();
  expect(w.submitted).toEqual([]);
  await ui.press({ key: "plan-approve" });
  expect(w.submitted.length).toBe(1);
  expect(w.submitted[0]).toContain("~/kampagne/plan.md");
  expect(w.submitted[0]).toContain("pnp-texter");
  expect((w.store.get("plan-approval") as { file: string }).file).toBe(
    "~/kampagne/plan.md",
  );
  await ui.unmount();

  ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(await findShown(ui, /✓ Bauplan abgesegnet/)).toBeDefined();
  expect(
    await ui.find({ type: "Button", key: "plan-approve" }),
  ).toBeUndefined();
  await ui.unmount();
});

test("Build: two GPU agents at once are flagged", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  for (const [id, type] of [
    ["m1", "pnp-maler"],
    ["k1", "pnp-klang"],
  ] as const)
    await $.agent.spawn({
      tool_use_id: id,
      prompt: "x",
      description: id,
      subagentType: type,
      parentModel: "opus",
    } as never);
  await $.command.run({ command: "dnd", args: "build" } as never);
  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(
    await findShown(ui, /pnp-maler \+ pnp-klang teilen sich gerade die GPU/),
  ).toBeDefined();
  await ui.unmount();
});
