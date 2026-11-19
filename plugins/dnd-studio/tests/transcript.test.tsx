// Cards in the transcript: roll_dice's answer as a card at its result row (a hidden roll stays covered while
// spoiler-safe is on), the review verdict under a reviewed picture that results get shows. Foreign tools stay as they were.
import { expect } from "claude-code/testing";
import { test } from "./limits";

import { outputText, rollsOfAnswer } from "../features/transcript";
import { kitRuleLines } from "./kit-rules";
import { findShown, shownTexts } from "./shown";
import { toolResult, world } from "./world";

const start = { cwd: "/", surface: "desktop", isInteractive: true } as const;

const row = (tool: string, id: string, output: unknown) =>
  ({
    plugin: "dnd-studio",
    component: "ToolResult",
    requestId: id,
    props: { tool_use_id: id, tool, output, isErrored: false },
  }) as const;

const ROLL = "mcp__plugin_dnd-studio_dnd-studio__roll_dice";
const RESULTS = "mcp__plugin_dnd-studio_dnd-studio__results";
const text = (t: string) => [{ type: "text", text: t }];

test("roll_dice: the answer as a card; a whispered roll shows no number while spoiler-safe is on", async ($, on) => {
  world(on);
  await $.session.start(start);
  const open = text(
    JSON.stringify({
      who: "Thorin",
      label: "Athletik",
      total: 17,
      verdict: "Great success",
    }),
  );
  for (const surface of ["desktop", "terminal", "mobile"] as const) {
    const ui = await $.ui.mount({ ...row(ROLL, "toolu_roll1", open), surface });
    expect(await findShown(ui, "Wurf")).toBeDefined();
    expect(await findShown(ui, /Thorin · Athletik/)).toBeDefined();
    expect(await findShown(ui, /17/)).toBeDefined();
    if (surface === "desktop")
      expect(kitRuleLines(await ui.drawn())).toEqual([]);
    await ui.unmount();
  }
  const secret = text(
    JSON.stringify({
      rolls: [
        { who: "Brann", label: "Heimlichkeit", total: 4, whisper: "Brann" },
      ],
    }),
  );
  const ui = await $.ui.mount({
    ...row(ROLL, "toolu_roll2", secret),
    surface: "desktop",
  });
  expect(await findShown(ui, /verdeckter Wurf/)).toBeDefined();
  expect(await findShown(ui, /^4\b|· 4/)).toBeUndefined();
  await ui.unmount();
  // not readable (an error text): the Studio's own result stays
  const plain = await $.ui.mount({
    ...row(ROLL, "toolu_roll3", text("no dice")),
    surface: "desktop",
  });
  expect(await findShown(plain, "Wurf")).toBeUndefined();
  await plain.unmount();
  // a foreign tool is never drawn by dnd-studio
  const foreign = await $.ui.mount({
    ...row("mcp__other__roll_dice", "toolu_roll4", open),
    surface: "desktop",
  });
  expect(await findShown(foreign, "Wurf")).toBeUndefined();
  await foreign.unmount();
});

test("rollsOfAnswer reads one roll on top and a list of rolls", () => {
  expect(
    rollsOfAnswer(
      '{"rolls":[{"who":"A","total":3},{"who":"B","total":12,"hidden":true}]}',
    ),
  ).toMatchObject([
    { who: "A", total: "3", hidden: false },
    { who: "B", total: "12", hidden: true },
  ]);
  expect(rollsOfAnswer("not json")).toEqual([]);
  // The Studio's real answer for one roll: the roll sits under `result`.
  expect(
    rollsOfAnswer(
      '{"result":{"kind":"roll","who":"Spielleitung","label":"Probe","total":12,"verdict":""},"held":false}',
    ).map((r) => [r.who, r.label, r.total]),
  ).toEqual([["Spielleitung", "Probe", "12"]]);
  // The stored result handed over as an object, not as text.
  expect(
    rollsOfAnswer(outputText({ result: { who: "A", total: 7 }, held: false })).map((r) => r.total),
  ).toEqual(["7"]);
});

test("results get: a reviewed picture gets „Passt“ / „Nochmal“ under the Studio's own result; a press sets the verdict", async ($, on) => {
  world(on);
  // a picture made in this session: results list puts it into the review queue with its result id
  on("tool.call", (_, e) =>
    e.tool === RESULTS
      ? (toolResult([{ id: "res-42", file: "/out/brann.png", time: 1_700_000_000_500, who: "pnp-maler", prompt: "x" }]) as never)
      : (toolResult({ ok: true }) as never),
  );
  await $.session.start(start);
  await $.tool.call({ tool: RESULTS, input: { action: "list" } } as never);
  const got = text(JSON.stringify({ id: "res-42", prompt: "Brann am Tor" }));
  const ui = await $.ui.mount({ ...row(RESULTS, "toolu_res1", got), surface: "desktop" });
  expect(await findShown(ui, /brann/i)).toBeDefined();
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  const ok = (await ui.findAll({ type: "Button" })).find((b) => /^pic-ok-/.test(String(b.props.key)));
  expect(ok?.props.label).toContain("Passt");
  await ui.press({ key: String(ok!.props.key) });
  expect(await findShown(ui, /Als passend markiert/)).toBeDefined();
  await ui.unmount();
  // another result: nothing added
  const other = await $.ui.mount({ ...row(RESULTS, "toolu_res2", text('{"id":"res-7"}')), surface: "desktop" });
  expect((await other.findAll({ type: "Button" })).some((b) => /^pic-/.test(String(b.props.key)))).toBe(false);
  await other.unmount();
});

// Desktop asks for ToolUse, not ToolResult, while the tool row is its own: the app's row stays, the card under it.
const useRow = (
  tool: string,
  id: string,
  output: unknown,
  extra: Record<string, unknown> = {},
) =>
  ({
    plugin: "dnd-studio",
    component: "ToolUse",
    requestId: id,
    props: {
      tool_use_id: id,
      tool,
      input: {},
      output,
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      ...extra,
    },
  }) as const;

type Drawn = { type: string; children?: Drawn[]; props?: { key?: string } };

test("desktop ToolUse: roll_dice keeps the app row with the card under it; terminal and a running call keep the row alone", async ($, on) => {
  world(on);
  await $.session.start(start);
  const open = text(
    JSON.stringify({ who: "Thorin", label: "Athletik", total: 17 }),
  );
  const desk = await $.ui.mount({
    ...useRow(ROLL, "toolu_use1", open),
    surface: "desktop",
  });
  const tree = (await desk.drawn()) as Drawn;
  expect(tree.type).toBe("Box");
  expect(tree.children?.[0]).toMatchObject({ type: "engine" });
  expect(tree.children).toHaveLength(2);
  // the app's row and the card stand apart
  expect((tree as { props?: { gap?: number } }).props?.gap).toBe(1);
  expect(await findShown(desk, "Wurf")).toBeDefined();
  expect(await findShown(desk, /17/)).toBeDefined();
  expect(kitRuleLines(await desk.drawn())).toEqual([]);
  await desk.unmount();
  // a hidden roll stays covered here too
  const secret = text(
    JSON.stringify({
      rolls: [
        { who: "Brann", label: "Heimlichkeit", total: 4, whisper: "Brann" },
      ],
    }),
  );
  const hid = await $.ui.mount({
    ...useRow(ROLL, "toolu_use2", secret),
    surface: "desktop",
  });
  expect(await findShown(hid, /verdeckter Wurf/)).toBeDefined();
  expect(await findShown(hid, /^4\b|· 4/)).toBeUndefined();
  await hid.unmount();
  const term = await $.ui.mount({
    ...useRow(ROLL, "toolu_use1", open),
    surface: "terminal",
  });
  expect(await term.drawn()).toMatchObject({ type: "engine" });
  await term.unmount();
  const running = await $.ui.mount({
    ...useRow(ROLL, "toolu_use1", open, { isRunning: true }),
    surface: "desktop",
  });
  expect(await running.drawn()).toMatchObject({ type: "engine" });
  await running.unmount();
  // a foreign tool and an unreadable answer: the app's row alone
  for (const [tool, out] of [
    ["mcp__other__roll_dice", open],
    [ROLL, text("no dice")],
  ] as const) {
    const ui = await $.ui.mount({
      ...useRow(tool, "toolu_use3", out),
      surface: "desktop",
    });
    expect(await ui.drawn()).toMatchObject({ type: "engine" });
    await ui.unmount();
  }
});

test("desktop ToolUse: results get keeps the app row with „Passt“ / „Nochmal“ under it", async ($, on) => {
  world(on);
  on("tool.call", (_, e) =>
    e.tool === RESULTS
      ? (toolResult([{ id: "res-42", file: "/out/brann.png", time: 1_700_000_000_500, who: "pnp-maler", prompt: "x" }]) as never)
      : (toolResult({ ok: true }) as never),
  );
  await $.session.start(start);
  await $.tool.call({ tool: RESULTS, input: { action: "list" } } as never);
  const got = text(JSON.stringify({ id: "res-42", prompt: "Brann am Tor" }));
  const ui = await $.ui.mount({
    ...useRow(RESULTS, "toolu_res9", got),
    surface: "desktop",
  });
  const tree = (await ui.drawn()) as Drawn;
  expect(tree.children?.[0]).toMatchObject({ type: "engine" });
  const ok = (await ui.findAll({ type: "Button" })).find((b) =>
    /^pic-ok-/.test(String(b.props.key)),
  );
  expect(ok?.props.label).toContain("Passt");
  await ui.unmount();
  const term = await $.ui.mount({
    ...useRow(RESULTS, "toolu_res9", got),
    surface: "terminal",
  });
  expect(await term.drawn()).toMatchObject({ type: "engine" });
  await term.unmount();
});

test("roll_dice: one roll shows its total once (in its row, no title pill); several rolls keep the count", async ($, on) => {
  world(on);
  await $.session.start(start);
  const one = text(
    JSON.stringify({ result: { who: "Spielleitung", label: "2W6", total: 5, verdict: "" }, held: false }),
  );
  for (const [component, mk] of [
    ["ToolResult", () => row(ROLL, "toolu_once1", one)],
    ["ToolUse", () => useRow(ROLL, "toolu_once1", one)],
  ] as const) {
    const ui = await $.ui.mount({ ...mk(), surface: "desktop" });
    const fives = (await shownTexts(ui)).filter((t) => /(^|\D)5(\D|$)/.test(t));
    expect({ component, fives }).toEqual({ component, fives: [fives[0]] });
    expect(fives[0]).toMatch(/^5$|5 ·|· 5/);
    expect((await ui.findAll({ type: "Svg" })).map((x) => x.props.alt)).not.toContain("5");
    await ui.unmount();
  }
  const many = text(
    JSON.stringify({
      rolls: [
        { who: "A", label: "Athletik", total: 3 },
        { who: "B", label: "Akrobatik", total: 12 },
      ],
    }),
  );
  const ui = await $.ui.mount({ ...row(ROLL, "toolu_many1", many), surface: "desktop" });
  expect(await findShown(ui, "Würfe")).toBeDefined();
  expect(await findShown(ui, /A · Athletik/)).toBeDefined();
  expect(await findShown(ui, /^12\b|· 12/)).toBeDefined();
  await ui.unmount();
});
