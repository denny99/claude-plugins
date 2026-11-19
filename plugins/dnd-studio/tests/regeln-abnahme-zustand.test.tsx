/** The design rules (tests/kit-rules.ts) on the tabs Abnahme and Zustand, drawn on the desktop in their main states. */
import { expect, test } from "claude-code/testing";

import { resetAutoOpen } from "../features/dnd-ui";
import { kitRuleLines } from "./kit-rules";
import { findShown } from "./shown";
import { pane, world } from "./world";

test("rules: tab Abnahme empty, waiting, judged with the note open, and sent", async ($, on) => {
  resetAutoOpen();
  world(on);
  on("process.run", () => ({ value: { code: 0, stdout: "", stderr: "" } }) as never);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "review" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(await ui.find({ type: "Button", text: /Abnahme/ })).toBeDefined(); // the tab's word; its id stays "review"
  expect(kitRuleLines(await ui.drawn())).toEqual([]);

  await $.tool.call({
    tool: "mcp__dnd-studio__review",
    action: "add",
    items: [
      { name: "Brann", kind: "image", source: "https://x.test/brann.png" },
      { name: "Tor", kind: "image", source: "https://x.test/tor.png" },
      { name: "Torknarren", kind: "sound", source: "https://x.test/tor.wav", meta: "Geräusch · 4 s" },
    ],
  } as never);
  const ids = [0, 1].map((n) => `r${(1_700_000_000_000).toString(36)}${n}`);
  // the hint stands once per card, however many rows wait
  expect((await ui.findAll({ type: "Text" })).filter((t) => /Erst ansehen, dann urteilen/.test(t.text))).toHaveLength(1);
  expect(kitRuleLines(await ui.drawn())).toEqual([]);

  for (const id of ids) {
    await ui.press({ key: `rv-reveal-${id}` });
    await ui.press({ key: `rv-open-${id}` });
  }
  await ui.press({ key: `rv-${ids[0]}-details` });
  await ui.press({ key: `rv-redo-${ids[0]}` });
  await ui.press({ key: `rv-ok-${ids[1]}` });
  expect(await ui.find({ type: "Input", key: `rv-note-${ids[0]}` })).toBeDefined();
  expect(kitRuleLines(await ui.drawn())).toEqual([]);

  await ui.press({ key: "rv-send" });
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();
});

test("rules: tab Zustand connected, and with the app down and an old server in the way", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "health" } as never);
  let ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(await findShown(ui, /^Zuletzt geprüft um \d\d:\d\d\.$/)).toBeDefined();
  expect(await findShown(ui, "Alter Studio-Server")).toBeUndefined(); // only when there is one
  expect(await ui.find({ type: "Button", key: "reconfigure" })).toBeUndefined();
  // the listener is switched in the Tisch tab only; seven settings, each a row with its state as a pill
  expect(await findShown(ui, /Zuhörer/)).toBeUndefined();
  expect(
    (await ui.findAll({ type: "Svg" })).filter((x) => /^(an|aus)$/.test(String(x.props.alt))),
  ).toHaveLength(7);
  expect((await ui.find({ type: "Button", key: "rule-buildLooks" }))?.text).toMatch(/^(Ein|Aus)schalten$/);
  const reload = await ui.find({ type: "Button", key: "refresh" });
  expect(JSON.stringify(reload)).toContain("Neu laden");
  expect(JSON.stringify(reload)).not.toContain("Aktualisieren");
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.press({ key: "toggle-spoilerSafe" });
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();

  w.registerError = "refused";
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "health" } as never);
  ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(await findShown(ui, "Alter Studio-Server")).toBeDefined();
  // a problem card never repeats the header's „Neu laden“
  expect(await ui.find({ type: "Button", key: "probe-clash" })).toBeUndefined();
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();
});
