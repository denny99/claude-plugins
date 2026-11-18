// Paket 4: layout findings of the Table, Health, Build and Review tabs, the pill geometry and the launcher text.
import { expect, test } from "claude-code/testing";

import { bandEvening } from "../features/evening";
import { fileName } from "../features/build";
import { orderExample } from "../features/table";
import { BAND_HINT_MAX, BAND_STATUS_MAX } from "../hooks/register";
import { toTableView } from "../lib/model";
import { pillSvg } from "../lib/ui";
import { findShown } from "./shown";
import { band, pane, TABLE, world } from "./world";

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

test("live table: folds closed with a chevron, Discord leave in the Discord card, fight end a real button", async ($, on) => {
  world(on, {
    table_state: { ...TABLE, scene: { kind: "show", title: "Das Tor" } },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  expect((await ui.find({ type: "Button", key: "sec-dice" }))?.text).toBe("▸");
  expect(await findShown(ui, /Athletik/)).toBeUndefined();
  await ui.press({ key: "sec-dice" });
  expect((await ui.find({ type: "Button", key: "sec-dice" }))?.text).toBe("▾");
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
  expect(orderExample(view)).toBe("Reihenfolge, z. B. Ada, Borin, Wolf 1");
});

test("launcher: status and hints are cut with … at a short length", async ($, on) => {
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
  const btn = await b.find({ type: "Button", key: "launch-dnd-table" });
  expect([...(btn?.text ?? "")].length).toBeLessThanOrEqual(BAND_STATUS_MAX);
  expect(btn?.text).toContain("…");
  for (const t of (await b.findAll({ type: "Text" })).map((x) => x.text))
    expect([...t].length).toBeLessThanOrEqual(
      Math.max(BAND_HINT_MAX, BAND_STATUS_MAX),
    );
  await b.unmount();
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
