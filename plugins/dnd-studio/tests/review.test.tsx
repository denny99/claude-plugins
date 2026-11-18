import { expect, test } from "claude-code/testing";
import { findShown } from "./shown";

import { resetAutoOpen } from "../features/dnd-ui";
import { openArgv, playArgv, resultPrompt } from "../features/review";
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
