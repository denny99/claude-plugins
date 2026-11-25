// The Table tab keeps the kit's design rules in its main states (one primary per card, every button ranked, the action
// row last, no card in a card, labels of at most three words), and says every state once.
import { expect } from "claude-code/testing";
import { test } from "./limits";

import { kitRuleLines } from "./kit-rules";
import { findShown } from "./shown";
import { pane, TABLE, world } from "./world";

test("Tisch: no table running keeps the kit rules; the empty state carries „Neu laden“", async ($, on) => {
  const w = world(on, {
    table_state: { ...TABLE, players_window: false, discord: false },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  for (const cols of [90, 40]) {
    const ui = await $.ui.mount({ ...pane(cols, 60), surface: "desktop" });
    expect(kitRuleLines(await ui.drawn())).toEqual([]);
    await ui.unmount();
  }
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  // no desk card without a table; joining Discord early is the Discord card's one primary action
  expect(await findShown(ui, "Tisch")).toBeUndefined();
  expect(
    (await ui.find({ type: "Button", key: "discord-join" }))?.props.variant,
  ).toBe("primary");
  const reads = () => w.calls.filter((c) => c.tool === "table_state").length;
  const before = reads();
  await ui.press({ key: "table-reload" });
  expect(reads()).toBe(before + 1);
  await ui.unmount();
});

test("Tisch: a live table keeps the kit rules, folded and unfolded, wide and narrow", async ($, on) => {
  world(on, {
    table_state: { ...TABLE, scene: { kind: "show", title: "Das Tor" } },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  let ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  // one card „Tisch“ with rows instead of loose status sentences
  expect(await findShown(ui, "Tisch")).toBeDefined();
  expect(await findShown(ui, "Spielerfenster")).toBeDefined();
  // the three cards at the end, each with its own action row
  for (const title of ["Pause", "Abendende", /^Einwürfe/])
    expect(await findShown(ui, title), String(title)).toBeDefined();
  expect(await findShown(ui, /Pause und Abendende/)).toBeUndefined();
  // one label for stopping the sound, wherever it stands
  expect((await ui.find({ type: "Button", key: "end-stop" }))?.text).toBe(
    "Klang stoppen",
  );
  // the order form: label, a short example, the deed
  expect(await findShown(ui, "Reihenfolge")).toBeDefined();
  expect((await ui.find({ type: "Button", key: "ini-party" }))?.text).toBe(
    "Gruppe übernehmen",
  );
  // every fold of the tab unfolds through the text action „Details“
  for (const b of await ui.findAll({ type: "Button" })) {
    const key = String(b.props.key ?? "");
    if (!key.startsWith("sec-")) continue;
    // Discord starts open while the bot is at the table
    expect(b.text).toBe(key === "sec-discord" ? "Schließen" : "Details");
    if (b.text === "Details") await ui.press({ key });
  }
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();

  // a fight: the destructive end carries the warning mark
  ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  await ui.press({ key: "ini-party" });
  expect((await ui.find({ type: "Button", key: "ini-end" }))?.text).toMatch(
    /^⚠/,
  );
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();

  ui = await $.ui.mount({ ...pane(40, 80), surface: "desktop" });
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();
});
