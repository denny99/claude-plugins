import { expect, mock, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

const PANE = {
  plugin: "dnd-studio",
  component: "Pane",
  requestId: "dnd",
  props: {
    title: "D&D",
    isFocused: false,
    bodyColumns: 70,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const;

const BAND = {
  plugin: "dnd-studio",
  component: "AbovePrompt",
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const;

const TABLE = {
  listening: false,
  paused: false,
  players_window: true,
  discord: false,
  party: ["Thorin", "Mara"],
  scene: { title: "Das Tor", picture: "/view?filename=abc" },
  spotlight: null,
  status: {
    Thorin: {
      values: { Ausdauer: "18/22" },
      conditions: ["erschöpft"],
      foe: false,
    },
    "Wolf 1": { values: {}, conditions: [], foe: true },
  },
  log: [
    {
      kind: "roll",
      who: "Thorin",
      label: "Athletik",
      total: 14,
      verdict: "Erfolg",
    },
    { kind: "whisper", to: "Mara", what: "Du hörst ein Flüstern" },
  ],
};
const CAMPAIGN = {
  npcs: [
    {
      name: "Bartel",
      place: "Bree",
      stock: {
        greet: [{ text: "Na, ihr da!", how: "say:warm:normal" }],
        bye: ["Macht’s gut."],
      },
    },
    { name: "Fremder", place: "Weit weg" },
  ],
  scenes: [
    {
      title: "Das Tor",
      place: "Bree",
      notes: "Startfelder A1",
      sounds: [{ name: "Regen", file: "dnd/rain.flac", kind: "ambience" }],
    },
  ],
};

type Call = { tool: string; args: Record<string, unknown> };

function engine(
  on: Parameters<TestBody>[1],
  calls: Call[],
  table: Record<string, unknown> = TABLE,
): void {
  mock.clock(on, { now: 1_700_000_000_000 });
  on("command.register", (_, e) => ({ value: { command: e.name } }));
  on("tool.register", () => ({ value: {} as never }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.toast", () => ({ value: undefined }));
  on("store.get", () => ({ value: undefined }));
  on("store.set", () => ({ value: undefined }));
  on("theme.set", () => ({ value: { isDrawn: true } as never }));
  on("theme.clear", () => ({ value: { isDrawn: true } as never }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("mcp.connect", () => ({
    value: { isConnected: true, server: "plugin:dnd-studio:dnd-studio" },
  }));
  on("mcp.call", (_, e) => {
    calls.push({ tool: e.tool, args: e.args });
    const body =
      e.tool === "table_state"
        ? table
        : e.tool === "campaign"
          ? CAMPAIGN
          : { ok: true };
    return {
      value: {
        content: [{ type: "text", text: JSON.stringify(body) }],
        isError: false,
      },
    };
  });
}

test("the GM screen shows scene, party, NPCs and sounds on every surface", async ($, on) => {
  const calls: Call[] = [];
  engine(on, calls);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);

  for (const surface of ["terminal", "desktop", "vscode", "mobile"] as const) {
    const ui = await $.ui.mount({ ...PANE, surface });
    expect(
      (await ui.find({ type: "Text", text: /Thorin · Ausdauer 18\/22/ }))?.text,
    ).toContain("Thorin");
    expect(
      await ui.find({ type: "Button", key: "npc-Bartel-0" }),
    ).toBeDefined();
    expect(await ui.find({ type: "Button", key: "snd-0" })).toBeDefined();
    // spoiler-safe by default: the whisper's words are not drawn
    expect(await ui.find({ type: "Text", text: /Flüstern/ })).toBeUndefined();
    await ui.unmount();
  }
  // Opening the pane only read.
  expect(calls.map((c) => c.tool).sort()).toEqual(["campaign", "table_state"]);
});

test("GM buttons call the right Studio tool only on press", async ($, on) => {
  const calls: Call[] = [];
  engine(on, calls);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const ui = await $.ui.mount({ ...PANE, surface: "desktop" });
  const writes = (): Call[] =>
    calls.filter((c) => c.tool !== "table_state" && c.tool !== "campaign");
  expect(writes()).toEqual([]);

  await ui.press({ key: "npc-Bartel-0" });
  expect(writes()[0]).toEqual({
    tool: "say_line",
    args: { voice: "Bartel", text: "Na, ihr da!", how: "say:warm:normal" },
  });

  await ui.press({ key: "snd-0" });
  expect(writes()[1]).toEqual({
    tool: "play_sound",
    args: { sound: "dnd/rain.flac", loop: true, volume: 0.25 },
  });

  await ui.input({ key: "ini-order", text: "Wolf 1, Thorin" });
  await ui.press({ key: "ini-next" });
  // First next: the first in line (a foe clears the spotlight), then Thorin.
  expect(writes()[2]).toEqual({ tool: "spotlight", args: { who: "" } });
  await ui.press({ key: "ini-next" });
  expect(writes()[3]).toEqual({ tool: "spotlight", args: { who: "Thorin" } });
  await ui.unmount();
});

test("the launcher row hides without a live table and shows scene, round and turn as a button with one", async ($, on) => {
  const calls: Call[] = [];
  engine(on, calls, { ...TABLE, players_window: false });
  on("ui.render", ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>engine</Text>;
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });

  let band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await band.find({ type: "Button", key: "launch-dnd-table" }),
  ).toBeUndefined();
  await band.unmount();

  await $.command.run({ command: "dnd-scene", args: "" } as never);
  band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await band.find({ type: "Button", key: "launch-dnd-table" }),
  ).toBeUndefined();
  await band.unmount();

  await $.tool.call({
    tool: "mcp__dnd-studio__initiative",
    action: "set",
    order: ["Thorin", "Wolf 1"],
  } as never);
  band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    (await band.find({ type: "Button", key: "launch-dnd-table" }))?.text,
  ).toBe("Das Tor · Runde 1");
  // The chip is the plugin's launcher row, keyed for the strip merger.
  expect(await band.find({ type: "Button", key: "launch-dnd" })).toBeDefined();
  await band.unmount();

  // The first next after set gives the FIRST in line the turn (not the second).
  const first = await $.tool.call({
    tool: "mcp__dnd-studio__initiative",
    action: "next",
  } as never);
  expect(JSON.stringify(first)).toContain("Round 1: Thorin's turn.");
  band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    (await band.find({ type: "Button", key: "launch-dnd-table" }))?.text,
  ).toBe("Das Tor · Runde 1 · Thorin ist dran");
  // Pressing the state opens the pane on the Table tab.
  await band.press({ key: "launch-dnd-table" });
  await band.unmount();
  await $.tool.call({
    tool: "mcp__dnd-studio__initiative",
    action: "next",
  } as never);
  const wrap = await $.tool.call({
    tool: "mcp__dnd-studio__initiative",
    action: "next",
  } as never);
  expect(JSON.stringify(wrap)).toContain("Round 2: Thorin's turn.");
});

test("handouts for one player are denied on the shared window; ordinary scenes pass", async ($, on) => {
  const calls: Call[] = [];
  engine(on, calls);
  on("tool.check", () => ({ decision: "allow" }));
  const leak = await $.tool.check({
    tool: "mcp__plugin_dnd-studio_dnd-studio__show_players",
    input: { title: "Handout: Der Brief (für Mara)" },
  } as never);
  expect(leak.decision).toBe("deny");
  const fine = await $.tool.check({
    tool: "mcp__plugin_dnd-studio_dnd-studio__show_players",
    input: { title: "Das Tor" },
  } as never);
  expect(fine.decision).toBe("allow");
});
