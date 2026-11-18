import { expect, test } from "claude-code/testing";
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
    expect(await findShown(ui, /Neue Klänge prüfen/)).toBeDefined();
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
            ? { results: [{ id: "77", kind: "sound", file: "dnd-dland/tor_01.mp3 [output]" }] }
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
    { type: "text", text: JSON.stringify({ results: [] }) },
  ];
  const refused = JSON.stringify(
    await $.tool.call({
      tool: "mcp__dnd-studio__review",
      action: "add",
      items: [{ name: "Krähen", kind: "sound", source: "dnd-dland/kr.mp3" }],
    } as never),
  );
  expect(refused).toContain("Nothing added");
  expect(refused).toContain("no Studio result has the file dnd-dland/kr.mp3");
});

test("review: Studio paths are told apart from local paths and URLs", () => {
  expect(isStudioPath("dnd-dland/x.mp3")).toBe(true);
  expect(isStudioPath("x.png [output]")).toBe(true);
  expect(isStudioPath("/tmp/x.wav")).toBe(false);
  expect(isStudioPath("~/x.wav")).toBe(false);
  expect(isStudioPath("C:\\x.wav")).toBe(false);
  expect(isStudioPath("https://x/y.png")).toBe(false);
});
