/** Kit v3 in the D&D pane: native buttons with their glyph, the switch as one button, results Claude makes go to review. */
import { expect, test } from "claude-code/testing";

import { resetAutoOpen, SWITCH_OFF, SWITCH_ON } from "../features/dnd-ui";
import { findShown } from "./shown";
import { glyphLabel } from "../lib/icons";
import { pane, PREFIX, toolResult, world } from "./world";

test("kit v3: buttons are native with their glyph in front (if the action has one), the switch is one pressable button", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  let ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect((await ui.find({ type: "Button", key: "listener-on" }))?.text).toBe(
    glyphLabel("mic", "Zuhörer an"),
  );
  // the kit puts no glyph before „Aktualisieren“ / „Neu laden“ any more
  expect((await ui.find({ type: "Button", key: "discord-status" }))?.text).toBe(
    "Aktualisieren",
  );
  // nothing graphical inside or beside a button: the engine drops a Svg in a Button
  expect(
    JSON.stringify(await ui.find({ type: "Button", key: "listener-on" })),
  ).not.toContain("Svg");
  await ui.unmount();

  await $.command.run({ command: "dnd", args: "health" } as never);
  ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  // one place for the listener switch (Table tab); the health tab only says where it is
  expect(
    await ui.find({ type: "Button", key: "switch-listener" }),
  ).toBeUndefined();
  await ui.press({ key: "sec-settings" });
  expect(
    await findShown(ui, /Ein- und ausschalten im Tisch-Tab/),
  ).toBeDefined();
  expect(
    (await ui.find({ type: "Button", key: "rule-buildLooks" }))?.text,
  ).toMatch(new RegExp(`^(${SWITCH_OFF}|${SWITCH_ON}) Bau-Looks · (an|aus)$`));
  // the switch is calm: a secondary button (never a bright primary pill) with a small toggle naming its state
  expect(
    (await ui.find({ type: "Button", key: "rule-buildLooks" }))?.props.variant,
  ).toBe("secondary");
  const toggles = (await ui.findAll({ type: "Svg" })).filter((s) =>
    /^(an|aus)$/.test(String(s.props.alt)),
  );
  expect(toggles.length).toBeGreaterThanOrEqual(2);
  // the health card has no second refresh: the header's Aktualisieren probes
  expect(await ui.find({ type: "Button", key: "probe" })).toBeUndefined();
  await ui.unmount();
  await $.command.run({ command: "dnd", args: "table" } as never);
  const term = await $.ui.mount({ ...pane(90, 60), surface: "terminal" });
  expect((await term.find({ type: "Button", key: "listener-on" }))?.text).toBe(
    "Zuhörer an",
  );
  await term.unmount();
});

test("review: sounds make_sound makes and results made in this session go into the queue by themselves", async ($, on) => {
  resetAutoOpen();
  const w = world(on);
  on("tool.call", (_, e) =>
    e.tool === `${PREFIX}make_sound`
      ? (toolResult({ id: "j1", mode: "sound", queued: true }) as never)
      : e.tool === `${PREFIX}jobs`
        ? (toolResult({
            finished: true,
            jobs: [
              {
                id: "j1",
                done: true,
                results: [
                  { id: "r9", kind: "sound", file: "/out/tor_knarren.wav" },
                ],
              },
            ],
          }) as never)
        : e.tool === `${PREFIX}results`
          ? (toolResult([
              {
                id: "old",
                file: "/out/alt.wav",
                time: 1_600_000_000_000,
                who: "pnp-klang",
              },
              { id: "hand", file: "/out/hand.png", time: 1_700_000_000_500 },
              {
                id: "new",
                file: "/out/brann.png",
                time: 1_700_000_000_500,
                who: "pnp-maler",
                prompt: "x",
              },
            ]) as never)
          : (toolResult({ ok: true }) as never),
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.tool.call({
    tool: `${PREFIX}make_sound`,
    input: {
      kind: "effect",
      idea: "ein Tor knarrt",
      name: "Torknarren",
      seconds: 4,
    },
  } as never);
  await $.tool.call({
    tool: `${PREFIX}jobs`,
    input: { action: "wait", job_ids: ["j1"] },
  } as never);
  await $.tool.call({
    tool: `${PREFIX}results`,
    input: { action: "list" },
  } as never);
  // the same results again add nothing
  await $.tool.call({
    tool: `${PREFIX}results`,
    input: { action: "list" },
  } as never);

  const list = JSON.stringify(
    await $.tool.call({ tool: "mcp__dnd-studio__review" } as never),
  );
  expect(list).toContain("sound Torknarren · Geräusch · 4 s");
  expect(list).toContain("image brann");
  expect(list).not.toContain("alt");
  expect(list).not.toContain("hand");
  expect(list.match(/brann/g)?.length).toBe(1);
  expect(w.opened).toEqual(["dnd"]);
});
