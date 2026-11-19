import { expect } from "claude-code/testing";
import { test } from "./limits";

import { clashText } from "../features/health";
import { tidyError } from "../lib/host";
import { findShown } from "./shown";
import { pane, world } from "./world";

test("tidyError says a repeated error code once and drops the engine's wrapping", () => {
  expect(
    tidyError(
      "dnd-studio: $.http.fetch(http://127.0.0.1:37699/mcp) failed: ECONNREFUSED: ECONNREFUSED: Unable to connect.",
    ),
  ).toBe("ECONNREFUSED: Unable to connect.");
  expect(tidyError("HTTP 500")).toBe("HTTP 500");
  expect(
    tidyError(
      'dnd-studio: $.tool.register: the session already has an MCP server named "dnd-studio" in its MCP config',
    ),
  ).toBe(
    'the session already has an MCP server named "dnd-studio" in its MCP config',
  );
});

test("a clashing user-level MCP server: session.start still loads and goes on; /dnd health names the fix", async ($, on) => {
  world(on).registerError = "refused";
  // Resolves (the throw no longer aborts it); the clash note is written in the same block as the kept-state loads.
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  const out = await $.command.run({ command: "dnd", args: "health" } as never);
  const text = JSON.stringify(out);
  expect(text).toContain(
    "The plugin's own tool (initiative) could not be registered",
  );
});

test("without a clash health says nothing about an old server", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  const out = await $.command.run({ command: "dnd", args: "health" } as never);
  expect(JSON.stringify(out)).not.toContain("claude mcp remove");
});

test('the engine\'s clash message (2.1.326, user-level "dnd-studio" server) gets the exact fix', () => {
  const text = clashText(
    'dnd-studio: $.tool.register: the session already has an MCP server named "dnd-studio" in its MCP config; registering would replace it',
  );
  expect(text).toContain("claude mcp remove dnd-studio -s user");
  expect(text).toContain(
    '(the session already has an MCP server named "dnd-studio"',
  );
  expect(clashText("refused")).not.toContain("claude mcp remove");
});

test("the Zustand tab's plugin version comes from the manifest, not a constant", async ($, on) => {
  world(on);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd", args: "health" } as never);
  const ui = await $.ui.mount({ ...pane(90, 60), surface: "desktop" });
  expect(await findShown(ui, /dnd-studio 9\.8\.7/)).toBeDefined();
  await ui.unmount();
});
