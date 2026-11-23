/** State and lifecycle: local times, when a table is live, the table backdrop, stranded turns, build reset, pause. */
import { expect } from "claude-code/testing";
import { test } from "./limits";

import {
  clockTime,
  isLive,
  localDateTime,
  localDay,
  strandedTurns,
  toTableView,
} from "../lib/model";
import { findShown } from "./shown";
import { pane, TABLE, world, looksOn } from "./world";

const IDLE = { order: [], index: -1, round: 0, isActive: false };
const view = (s: Record<string, unknown>) => toTableView(s, {}, 0);

test("pure: times are the person's local clock, not UTC", () => {
  const at = new Date(2026, 10, 18, 12, 10).getTime();
  expect(clockTime(at)).toBe("12:10");
  expect(localDay(at)).toBe("2026-11-18");
  expect(localDateTime(at)).toBe("2026-11-18 12:10");
});

test("pure: an open window or a connected bot alone is no evening; a shown scene or a fight is", () => {
  expect(isLive(view({ players_window: true }), IDLE)).toBe(false);
  expect(isLive(view({ discord: true }), IDLE)).toBe(false);
  expect(
    isLive(view({ players_window: true, scene: { kind: "clear" } }), IDLE),
  ).toBe(false);
  expect(
    isLive(view({ players_window: true, scene: { kind: "show", title: "Das Tor" } }), IDLE),
  ).toBe(true);
  expect(isLive(view({ discord: true, turns_waiting: 1 }), IDLE)).toBe(true);
  // a scene left on a window that is closed: the evening ended
  expect(isLive(view({ scene: { title: "Das Tor" } }), IDLE)).toBe(false);
  expect(isLive(view({}), { ...IDLE, isActive: true })).toBe(true);
});

test("pure: turns that wait with nobody listening are stranded", () => {
  expect(strandedTurns(view({ turns_waiting: 2 }), IDLE, false)).toBe(2);
  expect(
    strandedTurns(view({ discord: true, turns_waiting: 2 }), IDLE, false),
  ).toBe(2);
  expect(
    strandedTurns(view({ discord: true, turns_waiting: 1, scene: { title: "x" } }), IDLE, true),
  ).toBe(0);
  expect(strandedTurns(view({ discord: true }), IDLE, false)).toBe(0);
});

test("a live table gets the game table backdrop, with or without a picture, and it goes when the table ends", async ($, on) => {
  const w = world(on, {
    table_state: {
      ...TABLE,
      scene: { kind: "show", title: "Im Tänzelnden Pony", picture: "pony.png" },
    },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await looksOn($ as never);
  await $.command.run({ command: "dnd-scene", args: "" } as never);
  // a picture: it is made into a look in a job of its own, meanwhile (and when no result has it) the game table stands
  expect(w.themes).toEqual(["dnd-table"]);
  // the window is cleared: no evening on it, the person's theme comes back
  w.answers.table_state = { ...TABLE, discord: false, scene: { kind: "clear" } };
  await $.command.run({ command: "dnd-scene", args: "" } as never);
  expect(w.themes).toEqual(["dnd-table", "clear"]);
  // a scene without a picture: the game table again, no guessing from the title (no tavern)
  w.answers.table_state = { ...TABLE, scene: { kind: "show", title: "Im Tänzelnden Pony" } };
  await $.command.run({ command: "dnd-scene", args: "" } as never);
  expect(w.themes).toEqual(["dnd-table", "clear", "dnd-table"]);
});

test("stranded turns show with a button that takes them through wait_for_players", async ($, on) => {
  const w = world(on, {
    table_state: { ...TABLE, discord: false, players_window: false, turns_waiting: 2 },
    wait_for_players: { finished: true, turn: [{ who: "Thorin", text: "Hallo" }] },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  expect(await findShown(ui, /^2 Züge warten$/)).toBeDefined();
  expect(await findShown(ui, /keine Spielleitung hört zu/)).toBeDefined();
  // no evening: no watcher warning
  expect(await findShown(ui, /Niemand hört auf die Spieler/)).toBeUndefined();
  expect(w.calls.some((c) => c.tool === "wait_for_players")).toBe(false);
  await ui.press({ key: "turns-drop" });
  expect(w.calls.some((c) => c.tool === "wait_for_players")).toBe(false);
  w.answers.table_state = { ...TABLE, discord: false, players_window: false };
  await ui.press({ key: "turns-drop" });
  const takes = w.calls.filter((c) => c.tool === "wait_for_players");
  expect(takes.length).toBe(2);
  expect(takes[0]!.args).toEqual({ timeout_seconds: 1 });
  await ui.unmount();
});

test("the build's kept state is reset only on the second press", async ($, on) => {
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
  const ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  // the agents' card is there while a run is kept, and gone (not drawn empty) after the reset
  expect(await findShown(ui, "Agenten")).toBeDefined();
  await ui.press({ key: "build-reset" });
  expect(await findShown(ui, "Agenten")).toBeDefined();
  await ui.press({ key: "build-reset" });
  expect(await findShown(ui, "Agenten")).toBeUndefined();
  expect(w.store.has("runs")).toBe(false);
  expect(w.store.has("plan-approval")).toBe(false);
  await ui.unmount();
});

test("after a break the pause button says Weiter", async ($, on) => {
  world(on, { table_state: { ...TABLE, paused: true } });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  expect(await ui.find({ type: "Button", key: "pause-off" })).toBeDefined();
  expect(await ui.find({ type: "Button", key: "pause-on" })).toBeUndefined();
  await ui.unmount();
});

test("the table look is off by default: a live table leaves the person's theme alone", async ($, on) => {
  const w = world(on, {
    table_state: { ...TABLE, scene: { kind: "show", title: "Im Tänzelnden Pony" } },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd-scene", args: "" } as never);
  expect(w.themes).toEqual([]);
  // turned on, our own look is never kept as „the theme before“: the table's end clears, it does not set dnd-table again
  await looksOn($ as never);
  await $.command.run({ command: "dnd-scene", args: "" } as never);
  w.answers.table_state = { ...TABLE, discord: false, scene: { kind: "clear" } };
  await $.command.run({ command: "dnd-scene", args: "" } as never);
  expect(w.themes).toEqual(["dnd-table", "clear"]);
});
