import { expect, test } from "claude-code/testing";

import { withLanguage } from "../features/language";
import { PREFIX, toolResult, world } from "./world";

test("campaign new without language is made German; a given language and other actions stay as they are", async ($, on) => {
  world(on);
  const seen: Record<string, unknown>[] = [];
  on("tool.call", (_, e) => {
    seen.push(e as unknown as Record<string, unknown>);
    return toolResult({ ok: true }) as never;
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.tool.call({ tool: `${PREFIX}campaign`, action: "new", name: "Probe" } as never);
  await $.tool.call({ tool: `${PREFIX}campaign`, action: "new", name: "Probe", language: "English" } as never);
  await $.tool.call({ tool: `${PREFIX}campaign`, action: "get" } as never);
  expect(seen.map((e) => e.language)).toEqual(["German", "English", undefined]);
  expect(seen[0]?.name).toBe("Probe");

  expect(withLanguage({ action: "new", language: "" })).toEqual({ action: "new", language: "German" });
  expect(withLanguage({ action: "set" })).toEqual({ action: "set" });
});
