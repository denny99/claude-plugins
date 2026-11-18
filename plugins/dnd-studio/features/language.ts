/**
 * New campaigns are German unless asked otherwise: the Studio's `campaign new` documents "default German" for
 * `language` but makes an English campaign when the argument is left out, so the mod puts it in.
 * Only this one MCP tool is hooked, never Bash.
 */
import type { On } from "claude-code";

export const CAMPAIGN_TOOL = "mcp__plugin_dnd-studio_dnd-studio__campaign";
/** The Studio's own enum value (new_campaign: language German | English). */
export const DEFAULT_LANGUAGE = "German";

/** The arguments with `language` added when `action` is `new` and none is given; else unchanged. */
export function withLanguage<T extends Record<string, unknown>>(input: T): T {
  if (input.action !== "new") return input;
  const language = input.language;
  if (typeof language === "string" && language.trim()) return input;
  return { ...input, language: DEFAULT_LANGUAGE };
}

export function registerLanguage(on: On): void {
  on("tool.call", { tool: CAMPAIGN_TOOL }, ($, e, next) =>
    next(withLanguage(e as unknown as Record<string, unknown>) as never),
  ).catch(($, e, next) => next(e));
}
