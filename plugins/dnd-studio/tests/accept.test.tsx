import { expect, test } from "claude-code/testing";

import { findShown } from "./shown";

import { headCounts } from "../features/build";
import { acceptanceOf, gpuOf } from "../lib/model";
import { CAMPAIGN, MAPS, pane, STATUS, world } from "./world";

test("pure: the §4 checklist names what is missing and who fixes it", () => {
  const items = acceptanceOf(CAMPAIGN, MAPS, "10/12, 2 failed");
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  expect(by.scenes).toMatchObject({
    status: "failed",
    counts: "1/2",
    detail: "Im Wald (Bild/Vorlesetext/Ablauf)",
    fix: "pnp-maler, pnp-texter",
  });
  expect(by.maps).toMatchObject({
    status: "failed",
    detail: "Bree",
    fix: "pnp-maler",
  });
  expect(by.pins).toMatchObject({
    status: "failed",
    counts: "1/2",
    detail: "Wald",
    fix: "pnp-maler",
  });
  // The mute dog needs no voice; Bartel lacks his sheet.
  expect(by.npcs).toMatchObject({
    status: "failed",
    counts: "1/2",
    detail: "Bartel (Werte)",
    fix: "pnp-texter",
  });
  expect(by.start).toMatchObject({ status: "ok", counts: "1/1" });
  expect(by.threads).toMatchObject({ status: "ok" });
  expect(by.broken).toMatchObject({ status: "ok", counts: "0" });
  expect(by.prepare).toMatchObject({
    status: "failed",
    fix: "pnp-tischbereit",
  });

  const empty = acceptanceOf({ open: "X", threads: [], scenes: [] }, {}, "");
  const e = Object.fromEntries(empty.map((i) => [i.key, i]));
  expect(e.threads?.status).toBe("warning");
  expect(e.prepare).toMatchObject({
    status: "idle",
    counts: "noch nicht gelaufen",
    fix: "pnp-tischbereit",
  });
  expect(e.scenes).toMatchObject({ status: "failed", fix: "pnp-texter" });
  expect(e.pins?.counts).toBe("entfällt (noch nichts da)");

  const noStart = acceptanceOf(
    {
      ...CAMPAIGN,
      scenes: [
        {
          title: "Das Tor",
          place: "Bree",
          text: "t",
          notes: "Rezept",
          picture: "p",
        },
      ],
    },
    MAPS,
    "12/12",
  );
  expect(noStart.find((i) => i.key === "start")).toMatchObject({
    status: "failed",
    fix: "pnp-texter",
  });
  expect(noStart.find((i) => i.key === "prepare")?.status).toBe("ok");

  expect(gpuOf(STATUS, 1)).toMatchObject({
    running: 1,
    queued: 1,
    step: "KSampler",
    progress: 40,
  });
  expect(gpuOf({ jobs: [] }, 1)).toMatchObject({ running: 0, queued: 0 });
});

test("Build: Check reads campaign, maps and studio_status; rows show status and fix hints; spoiler-safe hides names", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  // the campaign in parts (overview, then each checked list), never one whole get
  expect(w.calls.map((c) => c.tool)).toEqual([
    "campaign",
    "campaign",
    "campaign",
    "campaign",
    "map",
    "studio_status",
  ]);
  expect(w.calls[0]?.args).toEqual({ overview: true });
  expect(w.calls[1]?.args).toEqual({ only: ["scenes"] });
  expect(w.calls[4]?.args).toEqual({ action: "list" });

  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect((await findShown(ui, /GPU belegt/))?.text).toBe(
    "● GPU belegt · 1 läuft, 1 warten 40%",
  );
  expect(
    await findShown(ui, /Szenen mit Bild, Vorlesetext und Ablauf · 1\/2/),
  ).toBeDefined();
  expect(await findShown(ui, /Karten gemalt/)).toBeDefined();
  expect(
    await findShown(ui, /Startfelder in den Szenen · 1\/1/),
  ).toBeDefined();
  expect(await findShown(ui, /Offene Fäden und wo die Gruppe steht/)).toBeDefined();
  expect(await findShown(ui, /Stimmen vorbereitet · noch nicht gelaufen/)).toBeDefined();
  expect(await findShown(ui, /beheben: Maler, Texter/)).toBeDefined();
  expect(await findShown(ui, /starten: Stimmen-Macher/)).toBeDefined();
  expect(await findShown(ui, /pnp-/)).toBeUndefined();
  // spoiler-safe by default: counts, no names
  expect(await findShown(ui, /Im Wald/)).toBeUndefined();
  await ui.unmount();
});

test("Build: the plan is signed off by a press, recorded, and the main thread is told to go on", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.agent.spawn({
    tool_use_id: "t1",
    prompt: "Entwirf den Bauplan. Plan-Datei: ~/kampagne/plan.md",
    description: "arch1",
    subagentType: "dnd-studio:pnp-architekt",
    parentModel: "opus",
  } as never);
  await $.command.run({ command: "dnd", args: "build" } as never);
  let ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(await findShown(ui, /schreibt den Bauplan/)).toBeDefined();
  expect(
    await ui.find({ type: "Button", key: "plan-approve" }),
  ).toBeUndefined();
  await ui.unmount();

  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "x",
    agentId: "arch1",
    reason: "answer",
  } as never);
  ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(
    await findShown(ui, /Bauplan wartet auf deine Freigabe/),
  ).toBeDefined();
  expect(w.submitted).toEqual([]);
  // the Build tab names the campaign it builds
  expect(await findShown(ui, /Bau-Abschnitte · Breeland/)).toBeDefined();
  // two steps: the first press asks into which campaign, only the yes sends
  await ui.press({ key: "plan-approve" });
  expect(w.submitted).toEqual([]);
  const yes = await ui.find({ type: "Text", text: /In „Breeland“ weiterbauen\?/ });
  expect(yes).toBeDefined();
  await ui.press({ key: "plan-approve" });
  expect(w.submitted.length).toBe(1);
  expect(w.submitted[0]).toContain("~/kampagne/plan.md");
  expect(w.submitted[0]).toContain("Texter");
  expect(w.submitted[0]).toContain("Ich habe den Bauplan");
  expect(w.submitted[0]).toContain("„Breeland“");
  expect(w.submitted[0]).toContain("vor dem ersten Schreibaufruf");
  expect((w.store.get("plan-approval") as { file: string }).file).toBe(
    "~/kampagne/plan.md",
  );
  await ui.unmount();

  ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(await findShown(ui, /✓ Bauplan abgesegnet/)).toBeDefined();
  // until Claude answered the sign-off the button says it went (kit „ask Claude“), a press sends nothing
  expect((await ui.findAll({ type: "Svg" })).some((el) => el.props.alt === "geschickt")).toBe(true);
  await ui.press({ key: "plan-approve" });
  expect(w.submitted.length).toBe(1);
  await ui.unmount();
  await $.turn.start({ turnId: "t-plan", text: w.submitted[0] } as never);
  await $.turn.complete({
    answer: "ok",
    durationMs: 1,
    isAborted: false,
    turnId: "t-plan",
    reason: "answer",
  } as never);
  ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(
    await ui.find({ type: "Button", key: "plan-approve" }),
  ).toBeUndefined();
  await ui.unmount();
});

test("Build: two GPU agents at once are flagged", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  for (const [id, type] of [
    ["m1", "pnp-maler"],
    ["k1", "pnp-klang"],
  ] as const)
    await $.agent.spawn({
      tool_use_id: id,
      prompt: "x",
      description: id,
      subagentType: type,
      parentModel: "opus",
    } as never);
  await $.command.run({ command: "dnd", args: "build" } as never);
  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(
    await findShown(ui, /Maler \+ Klang-Macher teilen sich gerade die GPU/),
  ).toBeDefined();
  await ui.unmount();
});

const CUT = {
  type: "text",
  text: "\n[OUTPUT TRUNCATED - exceeded 25000 token limit]\nThe tool output was truncated.",
};

test("Build: a list cut at the engine's output limit is read a few entries at a time by name", async ($, on) => {
  const overview = {
    ...CAMPAIGN,
    scenes: [
      { n: 1, title: "Das Tor", chars: 30, picture: true },
      { n: 2, title: "Im Wald", chars: 0, picture: false },
    ],
  };
  const w = world(on, {
    campaign: (a: Record<string, unknown>) => {
      if (a.overview)
        return [{ type: "text", text: JSON.stringify(overview) }];
      // the whole scene list is too big: cut JSON plus the engine's notice
      if (a.only && !a.names && (a.only as string[])[0] === "scenes")
        return [{ type: "text", text: JSON.stringify(CAMPAIGN).slice(0, 80) }, CUT];
      // a secret-waiting note block after the answer still parses
      return [
        { type: "text", text: JSON.stringify(CAMPAIGN) },
        { type: "text", text: '{"secret_waiting":1}' },
      ];
    },
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  expect(
    w.calls.some(
      (c) =>
        c.tool === "campaign" &&
        JSON.stringify(c.args.names) === JSON.stringify(["Das Tor", "Im Wald"]),
    ),
  ).toBe(true);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(
    await findShown(ui, /Szenen mit Bild, Vorlesetext und Ablauf · 1\/2/),
  ).toBeDefined();
  await ui.unmount();
});

test("Build: an answer that is no campaign shows an error, not zero counts", async ($, on) => {
  world(on, {
    campaign: () => [{ type: "text", text: '{"open": "Breel' }, CUT],
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(await findShown(ui, /zu lang und wurde abgeschnitten/)).toBeDefined();
  expect(await findShown(ui, /Szenen mit Bild/)).toBeUndefined();
  await ui.unmount();
});

/** A Studio whose answers the engine cuts above `limit` characters (as it does at 100 000), with `scenes` behind `names`. */
function cuttingStudio(
  scenes: Record<string, unknown>[],
  limit: number,
): (a: Record<string, unknown>) => unknown[] {
  const answer = (body: unknown) => {
    const text = JSON.stringify(body);
    return text.length > limit
      ? [{ type: "text", text: text.slice(0, limit) }, CUT]
      : [{ type: "text", text }];
  };
  return (a) => {
    if (a.overview)
      return answer({
        ...CAMPAIGN,
        scenes: scenes.map((s, i) => ({
          n: i + 1,
          title: s.title,
          place: s.place,
          chars: 100, // the overview's size understates the JSON (variants, sounds)
          picture: true,
        })),
      });
    const only = (a.only as string[] | undefined)?.[0];
    if (only !== "scenes") return answer(CAMPAIGN);
    const names = a.names as string[] | undefined;
    const rows = scenes
      .map((s, i) => ({ n: i + 1, ...s }))
      .filter((s) => !names || names.some((w) => String(s.title).includes(w)));
    return answer({ open: "Breeland", scenes: rows });
  };
}

test("Build: a big scene list is read whole, its reads halved until each fits under the engine's cut", async ($, on) => {
  const scenes = Array.from({ length: 20 }, (_, i) => ({
    title: `Szene ${String(i + 1).padStart(2, "0")}`,
    place: "Bree",
    text: "x".repeat(1500),
    notes: "Startfelder A1",
    picture: "/view?s=1",
  }));
  const w = world(on, { campaign: cuttingStudio(scenes, 5000) });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  const reads = w.calls
    .filter((c) => c.tool === "campaign" && Array.isArray(c.args.names))
    .map((c) => (c.args.names as string[]).length);
  // eight at a time are cut, then four, then two fit
  expect(reads.slice(0, 3)).toEqual([8, 4, 2]);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(
    await findShown(ui, /Szenen mit Bild, Vorlesetext und Ablauf · 20\/20/),
  ).toBeDefined();
  expect(await findShown(ui, /Startfelder in den Szenen · 20\/20/)).toBeDefined();
  expect(await findShown(ui, /nicht geprüft|zu groß/)).toBeUndefined();
  await ui.unmount();
});

test("Build: a part that cannot be read leaves its rows unchecked and locks the fix button", async ($, on) => {
  const scenes = [
    { title: "Das Tor", place: "Bree", text: "x".repeat(3000), notes: "", picture: "" },
    { title: "Im Wald", place: "Wald", text: "", notes: "", picture: "" },
  ];
  // even one scene is over the cut
  world(on, { campaign: cuttingStudio(scenes, 2000) });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(await findShown(ui, /Kampagne \(Szenen\): Antwort zu groß/)).toBeDefined();
  expect(
    await findShown(ui, /Szenen mit Bild, Vorlesetext und Ablauf · nicht geprüft/),
  ).toBeDefined();
  expect(await findShown(ui, /Startfelder in den Szenen · nicht geprüft/)).toBeDefined();
  expect(await findShown(ui, /0\/2/)).toBeUndefined();
  // the other rows still count: maps, pins and NPCs are open, scenes are not
  expect(await findShown(ui, "3 offen")).toBeDefined();
  expect(
    await ui.find({ type: "Button", text: /Offene Punkte beheben/ }),
  ).toBeUndefined();
  expect(await findShown(ui, /ist gesperrt, bis jeder Teil/)).toBeDefined();
  await ui.unmount();

  const items = acceptanceOf(CAMPAIGN, MAPS, "", ["scenes"]);
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  expect(by.scenes).toMatchObject({ status: "idle", fix: "", unchecked: true });
  expect(by.start).toMatchObject({ counts: "nicht geprüft", fix: "" });
  expect(by.pins?.unchecked).toBeUndefined();
});

test("Build: „Offene Punkte beheben“ asks first into which campaign, only the yes sends", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  await ui.press({ key: "check-fix" });
  expect(w.submitted).toEqual([]);
  expect(
    await ui.find({ type: "Text", text: /In „Breeland“ beheben lassen\?/ }),
  ).toBeDefined();
  await ui.press({ key: "check-fix" });
  expect(w.submitted.length).toBe(1);
  expect(w.submitted[0]).toContain("Abnahme-Check im D&D-Panel");
  await ui.unmount();
});

test("Build: „Erneut versuchen“ under the check's error is a real secondary button that checks again", async ($, on) => {
  const w = world(on, {
    campaign: () => [{ type: "text", text: '{"open": "Breel' }, CUT],
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  const retry = await ui.find({ type: "Button", key: "check-err-retry" });
  expect(retry?.text).toMatch(/Erneut versuchen/);
  expect(retry?.props.variant).toBe("secondary");
  expect(retry?.props.plain).toBeUndefined();
  const before = w.calls.length;
  await ui.press({ key: "check-err-retry" });
  expect(w.calls.length).toBeGreaterThan(before);
  await ui.unmount();
});

test("Build: in a narrow pane the check's rows wrap instead of cutting, the pill below the title", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  const ui = await $.ui.mount({ ...pane(40, 60), surface: "desktop" });
  const rows = (await ui.findAll({ type: "Text" })).filter((t) =>
    /^(Szenen mit Bild, Vorlesetext und Ablauf · 1\/2|Stimmen vorbereitet · noch nicht gelaufen)$/.test(t.text),
  );
  expect(rows.length).toBe(2);
  for (const r of rows) expect(r.props.wrap).toBe("wrap");
  expect(await findShown(ui, /beheben: Maler, Texter/)).toBeDefined();
  await ui.unmount();
});

test("Build: head counts say 1 Szene · 1 NPC · 1 Ort, more in plural", () => {
  expect(headCounts({ scenes: 1, npcs: 1, places: 1 })).toBe("1 Szene · 1 NPC · 1 Ort");
  expect(headCounts({ scenes: 2, npcs: 0, places: 3 })).toBe("2 Szenen · 0 NPCs · 3 Orte");
});

test("Build: a build agent's end checks the campaign again while the Build tab is open", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  const reads = () => w.calls.filter((c) => c.tool === "campaign").length;
  const first = reads();
  expect(first).toBeGreaterThan(0);
  await $.agent.spawn({
    tool_use_id: "t2",
    prompt: "Schreib die Szenen.",
    description: "tex1",
    subagentType: "dnd-studio:pnp-texter",
    parentModel: "opus",
  } as never);
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "y",
    agentId: "tex1",
    reason: "answer",
  } as never);
  // the check runs detached from the hook: wait until it has read the campaign again
  for (let i = 0; i < 50 && reads() < first * 2; i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(reads()).toBe(first * 2);
  // another tab open: no check
  await $.command.run({ command: "dnd", args: "health" } as never);
  const now = reads();
  await $.agent.spawn({
    tool_use_id: "t3",
    prompt: "Male die Orte.",
    description: "mal1",
    subagentType: "dnd-studio:pnp-maler",
    parentModel: "opus",
  } as never);
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "z",
    agentId: "mal1",
    reason: "answer",
  } as never);
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 10));
  expect(reads()).toBe(now);
});

// Ödland 2026-11-18: the region itself (Die Rostmark, no in) holds every place on its own map, and the campaign has no
// campaign map of its own: there is nowhere to put its marker, pin_place refuses ("no campaign map with a painted
// tile"), and the check stayed red at 96/97 for good
test("pure: a place with no in needs no marker while the campaign has no campaign map", () => {
  const campaign = {
    open: "Rostmark",
    worldMap: false,
    places: [
      { name: "Die Rostmark", in: "", map: "Rostmark Karte", marker: null },
      { name: "Schöneck", in: "Die Rostmark", map: "", marker: { x: 0.7, y: 0.58 } },
    ],
  };
  const pins = acceptanceOf(campaign, { maps: [] }, "").find((i) => i.key === "pins");
  expect(pins).toMatchObject({ status: "ok", counts: "1/1" });
  const withWorld = acceptanceOf({ ...campaign, worldMap: true }, { maps: [] }, "").find((i) => i.key === "pins");
  expect(withWorld).toMatchObject({ status: "failed", counts: "1/2", detail: "Die Rostmark" });
});
