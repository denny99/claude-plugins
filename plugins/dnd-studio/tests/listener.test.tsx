import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import { findShown } from "./shown";
import type { Engine } from "claude-code/testing";

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
  expect(await bandText()).toContain("kein Zuhörer");

  await $.agent.spawn(spawn("z1"));
  expect(await bandText()).toContain("Zuhörer wartet · 0 übersprungen");

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
  expect(w.toasts.filter((t) => /ohne Zuhörer/.test(t))).toEqual([]);

  // It comes back without waking anyone: two skipped turns, the band asks for a new one.
  await $.turn.complete(
    done(
      "z1",
      '{"woke": false, "why": "nur Geplauder", "turn": null, "between": ["Pizza bestellt", "Regeln nachgeschlagen"]}',
      "z1t",
    ),
  );
  expect(await bandText()).toContain("kein Zuhörer");
  await w.clock.advance(1000);
  await $.turn.start({ text: "weiter", turnId: "m2" } as never);
  await $.turn.complete(done(undefined, "", "m2"));
  expect(w.toasts.filter((t) => /ohne Zuhörer/.test(t)).length).toBe(1);
  const r = await $.prompt.submit({
    text: "weiter",
    origin: { kind: "composer" },
  } as never);
  expect((r.context ?? []).join(" ")).toContain("pnp-zuhoerer");
  expect((r.context ?? []).join(" ")).not.toContain("watch: true");

  // A new listener carries the skipped count; two at once are flagged.
  await $.agent.spawn(spawn("z2"));
  expect(await bandText()).toContain("Zuhörer wartet · 2 übersprungen");
  await $.agent.spawn(spawn("z3"));
  expect(await bandText()).toContain("2 Zuhörer laufen");
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
    "Zuhörer hat geweckt: Frage an die Spielleitung",
  );
  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  for (const text of [
    /Zuletzt zurück: geweckt · Frage an die Spielleitung/,
    /Tobi: Hallo Wirt, ein Bier!/,
    /Ohne Spielleitung besprochen: 3/,
    /Pizza bestellt/,
    /Jule will bestechen/,
    /Zuhörer an/,
  ])
    expect(await ui.find({ type: "Text", text })).toBeDefined();
  await ui.unmount();

  // The listener is no build run.
  await $.command.run({ command: "dnd", args: "build" } as never);
  const b = await $.ui.mount({ ...pane(), surface: "desktop" });
  expect(await findShown(b, /pnp-zuhoerer/)).toBeUndefined();
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
  expect(w.toasts.some((t) => /Zuhörer an/.test(t))).toBe(true);
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
        for (const line of surface === "terminal" ? t.text.split("\n") : [])
          if ([...line].length > 40)
            throw new Error(`${surface}: "${line}" is wider than 40`);
      }
      await ui.unmount();
    }
  }
});

function allowAll(on: On) {
  on(
    "tool.check",
    () =>
      ({
        decision: "allow" as const,
        value: { decision: "allow" as const },
      }) as never,
  );
}

async function bandOf($: Engine) {
  const b = await $.ui.mount({ ...band(), surface: "desktop" });
  const t = (await b.findAll({ type: "Text" })).map((x) => x.text).join(" ");
  await b.unmount();
  return t;
}

const watchCheck = (agentId: string) =>
  ({
    tool: "Bash",
    input: { command: WATCH, run_in_background: true },
    tool_use_id: `b-${agentId}`,
    agentId,
  }) as never;

test("a subagent's watch is never the GM's watcher, with or without listener mode", async ($, on) => {
  world(on);
  on("tool.call", () => toolResult({ ok: true }) as never);
  allowAll(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.tool.check(watchCheck("sub1"));
  expect(await bandOf($)).toContain("Spieler ungehört");
});

test("listener mode: a subagent's watch does not set the watcher running", async ($, on) => {
  const w = world(on, { table_state: LISTENING });
  on("tool.call", () => toolResult({ ok: true }) as never);
  allowAll(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.agent.spawn(spawn("z1"));
  await $.tool.check(watchCheck("z1"));
  // Listener mode off again: the band shows the watcher, which the listener's watch never started.
  w.answers.table_state = TABLE;
  await $.command.run({ command: "dnd", args: "table" } as never);
  expect(await bandOf($)).toContain("Spieler ungehört");
});

test("a listener's quiet take with a secret turn leaves no secret note and no pending secret", async ($, on) => {
  world(on, { table_state: LISTENING });
  on("tool.call", (_, e) =>
    e.tool === `${PREFIX}wait_for_players`
      ? (toolResult({
          lines: [
            { who: "Jule", text: "Ich stecke den Ring ein", secret: true },
          ],
        }) as never)
      : (toolResult({ ok: true }) as never),
  );
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  const take = await $.tool.call({
    tool: `${PREFIX}wait_for_players`,
    input: { quiet: true },
    agentId: "z1",
  } as never);
  expect(JSON.stringify(take)).not.toContain("Secret turn");
  // No secret is pending: the GM's next line gets no secret warning.
  const said = await $.tool.call({
    tool: `${PREFIX}say_line`,
    input: { text: "Der Wirt nickt." },
  } as never);
  expect(JSON.stringify(said)).not.toContain("told you a secret");
});

test("pure: prose with a brace before the fenced JSON, and a stray brace before bare JSON", () => {
  const fenced = listenerReturnOf(
    'Ich habe {nichts Wichtiges} gehört, außer:\n```json\n{"woke": true, "why": "Frage", "turn": {"lines": [{"who": "Tobi", "text": "Hallo"}]}, "between": []}\n```\nEnde {ok}',
  );
  expect(fenced?.woke).toBe(true);
  expect(fenced?.lines).toEqual([
    { who: "Tobi", text: "Hallo", secret: false },
  ]);
  const bare = listenerReturnOf(
    'Hinweis {siehe unten}: {"woke": false, "why": "", "turn": null, "between": ["Pizza"]} danke}',
  );
  expect(bare?.woke).toBe(false);
  expect(bare?.between).toEqual(["Pizza"]);
});

test("listener mode: the listener comes back during the GM's own turn, so the turn's end reminds nobody", async ($, on) => {
  const w = world(on, { table_state: LISTENING });
  on("tool.call", () => toolResult({ ok: true }) as never);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.agent.spawn(spawn("z1"));
  await w.clock.advance(1000);
  await $.turn.start({ text: "weiter", turnId: "m1" } as never);
  await w.clock.advance(1000);
  await $.turn.complete(
    done(
      "z1",
      '{"woke": true, "why": "Frage", "turn": {"lines": [{"who": "Tobi", "text": "Hallo"}]}, "between": []}',
      "z1t",
    ),
  );
  await $.turn.complete(done(undefined, "", "m1"));
  expect(w.toasts.filter((t) => /ohne Zuhörer/.test(t))).toEqual([]);
  const r = await $.prompt.submit({
    text: "weiter",
    origin: { kind: "composer" },
  } as never);
  expect((r.context ?? []).join(" ")).not.toContain("pnp-zuhoerer");
});

test("listener mode: an aborted listener is an error, is no longer running, and the next GM turn is reminded", async ($, on) => {
  const w = world(on, { table_state: LISTENING });
  on("tool.call", () => toolResult({ ok: true }) as never);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "table" } as never);
  await $.agent.spawn(spawn("z1"));
  await w.clock.advance(1000);
  await $.turn.start({ text: "weiter", turnId: "m1" } as never);
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: true,
    turnId: "z1t",
    agentId: "z1",
    reason: "aborted",
  } as never);
  expect(await bandOf($)).toContain("kein Zuhörer");
  const ui = await $.ui.mount({ ...pane(), surface: "desktop" });
  const texts = (await ui.findAll({ type: "Text" }))
    .map((x) => x.text)
    .join(" ");
  await ui.unmount();
  expect(texts).toContain("Der Zuhörer ist abgebrochen");
  await $.turn.complete(done(undefined, "", "m1"));
  expect(w.toasts.filter((t) => /ohne Zuhörer/.test(t)).length).toBe(1);
});
