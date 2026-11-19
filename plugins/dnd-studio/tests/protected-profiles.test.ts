import { expect, test } from "claude-code/testing";

import { configureProtectedProfiles, isProtectedProfile } from "../lib/state";

test("protected profiles: default keeps the old name, the option replaces it, empty protects none", () => {
  configureProtectedProfiles(undefined);
  expect(isProtectedProfile("Meine Familie")).toBe(true);
  expect(isProtectedProfile("meine familie (alt)")).toBe(true);
  expect(isProtectedProfile("Testprofil")).toBe(false);

  configureProtectedProfiles("Gruppe A, Echte Runde");
  expect(isProtectedProfile("gruppe a")).toBe(true);
  expect(isProtectedProfile("Echte Runde 2026")).toBe(true);
  expect(isProtectedProfile("Meine Familie")).toBe(false);

  configureProtectedProfiles("");
  expect(isProtectedProfile("Meine Familie")).toBe(false);
  expect(isProtectedProfile("")).toBe(false);

  configureProtectedProfiles(undefined);
});
