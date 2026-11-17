import { expect, test } from "claude-code/testing";

import { listenerReturnOf } from "../lib/model";
import { band, pane, PREFIX, TABLE, toolResult, world } from "./world";

const LISTENING = { ...TABLE, listener: "haiku" };
const WATCH =
  "curl -s -m 640 http://127.0.0.1:37641/watch/0123456789abcdef01234567";

function done(agentId: string | undefined, answer: string, turnId: string) {
  return {
    answer,
    durationMs: 1,
    isAborted: false,
    turnId,
    ...(agentId ? { agentId } : {}),
    reason: "answer",
  } as never;
}

function spawn(id: string) {
  return {
    tool_use_id: `t-${id}`,
    prompt: "Ich sage gleich: Der Wirt grinst. Szene: Tobi, Jule; NPC: Wirt.",
    description: id,
    subagentType: "dnd-studio:pnp-zuhoerer",
    parentModel: "opus",
  } as never;
}

test("pure: the listener's return, with or without a fence; anything else is none", () => {
  const r = listenerReturnOf(
    '```json\n{"woke": true, "why": "Frage an die Spielleitung", "turn": {"lines": [{"who": "Tobi", "text": "Hallo Wirt"}], "sent": true, "secret": false}, "between": ["Jule und Tobi beraten"]}\n```',
  );
  expect(r).toEqual({
    woke: true,
    why: "Frage an die Spielleitung",
    lines: [{ who: "Tobi", text: "Hallo Wirt", secret: false }],
    sent: true,
    secret: false,
    between: ["Jule und Tobi beraten"],
  });
  expect(
    listenerReturnOf('{"woke": false, "why": "", "turn": null, "between": []}')
      ?.lines,
  ).toEqual([]);
  expect(listenerReturnOf("Fertig, nichts gefunden.")).toBeUndefined();
  expect(listenerReturnOf('{"ok": true}')).toBeUndefined();
  expect(listenerReturnOf("{kaputt")).toBeUndefined();
});

test("listener mode: a running pnp-zuhoerer is the watcher, its return fills band and Table tab, a missing one is reminded", async ($, on) => {
  const w = world(on, { table_state: LISTENING });
  on("tool.call", () => toolResult({ ok: true }) as never);
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

  const bandText = async () => {
    const b = await $.ui.mount({ ...band(), surface: "desktop" });
    const t = (await b.findAll({ type: "Text" })).map((x) => x.text).join(" ");
    await b.unmount();
    return t;
  };
  expect(await bandText()).toContain("no listener");

  await $.agent.spawn(spawn("z1"));
  expect(await bandText()).toContain("listener: waiting · 0 skipped");

  // The listener's own foreground watch (a subagent's Bash) is no GM watcher.
  await $.tool.check({
    tool: "Bash",
    input: { command: WATCH, run_in_background: false },
    tool_use_id: "b1",
    agentId: "z1",
  } as never);
  // Its quiet take (a subagent's wait_for_players) is not the GM's turn: no secret note, no silence clock.
  const take = await $.tool.call({
    tool: `${PREFIX}wait_for_players`,
    input: { quiet: true },
    agentId: "z1",
  } as never);
  expect(JSON.stringify(take)).not.toContain("Secret turn");

  // The GM's answer ends while the listener runs: no reminder.
  await $.turn.complete(done(undefined, "", "m1"));
  expect(w.toasts.filter((t) => /without a listener/.test(t))).toEqual([]);

  // It comes back without waking anyone: two skipped turns, the band asks for a new one.
  await $.turn.complete(
    done(
      "z1",
      '{"woke": false, "why": "nur Geplauder", "turn": null, "between": ["Pizza bestellt", "Regeln nachgeschlagen"]}',
      "z1t",
    ),
  );
  expect(await bandText()).toContain("no listener");
  await $.turn.complete(done(undefined, "", "m2"));
  expect(w.toasts.filter((t) => /without a listener/.test(t)).length).toBe(1);
  const r = await $.prompt.submit({
    text: "weiter",
    origin: { kind: "composer" },
  } as never);
  expect((r.context ?? []).join(" ")).toContain("pnp-zuhoerer");
  expect((r.context ?? []).join(" ")).not.toContain("watch: true");

  // A new listener carries the skipped count; two at once are flagged.
  await $.agent.spawn(spawn("z2"));
  expect(await bandText()).toContain("listener: waiting · 2 skipped");
  await $.agent.spawn(spawn("z3"));
  expect(await bandText()).toContain("2 listeners running");
  await $.turn.complete(done("z3", "kaputt, kein JSON", "z3t"));

  // It wakes the GM with a turn: band names why, the Table tab shows the turn and what was discussed.
  await $.turn.complete(
    done(
      "z2",
      '{"woke": true, "why": "Frage an die Spielleitung", "turn": {"lines": [{"who": "Tobi", "text": "Hallo Wirt, ein Bier!"}], "sent": false, "secret": false}, "between": ["Jule will bestechen"]}',
      "z2t",
    ),
  );
  expect(await bandText()).toContain(
    "listener woke: Frage an die Spielleitung",
  );
  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  for (const text of [
    /Last return: woke · Frage an die Spielleitung/,
    /Tobi: Hallo Wirt, ein Bier!/,
    /Discussed without the GM: 3/,
    /Pizza bestellt/,
    /Jule will bestechen/,
    /listener on/,
  ])
    expect(await ui.find({ type: "Text", text })).toBeDefined();
  await ui.unmount();

  // The listener is no build run.
  await $.command.run({ command: "dnd", args: "build" } as never);
  const b = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(await b.find({ type: "Text", text: /pnp-zuhoerer/ })).toBeUndefined();
  await b.unmount();
});

test("listener mode: say_line interrupted means wait for the listener's return, not wait_for_players", async ($, on) => {
  world(on, { table_state: LISTENING });
  on("tool.call", (_, e) =>
    e.tool === `${PREFIX}say_line`
      ? (toolResult({
          said: true,
          table: {
            interrupted: true,
            unheard: "und dann fiel das Tor",
            note: "the listener cut the line: what the players said comes with its result",
          },
        }) as never)
      : (toolResult({ ok: true }) as never),
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const r = (await $.tool.call({
    tool: `${PREFIX}say_line`,
    input: { text: "Das Tor knarrt …" },
  } as never)) as { context?: string[] };
  const ctx = (r.context ?? []).join(" ");
  expect(ctx).toContain("The listener cut the line");
  expect(ctx).toContain("und dann fiel das Tor");
  expect(ctx).not.toContain("The players cut in");
});

test("without the listener a cut-in keeps the old hint", async ($, on) => {
  world(on);
  on(
    "tool.call",
    () => toolResult({ said: true, table: { interrupted: true } }) as never,
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const r = (await $.tool.call({
    tool: `${PREFIX}say_line`,
    input: { text: "Das Tor knarrt …" },
  } as never)) as { context?: string[] };
  expect((r.context ?? []).join(" ")).toContain("The players cut in");
});

test("the listener switch: only a person's press calls discord listener on/off", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const sets = () => w.calls.filter((c) => "listener" in c.args);
  expect(sets()).toEqual([]);
  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  await ui.press({ key: "listener-on" });
  expect(sets()).toEqual([{ tool: "discord", args: { listener: "haiku" } }]);
  expect(w.toasts.some((t) => /Listener on/.test(t))).toBe(true);
  // Off asks first.
  await ui.press({ key: "listener-off" });
  expect(sets().length).toBe(1);
  await ui.press({ key: "listener-off" });
  expect(sets()[1]).toEqual({ tool: "discord", args: { listener: "off" } });
  await ui.unmount();
});

test("render check: the filled Listener section and band stay inside 40 columns on every surface", async ($, on) => {
  world(on, { table_state: LISTENING });
  on("tool.call", () => toolResult({ ok: true }) as never);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.agent.spawn(spawn("z1"));
  await $.turn.complete(
    done(
      "z1",
      `{"woke": true, "why": "Ein Spieler sagt, was sein Held tut, sehr ausführlich begründet", "turn": {"lines": [{"who": "Tobi", "text": "${"Ich gehe durch das Tor und frage den Wirt nach dem Brief ".repeat(3)}"}], "sent": true, "secret": false}, "between": ["${"Jule und Tobi beraten lange, ob sie den Wächter bestechen ".repeat(2)}"]}`,
      "z1t",
    ),
  );
  for (const surface of ["terminal", "desktop", "vscode", "mobile"] as const) {
    for (const mount of [pane(40, 15), band(40)]) {
      const ui = await $.ui.mount({ ...mount, surface } as never);
      const texts = await ui.findAll({ type: "Text" });
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) {
        expect(t.text).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f]/);
        for (const line of t.text.split("\n"))
          if ([...line].length > 40)
            throw new Error(`${surface}: "${line}" is wider than 40`);
      }
      await ui.unmount();
    }
  }
});
