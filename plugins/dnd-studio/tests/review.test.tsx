import { expect } from "claude-code/testing";
import { test } from "./limits";
import { findShown } from "./shown";

import { resetAutoOpen } from "../features/dnd-ui";
import { isStudioPath, openArgv, playArgv, resultPrompt } from "../features/review";
import type { ReviewItem } from "../types";
import { pane, world } from "./world";

const ITEMS = [
  {
    name: "Torknarren",
    kind: "sound",
    source: "~/studio/out/tor.wav",
    meta: "Geräusch · 4 s",
  },
  {
    name: "Brann am Tor",
    kind: "image",
    source: "/tmp/brann.png",
    scene: "Szene 4",
  },
];

test("review: Claude fills the queue, the tab opens itself once, pictures stay covered until revealed, the result goes to Claude", async ($, on) => {
  resetAutoOpen();
  const w = world(on);
  const opened = w.opened;
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  expect(opened).toEqual([]); // never at session start

  const added = await $.tool.call({
    tool: "mcp__dnd-studio__review",
    action: "add",
    items: ITEMS,
  } as never);
  expect(JSON.stringify(added)).toContain("2 added");
  expect(opened).toEqual(["dnd"]);
  await $.tool.call({
    tool: "mcp__dnd-studio__review",
    action: "add",
    items: [{ name: "Krähen", kind: "sound", source: "/tmp/kr.wav" }],
  } as never);
  expect(opened).toEqual(["dnd"]); // once per session

  for (const surface of ["desktop", "terminal"] as const) {
    const ui = await $.ui.mount({ ...pane(90, 60), surface });
    expect(await findShown(ui, /^Neue Klänge$/)).toBeDefined();
    expect(await findShown(ui, /Brann am Tor/)).toBeUndefined();
    expect(await findShown(ui, /Szene 4/)).toBeUndefined();
    expect(await findShown(ui, /Szene verdeckt/)).toBeDefined();
    await ui.unmount();
  }

  const list = JSON.stringify(
    await $.tool.call({ tool: "mcp__dnd-studio__review" } as never),
  );
  expect(list).toContain("Torknarren");
  expect(list).toContain("offen");
});

test("review: the prompt names what passed and what the maker agent redoes with the note", () => {
  const base = { meta: "", scene: "", revealed: true, addedAt: 0, note: "" };
  const items: ReviewItem[] = [
    {
      ...base,
      id: "a",
      kind: "sound",
      name: "Torknarren",
      source: "/a.wav",
      agent: "pnp-klang",
      verdict: "ok",
    },
    {
      ...base,
      id: "b",
      kind: "sound",
      name: "Krähen",
      source: "/b.wav",
      agent: "pnp-klang",
      verdict: "redo",
      note: "weniger Hall",
    },
  ];
  const text = resultPrompt(items);
  expect(text).toContain("Passt: Torknarren");
  expect(text).toContain("Krähen");
  expect(text).toContain("„weniger Hall“");
  expect(text).toContain("pnp-klang");
});

test("review: local playback commands per OS", () => {
  expect(playArgv("macos", "/a.wav")).toEqual(["afplay", "/a.wav"]);
  expect(playArgv("linux", "/a.wav")?.[0]).toBe("paplay");
  expect(playArgv("windows", "C:\\a'b.wav")?.[3]).toContain("C:\\a''b.wav");
  expect(openArgv("macos", "https://x")).toEqual(["open", "https://x"]);
});

test("review: a Studio path is fetched through results save before playing; verdicts only after listening; a failed fetch is refused with its reason", async ($, on) => {
  resetAutoOpen();
  const w = world(on, {
    results: (a: Record<string, unknown>) => [
      {
        type: "text",
        text: JSON.stringify(
          a.action === "list"
            ? [{ id: "77", kind: "sound", mode: "Sound", file: "dnd-dland/tor_01.mp3 [output]", time: "2026-11-14T08:14:13.558Z", viaMcp: true }]
            : { folder: "/var/tmp/dnd-studio-review", saved: [{ id: "77", path: "/var/tmp/dnd-studio-review/tor_01.mp3" }] },
        ),
      },
    ],
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  const added = await $.tool.call({
    tool: "mcp__dnd-studio__review",
    action: "add",
    items: [{ name: "Tor", kind: "sound", source: "dnd-dland/tor_01.mp3" }],
  } as never);
  expect(JSON.stringify(added)).toContain("1 added");
  expect(w.calls.map((c) => c.args.action)).toEqual(["list", "save"]);
  expect(w.calls[1]?.args.folder).toBe("/var/tmp/dnd-studio-review");

  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(await findShown(ui, /Erst anhören, dann urteilen/)).toBeDefined();
  expect(await ui.find({ type: "Button", text: /Abspielen/ })).toBeDefined();
  expect(await ui.find({ type: "Button", text: /Passt/ })).toBeUndefined();
  await ui.unmount();

  // the Studio cannot hand the file over: refused with a reason, nothing added
  w.answers.results = () => [
    { type: "text", text: "[]" },
  ];
  const refused = JSON.stringify(
    await $.tool.call({
      tool: "mcp__dnd-studio__review",
      action: "add",
      items: [{ name: "Krähen", kind: "sound", source: "dnd-dland/kr.mp3" }],
    } as never),
  );
  expect(refused).toContain("Nothing added");
  expect(refused).toContain("not reviewable: dnd-dland/kr.mp3 is no Studio result");
});

// results list as the Studio answers it: a bare JSON array (anonymised from a real answer)
const LIST = [
  {
    id: "bf6c9fe5-74e8-452f-8cc7-3cb57c188867",
    kind: "image",
    mode: "Refine 2×",
    title: "Weltkarte V3",
    who: "Nobody",
    file: "dnd-x/images/2026-11-14 0909 new a map 2x_00001_.png [output]",
    time: "2026-11-14T08:14:13.558Z",
    viaMcp: true,
    parentId: "ba229d7c-031b-4964-855d-175e337cc720",
  },
  {
    id: "ba229d7c-031b-4964-855d-175e337cc720",
    kind: "sound",
    mode: "Sound",
    title: "Funk",
    who: "Nobody",
    file: "dnd-x\\sounds\\Funk_00001_.flac [output]",
    time: "2026-11-14T08:10:45.771Z",
    viaMcp: true,
  },
];

test("review: a Studio file is found in the real results list (array answer), with or without [output], by id or id prefix; a file without result is not reviewable", async ($, on) => {
  resetAutoOpen();
  const w = world(on, {
    results: (a: Record<string, unknown>) => [
      {
        type: "text",
        text: JSON.stringify(
          a.action === "list"
            ? LIST.filter((r) => !a.name || r.file.toLowerCase().replace(/\\/g, "/").includes(String(a.name).toLowerCase()))
            : { folder: "/t", saved: [{ id: (a.ids as string[])[0], file: `/t/${(a.ids as string[])[0]}.bin`, bytes: 9 }] },
        ),
      },
    ],
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  const add = async (source: string) =>
    JSON.stringify(
      await $.tool.call({
        tool: "mcp__dnd-studio__review",
        action: "add",
        items: [{ name: source, kind: "image", source }],
      } as never),
    );
  const saves = () => w.calls.filter((c) => c.args.action === "save").map((c) => (c.args.ids as string[])[0]);

  expect(await add("dnd-x/images/2026-11-14 0909 new a map 2x_00001_.png [output]")).toContain("1 added");
  expect(await add("dnd-x/images/2026-11-14 0909 new a map 2x_00001_.png")).toContain("1 added");
  expect(await add("dnd-x/sounds/funk_00001_.flac [output]")).toContain("1 added"); // Windows backslashes, other case
  expect(saves()).toEqual([LIST[0]!.id, LIST[0]!.id, LIST[1]!.id]);

  const before = w.calls.length;
  expect(await add("BF6C9FE5-74E8-452F-8CC7-3CB57C188867")).toContain("1 added");
  expect(w.calls.slice(before).map((c) => c.args.action)).toEqual(["save"]); // an id needs no list
  expect(await add("ba229d7c")).toContain("1 added");
  expect(saves().slice(-2)).toEqual(["bf6c9fe5-74e8-452f-8cc7-3cb57c188867", LIST[1]!.id]);

  const refused = await add("dnd-x/funkrauschen_upload.mp3");
  expect(refused).toContain("Nothing added");
  expect(refused).toContain("not reviewable: dnd-x/funkrauschen_upload.mp3 is no Studio result");

  // a result the person made by hand: results save refuses it, the reason says so
  w.answers.results = (a: Record<string, unknown>) => [
    {
      type: "text",
      text: JSON.stringify(
        a.action === "list"
          ? LIST
          : { folder: "/t", saved: [], failed: [{ id: LIST[0]!.id, error: "not made through D&D Studio's MCP tools: its file stays the user's" }] },
      ),
    },
  ];
  expect(await add(LIST[0]!.id)).toContain("not reviewable: result bf6c9fe5");
});

test("review: Studio paths are told apart from local paths and URLs", () => {
  expect(isStudioPath("dnd-dland/x.mp3")).toBe(true);
  expect(isStudioPath("x.png [output]")).toBe(true);
  expect(isStudioPath("/tmp/x.wav")).toBe(false);
  expect(isStudioPath("~/x.wav")).toBe(false);
  expect(isStudioPath("C:\\x.wav")).toBe(false);
  expect(isStudioPath("https://x/y.png")).toBe(false);
});

test("review: a sent verdict is done (a row with pill and local time, no buttons), a typed note goes along without Enter, nothing is sent twice", async ($, on) => {
  resetAutoOpen();
  const w = world(on);
  on("process.run", () => ({ value: { code: 0, stdout: "", stderr: "" } }) as never);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.tool.call({
    tool: "mcp__dnd-studio__review",
    action: "add",
    items: [
      { name: "Brann", kind: "image", source: "https://x.test/brann.png" },
      { name: "Tor", kind: "image", source: "https://x.test/tor.png" },
    ],
  } as never);
  const id0 = `r${(1_700_000_000_000).toString(36)}0`;
  const id1 = `r${(1_700_000_000_000).toString(36)}1`;
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  for (const id of [id0, id1]) {
    await ui.press({ key: `rv-reveal-${id}` });
    await ui.press({ key: `rv-open-${id}` });
  }
  // a row holds at most two actions; the redo and its note field wait behind „Details“
  expect(await ui.find({ type: "Button", key: `rv-redo-${id0}` })).toBeUndefined();
  await ui.press({ key: `rv-${id0}-details` });
  await ui.press({ key: `rv-redo-${id0}` });
  await ui.press({ key: `rv-ok-${id1}` });
  expect((await ui.find({ type: "Button", key: `rv-ok-${id1}` }))?.text).toBe("Passt");
  // one card „Prüfung“: the counter in its title, the main action without a count
  expect(await findShown(ui, "2 von 2")).toBeDefined();
  expect(await findShown(ui, /2 beurteilt, noch nicht geschickt/)).toBeDefined();
  // typed, never kept with „Merken“
  await ui.input({ key: `rv-note-${id0}`, text: "heller, mehr Nebel", kind: "change" } as never);
  expect((await ui.find({ type: "Button", key: "rv-send" }))?.text).toBe("An Claude schicken");
  await ui.press({ key: "rv-send" });

  expect(w.submitted).toHaveLength(1);
  expect(w.submitted[0]).toContain("Notiz: „heller, mehr Nebel“");
  expect(w.submitted[0]).toContain("Passt: Tor");
  // done: one quiet row each with its verdict as a pill and the local time; no verdict buttons
  const at = new Date(1_700_000_000_000);
  const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  expect((await findShown(ui, /^„heller, mehr Nebel“ · geschickt/))?.text).toContain(hhmm);
  expect(await findShown(ui, new RegExp(`^geschickt ${hhmm}$`))).toBeDefined();
  expect(await findShown(ui, "nochmal")).toBeDefined();
  expect(await findShown(ui, "passt")).toBeDefined();
  expect(await findShown(ui, /an Claude geschickt \d/)).toBeUndefined(); // no typed-out sentence per row
  expect(await ui.find({ type: "Button", key: `rv-redo-${id0}` })).toBeUndefined();
  expect(await ui.find({ type: "Button", key: `rv-ok-${id1}` })).toBeUndefined();
  // until Claude answered the result: the kit's „✓ An Claude geschickt“, a second press sends nothing
  expect((await ui.findAll({ type: "Svg" })).some((el) => el.props.alt === "geschickt")).toBe(true);
  await ui.press({ key: "rv-send" });
  expect(w.submitted).toHaveLength(1);
  await $.turn.start({ turnId: "t-rv", text: w.submitted[0] } as never);
  await $.turn.complete({ answer: "ok", durationMs: 1, isAborted: false, turnId: "t-rv", reason: "answer" } as never);
  expect(await ui.find({ type: "Button", key: "rv-send" })).toBeUndefined();
  expect(await findShown(ui, /Alles an Claude geschickt/)).toBeDefined();
  await ui.unmount();
  const list = JSON.stringify(await $.tool.call({ tool: "mcp__dnd-studio__review" } as never));
  expect(list).toContain("sent to Claude");
});

test("review: a redo without a note says so in the prompt", () => {
  const item = {
    id: "a", kind: "sound", name: "Tor", meta: "", source: "/t.wav", agent: "pnp-klang",
    scene: "", verdict: "redo", note: "", revealed: true, addedAt: 0,
  } as ReviewItem;
  expect(resultPrompt([item])).toContain("→ pnp-klang; ohne Notiz");
});
