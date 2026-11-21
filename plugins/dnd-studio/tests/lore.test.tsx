// Tabs Welt and Lore: the Studio's lore tool faked with the Ödland of „Die Rostmark-Chroniken“; numbered steps like
// the Bau tab's „Bau-Abschnitte“, fed by lore_progress or the vault's counts; buttons that ask Claude.
import { expect } from "claude-code/testing";
import { test } from "./limits";

import { kitRuleLines } from "./kit-rules";
import { findShown } from "./shown";
import { CAMPAIGN, pane, world } from "./world";
import { stepViews, mapOf } from "../lib/lore";

const OEDLAND_MAP = {
  world: "Ödland",
  kinds: {
    world: [{ title: "Ödland", tags: [], status: "canon" }],
    theme: [{ title: "Hoffnung im Rauschen", tags: [], status: "canon" }],
    place: [
      { title: "Rostmark", tags: ["rostmark"], status: "canon" },
      { title: "Kesselheim", tags: ["rostmark"], status: "canon" },
      { title: "Schutzraum 12", tags: ["spoiler"], status: "draft" },
    ],
    faction: [{ title: "Kesselheimer Rat", tags: [], status: "draft" }],
    technology: [{ title: "Strahlung", tags: [], status: "canon" }],
    character: [{ title: "Ansagerin von Radio Kesselheim", tags: [], status: "draft" }],
  },
  open: ["Wer sendet auf 87,5?"],
  recent: [{ title: "Kesselheim", kind: "place", updated: "2026-11-21T14:05:00Z" }],
};
const WORLDS = {
  worlds: [
    {
      world: "Ödland",
      notes: 9,
      kinds: { world: 1, theme: 1, place: 3, faction: 1, technology: 1, character: 1, question: 1 },
      campaigns: ["Die Rostmark-Chroniken"],
    },
  ],
};
const NOTE = {
  title: "Kesselheim",
  world: "Ödland",
  kind: "place",
  tags: ["rostmark"],
  status: "canon",
  body: "Kesselheim ist die größte Siedlung der [[Rostmark]], um einen erloschenen Kühlturm gebaut.\n\n## Geheim (Spielleitung)\nDer Kühlturm wird wieder warm.",
  links: ["Rostmark", "Kesselheimer Rat"],
  backlinks: ["Radio Kesselheim"],
  updated: "2026-11-21T14:05:00Z",
  sources: ["kampagne:Die Rostmark-Chroniken"],
};

type Call = { tool: string; args: Record<string, unknown> };

/**
 * Fakes the Studio's MCP tool `lore` (map, search, read) in its real shapes; `worlds` and `map` change what it
 * answers, `old` is a Studio without the tool.
 */
function studio(
  w: ReturnType<typeof world>,
  o: { worlds?: unknown; map?: unknown; old?: boolean } = {},
): Call[] {
  w.answers.lore = (a: Record<string, unknown>) => {
    const body = o.old
      ? "unknown tool lore"
      : a.action === "map"
        ? a.world ? (o.map ?? OEDLAND_MAP) : (o.worlds ?? WORLDS)
        : a.action === "search"
          ? [{ title: "Kesselheim", world: "Ödland", kind: "place", tags: [], snippet: "größte Siedlung der Rostmark", score: 3 }]
          : a.action === "read" ? [NOTE] : {};
    return [{ type: "text", text: typeof body === "string" ? body : JSON.stringify(body) }];
  };
  return w.calls as Call[];
}
const lore = (calls: Call[]) => calls.filter((c) => c.tool === "lore").map((c) => c.args);

const OEDLAND_CAMPAIGN = { ...CAMPAIGN, open: "Die Rostmark-Chroniken" };

test("Lore tab: the world's state, six numbered steps, browse, search and read a note; the kit rules hold", async ($, on) => {
  const seen = studio(world(on, { campaign: OEDLAND_CAMPAIGN }));
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "lore" } as never);
  expect(lore(seen)).toContainEqual({ action: "map" });
  expect(lore(seen)).toContainEqual({ action: "map", world: "Ödland" });
  const ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  expect(await ui.find({ type: "Button", key: "tab-lore" })).toBeDefined();
  expect(await findShown(ui, "Lore-Abschnitte")).toBeDefined();
  // Bestand sichten and Notizen (8 of 5) done, Geheimes markieren done (a spoiler tag): 3 of 6
  expect(await findShown(ui, "3 von 6")).toBeDefined();
  expect(await findShown(ui, "Kanon-Abgleich nach dem Abend")).toBeDefined();
  expect(await findShown(ui, /^8 Notizen · 3 Orte/)).toBeDefined();
  expect(await findShown(ui, "Wer sendet auf 87,5?")).toBeDefined();
  expect(kitRuleLines(await ui.drawn())).toEqual([]);

  // browse by kind: the world note first, then Orte and Fraktionen
  await ui.press({ key: "lore-kind-place" });
  expect(await findShown(ui, "Schutzraum 12")).toBeDefined();
  await ui.press({ key: "lore-kind-faction" });
  expect(await findShown(ui, "Kesselheimer Rat")).toBeDefined();

  // read a note
  await ui.press({ key: "lore-n-faction-0-read" });
  expect(lore(seen)).toContainEqual({ action: "read", world: "Ödland", title: "Kesselheimer Rat" });
  expect(await findShown(ui, /größte Siedlung der \[\[Rostmark\]\]/)).toBeDefined();
  expect(await findShown(ui, "Radio Kesselheim")).toBeDefined();
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.press({ key: "lore-note-close" });
  expect(await findShown(ui, /größte Siedlung der \[\[Rostmark\]\]/)).toBeUndefined();
  await ui.unmount();
});

test("Lore tab: the search asks the Studio with world and limit and lists the hits", async ($, on) => {
  const seen = studio(world(on));
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "lore" } as never);
  const ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  await ui.input({ key: "lore-search", text: "Kessel" });
  expect(lore(seen).find((a) => a.action === "search")).toEqual({ action: "search", query: "Kessel", world: "Ödland", limit: 20 });
  expect(await findShown(ui, "Treffer")).toBeDefined();
  expect(await findShown(ui, /größte Siedlung der Rostmark/)).toBeDefined();
  await ui.unmount();
});

test("Welt tab: ten steps from the vault's counts, lore_progress overrides one, the step button asks Claude", async ($, on) => {
  const w = world(on);
  studio(w);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "welt" } as never);
  const ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  expect(await findShown(ui, "Welt-Abschnitte")).toBeDefined();
  // Idee/Kern (world + theme), Geografie (3 places) and Technik (Strahlung) done; the others begun or open
  expect(await findShown(ui, "3 von 10")).toBeDefined();
  expect(await findShown(ui, "Fraktionen & Mächte")).toBeDefined();
  expect(kitRuleLines(await ui.drawn())).toEqual([]);

  const out = await $.tool.call({
    tool: "mcp__dnd-studio__lore_progress",
    flow: "welt",
    world: "Ödland",
    step: 3,
    state: "done",
    note: "2 Völker, 1 Kult",
  } as never);
  expect(JSON.stringify(out)).toContain("Völker & Kulturen");
  expect(await findShown(ui, "4 von 10")).toBeDefined();
  expect(await findShown(ui, /2 Völker, 1 Kult/)).toBeDefined();

  // the next open step is 4: its button sends one prompt naming the skill, the step and the world
  await ui.press({ key: "welt-step-4" });
  expect(w.submitted).toHaveLength(1);
  expect(w.submitted[0]).toContain("pnp-weltenbau");
  expect(w.submitted[0]).toContain("Fraktionen & Mächte");
  expect(w.submitted[0]).toContain("„Ödland“");
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();
});

test("Welt tab: a world without notes offers „Aus Kampagne übernehmen“ (lore from_campaign) for the open campaign", async ($, on) => {
  const w = world(on, { campaign: OEDLAND_CAMPAIGN });
  studio(w, {
    worlds: { worlds: [{ world: "Ödland", notes: 0, kinds: {}, campaigns: ["Die Rostmark-Chroniken"] }] },
    map: { world: "Ödland", kinds: {}, open: [], recent: [] },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never); // reads the open campaign
  await $.command.run({ command: "dnd", args: "world" } as never);
  const ui = await $.ui.mount({ ...pane(90, 80), surface: "desktop" });
  expect(await findShown(ui, /Lore aus der Kampagne übernehmen/)).toBeDefined();
  await ui.press({ key: "welt-from-campaign" });
  expect(w.submitted).toHaveLength(1);
  expect(w.submitted[0]).toContain("lore from_campaign");
  expect(w.submitted[0]).toContain("„Die Rostmark-Chroniken“");
  expect(kitRuleLines(await ui.drawn())).toEqual([]);
  await ui.unmount();
});

test("Lore tab: an old Studio without the routes says so in the status line", async ($, on) => {
  studio(world(on), { old: true });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "lore" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(await findShown(ui, /kennt die Lore noch nicht/)).toBeDefined();
  expect(await findShown(ui, "Lore noch nicht gelesen")).toBeDefined();
  await ui.unmount();
});

test("steps: a report wins over the counts; question notes begin step 5 of the lore", () => {
  const map = mapOf(OEDLAND_MAP);
  const lore = stepViews("lore", {}, map, undefined);
  expect(lore[4]).toMatchObject({ state: "active", detail: "pnp-lore · pnp-weltenbau · 1 offen" });
  const welt = stepViews("welt", { "10": { state: "done", note: "keine Widersprüche", at: 1 } }, map, undefined);
  expect(welt[9]).toMatchObject({ state: "done", detail: "pnp-weltenbau · keine Widersprüche" });
  expect(welt[3]?.state).toBe("active"); // one faction of two
});

test("Welt and Lore: the terminal at 48 columns cuts no button and no line", async ($, on) => {
  studio(world(on));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  for (const tab of ["world", "lore"])
    for (const cols of [48, 120]) {
      await $.command.run({ command: "dnd", args: tab } as never);
      const ui = await $.ui.mount({ ...pane(cols, 80), surface: "terminal" });
      expect(
        kitRuleLines(await ui.drawn(), {
          cols,
          skip: ["one-primary", "card-in-card", "actions-last"],
          allow: [/^tab-/],
        }),
      ).toEqual([]);
      for (const t of await ui.findAll({ type: "Text" }))
        for (const line of t.text.split("\n")) expect([...line].length).toBeLessThanOrEqual(cols);
      expect(await findShown(ui, tab === "world" ? /Welt-Abschnitte/ : /Lore-Abschnitte/)).toBeDefined();
      await ui.unmount();
    }
});
