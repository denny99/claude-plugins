/**
 * Runde 3 [5.3]: every line typed at a live table is an interjection, also while a pane button's prompt still waits in
 * the queue (live: „passt“ and a message sent into a running turn went missing). A plugin's own prompt never is one.
 */
import { expect } from "claude-code/testing";
import { test } from "./limits";

import { isPersonsPrompt } from "../features/evening";
import { resetAutoOpen } from "../features/dnd-ui";
import { pane, world } from "./world";

test("a line typed while a button's prompt waits in the queue still lands in the debrief", async ($, on) => {
  resetAutoOpen();
  const w = world(on);
  on("process.run", () => ({ value: { code: 0, stdout: "", stderr: "" } }) as never);
  // the button's prompt stays queued until released (the engine resolves $.prompt.submit once it is taken)
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  w.hold = async (text) => {
    if (/Passt: Tor/.test(text)) await held;
  };
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.tool.call({
    tool: "mcp__dnd-studio__review",
    action: "add",
    items: [{ name: "Tor", kind: "image", source: "https://x.test/tor.png" }],
  } as never);
  const id = `r${(1_700_000_000_000).toString(36)}0`;
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  await ui.press({ key: `rv-reveal-${id}` });
  await ui.press({ key: `rv-open-${id}` });
  await ui.press({ key: `rv-ok-${id}` });
  await ui.press({ key: "rv-send" });

  // typed meanwhile, as a normal message and into a running turn
  await $.prompt.submit({ text: "passt", origin: { kind: "composer" } } as never);
  await $.prompt.submit({ text: "hab ich nicht\n\n1 passt", origin: { kind: "composer" }, turnId: "t-run" } as never);
  release();
  await ui.unmount();

  expect(w.submitted.some((t) => t.includes("Passt: Tor"))).toBe(true);
  const file = w.writes.filter((x) => x.path.includes("debrief-")).at(-1)?.text ?? "";
  expect(file).toContain("passt");
  expect(file).toContain("hab ich nicht");
  expect(file).not.toContain("Passt: Tor");
});

test("a plugin's own prompt is never taken as the person's", () => {
  expect(isPersonsPrompt({ text: "Prüfergebnis …", origin: { kind: "plugin" } })).toBe(false);
  expect(isPersonsPrompt({ text: "passt", origin: { kind: "composer" } })).toBe(true);
  expect(isPersonsPrompt({ text: "passt", origin: { kind: "composer" }, isMeta: true })).toBe(false);
});
