// Kit sync K1–K5: the copy of the shared UI kit in this mod carries the new helpers and fixed words.
import { expect, test } from "claude-code/testing";

import {
  KIT_STRINGS,
  reloadAction,
  translateStatus,
  truncateMiddle,
} from "../lib/ui";
import { labelWords } from "./kit-rules";

test("Kit-Sync K1–K5: feste Wörter, Fremdstatus, Kürzen in der Mitte, Wörter eines Etiketts", () => {
  expect(KIT_STRINGS.de.reload).toBe("Neu laden");
  expect(typeof reloadAction).toBe("function");
  expect(translateStatus("passed").text).toBe("grün");
  expect(truncateMiddle("abcdefghij", 7)).toBe("abc…hij");
  expect(labelWords("↑ Push")).toEqual(["Push"]);
});
