// Buttons that hand Claude a prompt (kit „ask Claude“, lock v2): a toast at once, the pill „geschickt“ after the
// button (its label stays), and the same task goes once until Claude answered *that* prompt, not only until some turn ended.
import { expect, test } from "claude-code/testing";

import { pane, world } from "./world";

/** The quiet pill „geschickt“ after the button while the prompt is on its way (a Svg pill on the desktop: its `alt`). */
const sent = async (ui: {
  findAll: (q: {
    type: string;
  }) => Promise<{ props: Record<string, unknown> }[]>;
}) =>
  (await ui.findAll({ type: "Svg" })).some(
    (el) => el.props.alt === "geschickt",
  );

const done = (turnId: string) =>
  ({
    answer: "ok",
    durationMs: 1,
    isAborted: false,
    turnId,
    reason: "answer",
  }) as never;

test("ask Claude: two presses across a turn end give exactly one prompt; the lock holds until its own answer", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  // Claude is busy with something else: the prompt only waits in the queue
  await $.turn.start({
    turnId: "t-other",
    text: "schreib mir die Szene um",
  } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  await ui.press({ key: "check-fix" }); // asks into which campaign
  await ui.press({ key: "check-fix" }); // the yes sends
  expect(w.submitted).toHaveLength(1);
  // the toast comes at once and says it waits for the running answer
  expect(w.toasts.at(-1)).toBe(
    "An Claude geschickt – kommt nach der laufenden Antwort.",
  );
  expect(await sent(ui)).toBe(true);
  // a double click: nothing more, only a toast
  await ui.press({ key: "check-fix" });
  expect(w.submitted).toHaveLength(1);
  expect(w.toasts.at(-1)).toBe(
    "Schon an Claude geschickt – kommt mit der Antwort darauf.",
  );

  // the other turn ends: the prompt still waits in the queue, the button stays locked
  await $.turn.complete(done("t-other"));
  expect(await sent(ui)).toBe(true);
  await ui.press({ key: "check-fix" });
  expect(w.submitted).toHaveLength(1);

  // the turn that carries the prompt (the engine frames plugin prompts) starts and ends: answered
  await $.turn.start({
    turnId: "t-fix",
    text: `The dnd-studio plugin sent a message:\n${w.submitted[0]}`,
  } as never);
  expect(await sent(ui)).toBe(true);
  await $.turn.complete(done("t-fix"));
  expect((await ui.find({ type: "Button", key: "check-fix" }))?.text).toBe(
    "Offene Punkte beheben",
  );
  expect(await sent(ui)).toBe(false);
  // sending again is a choice: it asks first, then goes once more
  await ui.press({ key: "check-fix" });
  expect(w.submitted).toHaveLength(1);
  expect(
    await ui.find({ type: "Text", text: /In „Breeland“ beheben lassen\?/ }),
  ).toBeDefined();
  await ui.press({ key: "check-fix" });
  expect(w.submitted).toHaveLength(2);
  await ui.unmount();
});

test("ask Claude: a subagent's turn and a typed prompt release nothing; the fallback ends the lock after 15 min", async ($, on) => {
  const w = world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  await ui.press({ key: "check-fix" });
  await ui.press({ key: "check-fix" });
  expect(w.submitted).toHaveLength(1);
  expect(w.toasts.at(-1)).toBe("An Claude geschickt.");
  await $.turn.start({
    turnId: "t-sub",
    agentId: "a1",
    text: w.submitted[0],
  } as never);
  await $.turn.complete({
    ...(done("t-sub") as object),
    agentId: "a1",
  } as never);
  await $.turn.start({
    turnId: "t-typed",
    text: "was macht der Tisch?",
  } as never);
  await $.turn.complete(done("t-typed"));
  expect(await sent(ui)).toBe(true);
  await w.clock.advance(15 * 60_000 + 1);
  expect((await ui.find({ type: "Button", key: "check-fix" }))?.text).toBe(
    "Offene Punkte beheben",
  );
  expect(await sent(ui)).toBe(false);
  // free again: the next yes sends anew
  await ui.press({ key: "check-fix" });
  await ui.press({ key: "check-fix" });
  expect(w.submitted).toHaveLength(2);
  await ui.unmount();
});
