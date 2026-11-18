import { expect, test } from "claude-code/testing";
import { pane, PREFIX, world } from "./world";

import { clockText } from "../lib/progress";

const MIN = 60_000;

// Denny 2026-11-18: „damit ich fragen kann wie weit wir sind und wann fertig“: the pane knew it, Claude could not read
// it (build_progress only writes)
test("build_status: the build's progress with the time left", async ($, on) => {
  const w = world(on);
  on("tool.call", (_, e) => {
    if (e.tool === `${PREFIX}picture`)
      return { result: [{ type: "text", text: JSON.stringify({ id: `pic${(e as { input?: { name?: string } }).input?.name}`, mode: "picture", queued: true }) }] } as never;
    if (e.tool === `${PREFIX}jobs`) {
      const asked = (e as { input?: { job_ids?: string[] } }).input?.job_ids ?? [];
      return { result: [{ type: "text", text: JSON.stringify({ finished: true, jobs: asked.map((id) => ({ id, done: true })) }) }] } as never;
    }
    return { result: [{ type: "text", text: "{}" }] } as never;
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  const status = async () => {
    const r = (await $.tool.call({ tool: "mcp__dnd-studio__build_status", input: {} } as never)) as { result?: unknown };
    return String(r.result ?? "");
  };

  // nothing yet: says so, no throw
  expect(await status()).toContain("Nothing runs");

  // the maler: 4 pictures, one done after 3 min → 3 left, ~9 min
  await $.tool.call({ tool: "mcp__dnd-studio__build_progress", input: { step: "pictures", total: 4 } } as never);
  await $.tool.call({ tool: `${PREFIX}picture`, input: { idea: "a", name: "A" }, agentId: "maler-1" } as never);
  await $.tool.call({ tool: `${PREFIX}picture`, input: { idea: "b", name: "B" }, agentId: "maler-1" } as never);
  await w.clock.advance(3 * MIN);
  await $.tool.call({ tool: `${PREFIX}jobs`, input: { action: "wait", job_ids: ["picA"] }, agentId: "maler-1" } as never);
  const now = 1_700_000_000_000 + 3 * MIN;
  const s = await status();
  expect(s).toContain("1 von 4");
  expect(s).toContain(`noch ~9 min · fertig gegen ${clockText(now + 9 * MIN)}`);
  expect(s).toContain("Not checked yet");
});

test("build_status: the acceptance check row by row, spoiler-safe, with the agent that fixes it", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "build" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  await ui.unmount();
  const r = (await $.tool.call({ tool: "mcp__dnd-studio__build_status", input: {} } as never)) as { result?: unknown };
  const s = String(r.result ?? "");
  expect(s).toContain("Orte auf ihrer Karte · 1/2 · offen → pnp-maler");
  expect(s).toMatch(/\d+ offen/);
  // spoiler-safe by default: not which place is missing
  expect(s).not.toContain("Wald");
});
