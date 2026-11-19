// Paket 4: layout findings of the Table, Health, Build and Review tabs, the pill geometry and the launcher text.
import { expect, test } from "claude-code/testing";

import { bandEvening } from "../features/evening";
import { fileName } from "../features/build";
import { bandHint, orderExample } from "../features/table";
import { BAND_HINT_MAX, BAND_STATUS_MAX } from "../hooks/register";
import { toTableView } from "../lib/model";
import { pillSvg } from "../lib/ui";
import { findShown } from "./shown";
import { band, pane, PREFIX, TABLE, toolResult, world } from "./world";

test("pill: text centred in its box with 8 px on each side", () => {
  const { source, width } = pillSvg("nicht verbunden", "#000000", "#ffffff");
  expect(source).toContain('text-anchor="middle"');
  const x = Number(/<text x="([\d.]+)"/.exec(source)?.[1]);
  expect(Math.abs(x - width / 2)).toBeLessThanOrEqual(1);
  // "nicht verbunden": 4 narrow, 2 f/t/r, 1 space, 8 rest (7.1) and 2 pads of 8
  expect(width).toBeGreaterThanOrEqual(16 + 8 * 7.1);
});

test("no table running: a quiet empty state, no live buttons", async ($, on) => {
  world(on, { table_state: { ...TABLE, players_window: false, discord: false } });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(await findShown(ui, "Kein Tisch läuft")).toBeDefined();
  for (const key of ["pause-on", "ini-party", "end-clear", "sec-dice"])
    expect(await ui.find({ type: "Button", key })).toBeUndefined();
  await ui.unmount();
});

test("live table: folds closed behind the text action „Details“, Discord leave in the Discord card, fight end a real button", async ($, on) => {
  world(on, {
    table_state: { ...TABLE, scene: { kind: "show", title: "Das Tor" } },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  expect((await ui.find({ type: "Button", key: "sec-dice" }))?.text).toBe(
    "Details",
  );
  expect(await findShown(ui, /Athletik/)).toBeUndefined();
  await ui.press({ key: "sec-dice" });
  expect((await ui.find({ type: "Button", key: "sec-dice" }))?.text).toBe(
    "Schließen",
  );
  expect(await findShown(ui, /Athletik/)).toBeDefined();
  expect(await ui.find({ type: "Button", key: "end-leave" })).toBeUndefined();
  expect(
    (await ui.find({ type: "Button", key: "discord-leave" }))?.props.variant,
  ).toBe("secondary");
  expect((await ui.find({ type: "Button", key: "pause-on" }))?.text).toContain(
    "Pause",
  );
  await ui.unmount();
});

test("the fight-order example comes from the real group", () => {
  const view = toTableView(
    { party: ["Ada", "Borin"], status: {} } as never,
    {},
    0,
  );
  expect(orderExample(view)).toBe("z. B. Ada, Borin, Wolf 1");
});

test("launcher: the D&D starter says only „Tisch läuft · Runde N“, the scene stays in the Table tab", async ($, on) => {
  world(on, {
    table_state: {
      ...TABLE,
      scene: {
        kind: "show",
        title: "Ankunft im Krummen Krug nach der langen Reise durch den Nebel",
      },
    },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const b = await $.ui.mount({ ...band(), surface: "desktop" });
  expect(await b.find({ type: "Button", key: "launch-dnd-table" })).toBeUndefined();
  const texts = (await b.findAll({ type: "Text" })).map((x) => x.text);
  expect(texts.join(" ")).toMatch(/· Tisch läuft/);
  expect(texts.join(" ")).not.toContain("Krummen Krug");
  // "· " prefix plus at most BAND_STATUS_MAX / BAND_HINT_MAX characters
  for (const t of texts)
    expect([...t].length).toBeLessThanOrEqual(
      Math.max(BAND_HINT_MAX, BAND_STATUS_MAX) + 2,
    );
  await b.unmount();
});

test("launcher at a table with warn and bad hints: only the bad one in the band, status „Tisch läuft · Runde 2“; ok never", async ($, on) => {
  world(on);
  // bad: a whisper that did not reach its player (Discord DMs closed); warn: nobody listens to the players
  on("tool.call", (_, e) =>
    e.tool === `${PREFIX}discord`
      ? (toolResult({ delivered: false, to: "Thorin", reason: "dms_closed" }) as never)
      : (toolResult({ ok: true }) as never),
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.tool.call({ tool: "mcp__dnd-studio__initiative", action: "set", order: ["Thorin", "Mara"] } as never);
  for (let n = 0; n < 3; n++)
    await $.tool.call({ tool: "mcp__dnd-studio__initiative", action: "next" } as never);
  await $.tool.call({
    tool: `${PREFIX}discord`,
    input: { action: "whisper", hero: "Thorin", text: "x" },
  } as never);
  const b = await $.ui.mount({ ...band(), surface: "desktop" });
  const texts = (await b.findAll({ type: "Text" })).map((x) => x.text);
  expect(texts).toContain("· Tisch läuft · Runde 2");
  expect(texts).toContain("discord dms_closed");
  expect(texts.join(" ")).not.toMatch(/Spieler ungehört/);
  // the starter's status and one hint, nothing else
  expect(texts.filter((t) => t !== "D&D")).toEqual(["· Tisch läuft · Runde 2", "discord dms_closed"]);
  await b.unmount();
  // pure: bad before warn, ok never
  const hints = [
    { text: "gehört", tone: "ok" as const },
    { text: "still", tone: "warn" as const },
    { text: "kaputt", tone: "bad" as const },
  ];
  expect(bandHint(hints)?.text).toBe("kaputt");
  expect(bandHint(hints.slice(0, 2))?.text).toBe("still");
  expect(bandHint(hints.slice(0, 1))).toBeUndefined();
});

test("a listener that woke the GM is the normal hand-over, not a warning", () => {
  const ev = bandEvening(
    {
      listener: {
        running: [],
        returned: true,
        woke: true,
        why: "Ada fragt",
        between: [],
        turn: [],
      },
    } as never,
    true,
  );
  expect(ev.watching).toBe(true);
});

test("build: plan and findings show their file name, not the temp path", () => {
  expect(
    fileName("/private/tmp/claude-501/abc/scratchpad/maengel-technik.md"),
  ).toBe("maengel-technik.md");
  expect(fileName("C:\\tmp\\bauplan.md")).toBe("bauplan.md");
});
