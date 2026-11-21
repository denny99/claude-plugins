/**
 * New campaigns are German unless asked otherwise: the Studio's `campaign new` documents "default German" for
 * `language` but makes an English campaign when the argument is left out, so the mod puts it in.
 * Only this one MCP tool is hooked, never Bash. The same hook keeps the build's kept state with its campaign
 * (features/build.tsx forgetBuild/renameBuild), and the Studio's spoiler-free mode when Claude reads or sets it.
 */
import type { EngineInterface, On } from "claude-code";
import { forgetBuild, renameBuild } from "./build";
import { profileName, readCampaign, setCampaign, setStudioSpoiler, spoilerOf } from "../lib/state";
import { answerOf } from "../lib/studio";

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
  on("tool.call", { tool: CAMPAIGN_TOOL }, async ($, e, next) => {
    const input = withLanguage(e as unknown as Record<string, unknown>);
    // the open campaign before the call: `set` without `campaign` works on it, `remove` takes it away
    const before =
      input.action === "set" ? ((await readCampaign($))?.name ?? "") : "";
    const r = (await next(input as never)) as Record<string, unknown>;
    try {
      await campaignChanged($, input, before, r);
    } catch {
      // a kept build that is not forgotten never stalls the Studio's answer
    }
    return r as never;
  }).catch(($, e, next) => next(e));
}

/**
 * The build (runs, plan sign-off) belongs to one campaign in one profile: a campaign made anew under an old name
 * starts at 0, a removed one takes its build along, a renamed one keeps it under the new name.
 */
async function campaignChanged(
  $: EngineInterface,
  input: Record<string, unknown>,
  before: string,
  r: Record<string, unknown>,
): Promise<void> {
  if (r.deny || r.isError || (r.result as { isError?: boolean })?.isError)
    return;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  // the Studio's spoiler-free mode of the open campaign, as Claude just read or set it: the pane follows at once
  if (input.action === "spoiler") {
    if (str(input.campaign)) return;
    const got = spoilerOf(answerOf({ content: r.result }));
    if (got.known) await setStudioSpoiler($, got);
    return;
  }
  const profile = await profileName($);
  if (input.action === "new" && str(input.name)) {
    await forgetBuild($, { profile, campaign: str(input.name) });
    await setCampaign($, null);
    return;
  }
  if (input.action !== "set") return;
  const which = str(input.campaign) || before;
  if (!which) return;
  if (input.remove === true) {
    await forgetBuild($, { profile, campaign: which });
    await setCampaign($, null);
  } else if (str(input.new_name)) {
    await renameBuild($, profile, which, str(input.new_name));
    await setCampaign($, null);
  }
}
