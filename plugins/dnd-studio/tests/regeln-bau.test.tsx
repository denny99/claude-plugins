// The Build tab keeps the kit's design rules in its main states (one primary per card, every button ranked, the action
// row last, no card in a card, labels of at most three words), and its file rows fold their own preview.
import { expect, test } from "claude-code/testing";

import { kitRuleLines } from "./kit-rules";
import { findShown } from "./shown";
import { pane, world } from "./world";

const PLAN = {
  tool_use_id: "t1",
  prompt: "Entwirf den Bauplan. Plan-Datei: ~/kampagne/plan.md",
  description: "arch1",
  subagentType: "dnd-studio:pnp-architekt",
  parentModel: "opus",
};
const REVIEW = {
  tool_use_id: "t2",
  prompt: "Prüfe. Mängel-Datei: ~/kampagne/plan.md",
  description: "rev1",
  subagentType: "dnd-studio:pnp-review-technik",
  parentModel: "opus",
};
const done = (agentId: string) =>
  ({ answer: "", durationMs: 1, isAborted: false, turnId: agentId, agentId, reason: "answer" }) as never;

test("Bau: every state keeps the kit rules; the cards are built alike", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  // checked, nothing built yet: no empty „Agenten“ card, no reload in the card (the header has it)
  let ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  expect(await findShown(ui, "Agenten")).toBeUndefined();
  expect(await ui.find({ type: "Button", key: "check-refresh" })).toBeUndefined();
  expect(await ui.find({ type: "Button", key: "build-reset" })).toBeUndefined();
  // the GPU is a row of the progress card, its state a pill
  expect(await findShown(ui, "GPU")).toBeDefined();
  expect(await findShown(ui, "belegt")).toBeDefined();
  // title rows: a name, the campaign's name only in the header
  expect(await findShown(ui, "Bau-Abschnitte")).toBeDefined();
  expect(await findShown(ui, /Bau-Abschnitte · Breeland/)).toBeUndefined();
  // a check row: the pill is the state, who fixes it stands behind „Details“
  expect(await findShown(ui, "fehlt")).toBeDefined();
  expect(await findShown(ui, /Maler, Texter/)).toBeUndefined();
  await ui.press({ key: "chk-scenes-details" });
  expect(await findShown(ui, "Behebt")).toBeDefined();
  expect(await findShown(ui, "Maler, Texter")).toBeDefined();
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();

  // a plan being written, then waiting for the sign-off; a reviewer with a findings file
  await $.agent.spawn(PLAN as never);
  ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();
  await $.turn.complete(done("arch1"));
  await $.agent.spawn(REVIEW as never);
  await $.turn.complete(done("rev1"));
  for (const cols of [90, 40]) {
    ui = await $.ui.mount({ ...pane(cols, 60), surface: "desktop" });
    expect(kitRuleLines(await ui.drawn())).toEqual([]);
    await ui.unmount();
  }
  // destructive: secondary with ⚠, in the acceptance card's action row
  ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  const reset = await ui.find({ type: "Button", key: "build-reset" });
  expect(reset?.props.variant).toBe("secondary");
  expect(JSON.stringify(reset)).toContain("⚠ Bau-Stand zurücksetzen");
  await ui.press({ key: "plan-approve" });
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();
});

test("Bau: „Details“ unfolds a file under its own row; only that row reads „Schließen“", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.agent.spawn(PLAN as never);
  await $.turn.complete(done("arch1"));
  await $.agent.spawn(REVIEW as never);
  await $.turn.complete(done("rev1"));
  // the files' text is hidden while the person plays along: switch spoiler-safe off (Zustand tab)
  await $.command.run({ command: "dnd", args: "health" } as never);
  let ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  await ui.press({ key: "toggle-spoilerSafe" });
  await ui.unmount();
  await $.command.run({ command: "dnd", args: "build" } as never);
  ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  const label = async (key: string) =>
    JSON.stringify(await ui.find({ type: "Button", key }));
  // opened externally: a text action „↗ Öffnen“; folded: „Details“
  const open = await ui.find({ type: "Button", key: "plan-open" });
  expect(open?.text).toMatch(/^↗\S* Öffnen$/);
  expect(open?.props.variant).not.toBe("primary");
  expect(await label("plan-row-details")).toContain("Details");
  expect(await findShown(ui, /Szene 1/)).toBeUndefined();
  await ui.press({ key: "plan-row-details" });
  expect(await findShown(ui, /Szene 1/)).toBeDefined();
  expect(await label("plan-row-details")).toContain("Schließen");
  expect(await label("run-rev1-details")).toContain("Details");
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  // the other row takes the preview over; pressing it again folds it
  await ui.press({ key: "run-rev1-details" });
  expect(await label("plan-row-details")).toContain("Details");
  expect(await label("run-rev1-details")).toContain("Schließen");
  await ui.press({ key: "run-rev1-details" });
  expect(await findShown(ui, /Szene 1/)).toBeUndefined();
  await ui.unmount();
});

test("Bau: a failed read is one error in the status line, no reload in the card", async ($, on) => {
  world(on, { campaign: () => [{ type: "text", text: '{"open": "Breel' }] });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  for (const surface of ["desktop", "terminal"] as const) {
    const ui = await $.ui.mount({ ...pane(90, 60), surface });
    expect(await findShown(ui, /Kampagne nicht gelesen/)).toBeDefined();
    expect(await ui.find({ type: "Button", key: "check-err-retry" })).toBeUndefined();
    expect(await ui.find({ type: "Button", key: "check-refresh" })).toBeUndefined();
    if (surface === "desktop") expect(kitRuleLines(await ui.drawn())).toEqual([]);
    await ui.unmount();
  }
});

test("Bau: the terminal at 48 columns cuts no button and no line", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await $.agent.spawn(PLAN as never);
  await $.turn.complete(done("arch1"));
  await $.agent.spawn(REVIEW as never);
  await $.turn.complete(done("rev1"));
  await $.command.run({ command: "dnd", args: "build" } as never);
  for (const cols of [48, 120]) {
    const ui = await $.ui.mount({ ...pane(cols, 60), surface: "terminal" });
    // the card rules need a frame (desktop); here only what a narrow terminal can break
    expect(
      kitRuleLines(await ui.drawn(), {
        cols,
        skip: ["one-primary", "card-in-card", "actions-last"],
        // the tab strip is the header's (hooks/register.tsx), not this tab's
        allow: [/^tab-/],
      }),
    ).toEqual([]);
    for (const t of await ui.findAll({ type: "Text" }))
      for (const line of t.text.split("\n")) expect([...line].length).toBeLessThanOrEqual(cols);
    expect(await findShown(ui, /wartet auf Freigabe/)).toBeDefined();
    await ui.unmount();
  }
});
