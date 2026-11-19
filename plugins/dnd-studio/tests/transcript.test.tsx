// Cards in the transcript: roll_dice's answer as a card at its result row (a hidden roll stays covered while
// spoiler-safe is on), the review verdict under a reviewed picture that results get shows. Foreign tools stay as they were.
import { expect, test } from "claude-code/testing";

import { rollsOfAnswer } from "../features/transcript";
import { kitRuleLines } from "./kit-rules";
import { findShown } from "./shown";
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
