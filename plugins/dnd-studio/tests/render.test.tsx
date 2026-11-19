import { expect, test } from "claude-code/testing";
import { findShown } from "./shown";

import { band, pane, PREFIX, toolResult, world } from "./world";

const TABS = ["table", "build", "review", "health"] as const;
const SURFACES = ["terminal", "desktop", "vscode", "mobile"] as const;
const SIZES = [
  [40, 15],
  [120, 40],
] as const;

test("render check: every tab (and the band) on every surface, small and large, stays inside the body width", async ($, on) => {
  world(on);
  on("http.fetch", () => ({
    value: { status: 401, ok: false, headers: {}, text: "" } as never,
  }));
  on("tool.call", (_, e) =>
    e.tool === `${PREFIX}discord`
      ? (toolResult({
          delivered: false,
          to: "Thorin",
          reason: "dms_closed",
          why: "Thorin's DMs are closed for the bot: a very long reason that must be cut",
        }) as never)
      : (toolResult({ ok: true }) as never),
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  // Fill every section: a plan waiting for sign-off, reviewers, interjections, a whisper, the checklist.
  await $.agent.spawn({
    tool_use_id: "t1",
    prompt: "Plan-Datei: ~/kampagne/plan.md",
    description: "arch1",
    subagentType: "dnd-studio:pnp-architekt",
    parentModel: "opus",
  } as never);
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "x",
    agentId: "arch1",
    reason: "answer",
  } as never);
  await $.command.run({ command: "dnd", args: "build" } as never);
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.prompt.submit({
    text: "Eine sehr lange Notiz des Menschen mitten im Spiel, die weit über jede schmale Breite hinausgeht\u001b[31m rot",
    origin: { kind: "composer" },
  } as never);
  await $.tool.call({
    tool: `${PREFIX}discord`,
    input: { action: "whisper", hero: "Thorin", text: "x" },
  } as never);

  let opened = false;
  for (const tab of TABS) {
    await $.command.run({ command: "dnd", args: tab } as never);
    for (const surface of SURFACES)
      for (const [cols, rows] of SIZES) {
        const ui = await $.ui.mount({ ...pane(cols, rows), surface });
        // open the collapsed sections once (the kit keeps them open) so their rows are drawn too
        if (tab === "table" && !opened) {
          for (const key of ["sec-dice"])
            await ui.press({ key });
          opened = true;
        }
        if (tab === "table" && cols === 120) {
          expect(
            await findShown(ui, /^Einwürfe/),
          ).toBeDefined();
          expect(
            await findShown(ui, /dms_closed/),
          ).toBeDefined();
        }
        if (tab === "build" && cols === 120)
          expect(await findShown(ui, /wartet auf Freigabe/)).toBeDefined();
        const texts = await ui.findAll({ type: "Text" });
        expect(texts.length).toBeGreaterThan(1);
        for (const t of texts) {
          expect(t.text).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f]/);
          // graphical surfaces wrap and cut text themselves; the terminal must fit the body
          for (const line of surface === "terminal" ? t.text.split("\n") : [])
            if ([...line].length > cols)
              throw new Error(
                `${tab}/${surface}/${cols}: "${line}" is wider than ${cols}`,
              );
        }
        expect(
          await ui.find({ type: "Button", key: `tab-${tab}` }),
        ).toBeDefined();
        await ui.unmount();
      }
  }

  for (const surface of SURFACES) {
    const b = await $.ui.mount({ ...band(40), surface });
    const texts = await b.findAll({ type: "Text" });
    expect(texts.some((t) => /Tisch läuft/.test(t.text))).toBe(true);
    for (const t of texts)
      expect(t.text).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f]/);
    await b.unmount();
  }
});
