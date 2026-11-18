import { expect, test } from "claude-code/testing";
import { findShown, shownTexts } from "./shown";

import {
  discordOf,
  isWatchCommand,
  staleSchemaOf,
  versionOf,
  whisperOf,
} from "../lib/model";
import {
  band,
  DISCORD,
  pane,
  PREFIX,
  STATUS,
  TABLE,
  toolResult,
  world,
} from "./world";

const WATCH =
  "curl -s -m 1900 http://127.0.0.1:37641/watch/0123456789abcdef01234567";

test("pure: watch commands, versions, stale schemas, discord and whisper answers", () => {
  expect(isWatchCommand(WATCH)).toBe(true);
  expect(isWatchCommand("curl http://127.0.0.1:37641/mcp")).toBe(false);
  expect(versionOf({ version: "loaded", app_version: "3.20.0" })).toBe(
    "3.20.0",
  );
  expect(versionOf({ version: "loaded" })).toBe("");
  expect(versionOf({ version: "3.19.2" })).toBe("3.19.2");
  expect(
    staleSchemaOf("say_line has no sound_after (it takes: text, voice)"),
  ).toBe("say_line refused sound_after");
  expect(staleSchemaOf("fine")).toBe("");
  const d = discordOf({ ...DISCORD, stream_ended: ["Mara"] }, 5);
  expect(d.channel).toBe("Tisch");
  expect(d.members).toEqual([
    { name: "anna", character: "Mara" },
    { name: "bob", character: "" },
  ]);
  expect(d.rooms[0]).toEqual({ name: "Tisch", members: ["Mara"], bot: true });
  expect(d.streamEnded).toEqual(["Mara"]);
  expect(
    whisperOf(
      {
        delivered: false,
        to: "Thorin",
        reason: "dms_closed",
        why: "DMs closed",
      },
      1,
    ),
  ).toEqual({
    to: "Thorin",
    delivered: false,
    reason: "dms_closed",
    why: "DMs closed",
    at: 1,
  });
  expect(
    whisperOf({ total: 12, whisper: { delivered: true, to: "Mara" } }, 1)
      ?.delivered,
  ).toBe(true);
  expect(whisperOf({ ok: true }, 1)).toBeUndefined();
});

test("interjections at a live table go to the debrief list and file; other prompts do not", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  // No table yet: not an interjection.
  await $.prompt.submit({
    text: "vorher",
    origin: { kind: "composer" },
  } as never);
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.prompt.submit({
    text: "Mara war heute still",
    origin: { kind: "composer" },
  } as never);
  await $.prompt.submit({
    text: "task done <task-notification>x</task-notification>",
    origin: { kind: "task-notification" },
  } as never);
  await $.prompt.submit({
    text: "/compact",
    origin: { kind: "composer" },
  } as never);
  await $.prompt.submit({
    text: "Tempo höher",
    origin: { kind: "bridge" },
  } as never);

  const file = w.writes.at(-1);
  expect(file?.path).toBe(
    "/var/tmp/dnd-studio/s-1/debrief-breeland-2023-11-14.md",
  );
  expect(file?.text).toContain("Mara war heute still");
  expect(file?.text).toContain("Tempo höher");
  expect(file?.text).not.toContain("vorher");
  expect(file?.text).not.toContain("task-notification");

  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  await ui.press({ key: "sec-evening" });
  expect(
    (await findShown(ui, /Einwürfe für die Nachbesprechung/))?.text,
  ).toBeDefined();
  expect(await findShown(ui, /Mara war heute still/)).toBeDefined();
  await ui.unmount();
});

test("the watcher: a background watch runs, ends with its task notification, and a turn without it is reminded", async ($, on) => {
  const w = world(on);
  on("tool.call", (_, e) =>
    e.tool === "Bash"
      ? ({
          result: {
            stdout: "",
            stderr: "",
            interrupted: false,
            backgroundTaskId: "bwatch1",
          },
        } as never)
      : (toolResult({ ok: true }) as never),
  );
  on(
    "tool.check",
    () =>
      ({
        decision: "allow" as const,
        value: { decision: "allow" as const },
      }) as never,
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);

  let b = await $.ui.mount({ ...band(), surface: "desktop" });
  expect(await findShown(b, /Spieler ungehört/)).toBeDefined();
  await b.unmount();

  // A permission query (no call) is not a watch.
  await $.tool.check({
    tool: "Bash",
    input: { command: WATCH, run_in_background: true },
  } as never);
  b = await $.ui.mount({ ...band(), surface: "desktop" });
  expect(await findShown(b, /Spieler ungehört/)).toBeDefined();
  await b.unmount();

  // The real call, seen at tool.check: its answer comes back untouched (no tool.call hook on Bash).
  const ran = await $.tool.call({
    tool: "Bash",
    command: WATCH,
    run_in_background: true,
    description: "Watch the table",
  } as never);
  expect(JSON.stringify(ran)).toContain("bwatch1");
  b = await $.ui.mount({ ...band(), surface: "desktop" });
  // Band v3: a running watcher is fine (ok) and stays out of the band; the warning is gone
  expect(await findShown(b, /Spieler ungehört/)).toBeUndefined();
  await b.unmount();

  // Another background task ending does not end the watch.
  await $.prompt.submit({
    text: '<task-notification><task-id>bother</task-id><status>completed</status><summary>Background command "npm test" completed (exit code 0)</summary></task-notification>',
    origin: { kind: "task-notification" },
  } as never);
  b = await $.ui.mount({ ...band(), surface: "desktop" });
  // Band v3: a running watcher is fine (ok) and stays out of the band; the warning is gone
  expect(await findShown(b, /Spieler ungehört/)).toBeUndefined();
  await b.unmount();

  // A turn ends while the watcher runs: no reminder.
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
  } as never);
  expect(w.toasts.filter((t) => /Niemand hört gerade auf die Spieler/.test(t))).toEqual([]);

  // The watcher's task ends.
  await $.prompt.submit({
    text: '<task-notification><task-id>bwatch1</task-id><status>completed</status><summary>Background command "Watch the table" completed (exit code 0)</summary></task-notification>',
    origin: { kind: "task-notification" },
  } as never);
  b = await $.ui.mount({ ...band(), surface: "desktop" });
  expect(await findShown(b, /Spieler ungehört/)).toBeDefined();
  await b.unmount();

  // A subagent's turn is not the table's; the main thread's is.
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t2",
    agentId: "a9",
    reason: "answer",
  } as never);
  expect(w.toasts.filter((t) => /Niemand hört gerade auf die Spieler/.test(t))).toEqual([]);
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t3",
    reason: "answer",
  } as never);
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t4",
    reason: "answer",
  } as never);
  expect(w.toasts.filter((t) => /Niemand hört gerade auf die Spieler/.test(t)).length).toBe(1);

  // The next prompt the person types carries the reminder once.
  const r = await $.prompt.submit({
    text: "weiter",
    origin: { kind: "composer" },
  } as never);
  expect((r.context ?? []).join(" ")).toContain(
    "wait_for_players with watch: true",
  );
  const r2 = await $.prompt.submit({
    text: "noch was",
    origin: { kind: "composer" },
  } as never);
  expect(r2.context ?? []).toEqual([]);
});

test("a changed Studio version or a refused argument warns: MCP schemas stale", async ($, on) => {
  world(on);
  let status: Record<string, unknown> = STATUS;
  on("tool.call", (_, e) =>
    e.tool === `${PREFIX}studio_status`
      ? (toolResult(status) as never)
      : e.tool === `${PREFIX}say_line`
        ? (toolResult(
            "say_line has no sound_after (it takes: text, voice)",
          ) as never)
        : (toolResult({ ok: true }) as never),
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);

  const first = await $.tool.call({
    tool: `${PREFIX}studio_status`,
    input: {},
  } as never);
  expect(
    ((first as { context?: string[] }).context ?? []).join(" "),
  ).not.toContain("stale");
  status = { ...STATUS, app_version: "3.21.0" };
  const second = await $.tool.call({
    tool: `${PREFIX}studio_status`,
    input: {},
  } as never);
  expect(
    ((second as { context?: string[] }).context ?? []).join(" "),
  ).toContain("MCP schemas stale");

  const b = await $.ui.mount({ ...band(), surface: "desktop" });
  expect(
    await findShown(b, /Claude neu starten/),
  ).toBeDefined();
  await b.unmount();
  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect((await findShown(ui, /3\.20\.0 → 3\.21\.0/))?.text).toContain(
    "restart Claude",
  );
  await ui.unmount();

  const refused = await $.tool.call({
    tool: `${PREFIX}say_line`,
    input: { text: "x", sound_after: 2 },
  } as never);
  expect(
    ((refused as { context?: string[] }).context ?? []).join(" "),
  ).toContain("refused arguments");
});

test("Discord: players, rooms, last whisper with its reason, screen-share warnings; buttons only on press", async ($, on) => {
  const w = world(on);
  on("tool.call", (_, e) =>
    e.tool === `${PREFIX}discord`
      ? (toolResult(
          (e.input as { action?: string }).action === "whisper"
            ? {
                delivered: false,
                to: "Thorin",
                reason: "not_mapped",
                why: "Thorin is not linked to a Discord user",
              }
            : {
                room: "Keller",
                moved: ["Mara"],
                stream_ended: ["Mara"],
                rooms: DISCORD.rooms,
              },
        ) as never)
      : (toolResult({ ok: true }) as never),
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  // Refresh with the bot at the table read its status, nothing else.
  expect(w.calls.map((c) => c.tool)).toContain("discord");
  expect(
    w.calls.filter((c) => c.tool === "discord").map((c) => c.args),
  ).toEqual([{ action: "status" }]);

  const whisper = await $.tool.call({
    tool: `${PREFIX}discord`,
    input: { action: "whisper", hero: "Thorin", text: "psst" },
  } as never);
  expect(
    ((whisper as { context?: string[] }).context ?? []).join(" "),
  ).toContain("not_mapped");
  await $.tool.call({
    tool: `${PREFIX}discord`,
    input: { action: "move", place: "Keller", heroes: ["Mara"] },
  } as never);

  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(await findShown(ui, /Mara · anna/)).toBeDefined();
  expect(await findShown(ui, /bob · nicht zugeordnet/)).toBeDefined();
  expect(await findShown(ui, /Thorin: kein Spieler da/)).toBeDefined();
  expect(await findShown(ui, /▶ Tisch: Mara/)).toBeDefined();
  expect(
    await findShown(
      ui,
      /Letztes Flüstern an Thorin: nicht zugestellt \(not_mapped\)/,
    ),
  ).toBeDefined();
  expect(await findShown(ui, /Bildschirmfreigabe beendet: Mara/)).toBeDefined();
  expect(
    await ui.find({ type: "Button", key: "discord-join" }),
  ).toBeUndefined();

  const before = w.calls.length;
  await ui.press({ key: "discord-merge" });
  expect(w.calls.length).toBe(before); // first press only asks
  await ui.press({ key: "discord-merge" });
  expect(w.calls.at(-1)).toEqual({
    tool: "discord",
    args: { action: "merge" },
  });
  await ui.unmount();

  const b = await $.ui.mount({ ...band(), surface: "desktop" });
  expect(await findShown(b, /stream_ended/)).toBeDefined();
  await b.unmount();
});

test("Discord section offers Join when the bot is away", async ($, on) => {
  const w = world(on, { table_state: { ...TABLE, discord: false } });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  expect(w.calls.some((c) => c.tool === "discord")).toBe(false);
  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  await ui.press({ key: "sec-discord" });
  await ui.press({ key: "discord-join" });
  expect(w.calls.at(-1)).toEqual({ tool: "discord", args: { action: "join" } });
  await ui.unmount();
});

test("interjections: only what the person typed (attached blocks cut, empty ones dropped); they end with the evening and with a profile switch", async ($, on) => {
  const w = world(on);
  on("tool.call", (_, e) =>
    String(e.tool).startsWith(PREFIX) ? (toolResult({ ok: true }) as never) : (undefined as never),
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.prompt.submit({
    text: "Mara war heute still\n<system-reminder>\nSession 0f3c-11aa: The user opened file x.\n</system-reminder>",
    origin: { kind: "composer" },
  } as never);
  await $.prompt.submit({
    text: "<system-reminder>only the app's</system-reminder>\n<ide_selection>a b c</ide_selection>",
    origin: { kind: "composer" },
  } as never);
  await $.prompt.submit({
    text: "<local-command-stdout>ok</local-command-stdout> Tempo höher",
    origin: { kind: "composer" },
  } as never);
  const firstFile = w.writes.at(-1);
  expect(firstFile?.text).toContain("Mara war heute still");
  expect(firstFile?.text).toContain("Tempo höher");
  expect(firstFile?.text).not.toContain("system-reminder");
  expect(firstFile?.text).not.toContain("0f3c-11aa");
  expect(firstFile?.text).not.toContain("local-command");

  let ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  await ui.press({ key: "sec-evening" });
  expect((await shownTexts(ui)).join(" | ")).toContain("Mara war heute still");
  expect(await findShown(ui, /system-reminder|0f3c-11aa|only the app/)).toBeUndefined();
  await ui.unmount();

  // the evening ends (the window and the bot gone): the next prompt finds the list empty, the file stays named
  w.answers.table_state = { ...TABLE, players_window: false, discord: false };
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.prompt.submit({ text: "schreib die Sitzung auf", origin: { kind: "composer" } } as never);

  // a new table: the list is empty, the last evening's file stays named; then only the new evening's lines
  w.answers.table_state = TABLE;
  await $.command.run({ command: "dnd", args: "table" } as never);
  ui = await $.ui.mount({ ...pane(), surface: "desktop" }); // the fold stays open across mounts
  expect(await findShown(ui, /Mara war heute still/)).toBeUndefined();
  expect((await shownTexts(ui)).join(" | ")).toContain("Am laufenden Tisch noch nichts getippt");
  expect((await shownTexts(ui)).join(" | ")).toContain("Die Einwürfe des letzten Abends stehen in dieser Datei");
  await ui.unmount();
  await $.prompt.submit({ text: "Neuer Abend, neues Glück", origin: { kind: "composer" } } as never);
  expect(w.writes.at(-1)?.text).not.toContain("Mara war heute still");
  ui = await $.ui.mount({ ...pane(), surface: "desktop" }); // the fold stays open across mounts
  expect((await shownTexts(ui)).join(" | ")).toContain("Neuer Abend, neues Glück");
  await ui.unmount();

  // another Studio profile: another evening, the list is empty
  await $.tool.call({ tool: `${PREFIX}profile`, action: "use", name: "Andere" } as never);
  ui = await $.ui.mount({ ...pane(), surface: "desktop" }); // the fold stays open across mounts
  expect(await findShown(ui, /Neuer Abend, neues Glück/)).toBeUndefined();
  await ui.unmount();
});
