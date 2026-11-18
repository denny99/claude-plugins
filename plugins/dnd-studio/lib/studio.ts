/**
 * The D&D Studio MCP server, as this plugin ships it (`.mcp.json` key `dnd-studio`). Every call goes through
 * `$.mcp.call` on a person's press or a model's own call; nothing here runs by itself.
 */
import type { EngineInterface } from "claude-code";

/** The server key in this plugin's `.mcp.json`. */
export const SERVER_KEY = "dnd-studio";
/** How Claude Code names the tools of a plugin's MCP server. */
export const STUDIO_TOOL_PREFIX = "mcp__plugin_dnd-studio_dnd-studio__";

/** The text of MCP content blocks (or of a tool result in any of its shapes). */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((b) =>
        b && typeof b === "object" && "text" in b
          ? String((b as { text: unknown }).text)
          : "",
      )
      .join("\n");
  if (content && typeof content === "object") {
    const c = content as {
      content?: unknown;
      text?: unknown;
      result?: unknown;
    };
    if (c.content !== undefined) return textOf(c.content);
    if (typeof c.text === "string") return c.text;
    if (c.result !== undefined) return textOf(c.result);
  }
  return "";
}

/** JSON when the text is JSON, else undefined. */
export function jsonOf(text: string): Record<string, unknown> | undefined {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Calls one Studio tool; resolves the parsed JSON answer (or `{ text }`), throws with the server's message. */
export async function studioCall(
  $: EngineInterface,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const link = await $.mcp.connect(SERVER_KEY);
  if (!link.isConnected)
    throw new Error(
      `D&D Studio is not connected: ${link.message || link.reason}`,
    );
  const res = await $.mcp.call(link.server, tool, args);
  if (res.isError) throw new Error(textOf(res.content) || `${tool} failed`);
  return answerOf(res);
}

/** The engine's notice when it cut an MCP answer at its output limit (MAX_MCP_OUTPUT_TOKENS, 25k tokens by default). */
const TRUNCATED = /tool output was truncated|token limit\]/i;

/**
 * One Studio answer as an object: the server's structuredContent, else the JSON of its first text block (the Studio
 * may append a note block: a secret waiting, "the same call again"), else all blocks run together; otherwise
 * `{ text }`, with `truncated: true` when the engine cut it at its output limit (a big `campaign get` is cut at
 * 100 000 characters and gets a notice block, so its JSON never parses).
 */
export function answerOf(res: {
  content?: unknown;
  structuredContent?: unknown;
}): Record<string, unknown> {
  const sc = res.structuredContent;
  if (sc && typeof sc === "object" && !Array.isArray(sc))
    return sc as Record<string, unknown>;
  const blocks = Array.isArray(res.content)
    ? res.content
        .filter(
          (b): b is { text: unknown } =>
            !!b && typeof b === "object" && "text" in b,
        )
        .map((b) => String(b.text))
    : [textOf(res.content)];
  const parsed =
    (blocks.length ? jsonOf(blocks[0]!) : undefined) ??
    jsonOf(blocks.join("")) ??
    jsonOf(blocks.join("\n"));
  if (parsed) return parsed;
  const text = blocks.join("\n");
  return TRUNCATED.test(text) ? { text, truncated: true } : { text };
}

/** True when an answer of campaign get is a campaign (its name and lists), not a cut or plain-text answer. */
export function isCampaign(c: Record<string, unknown>): boolean {
  return (
    (typeof c.open === "string" || typeof c.name === "string") &&
    (Array.isArray(c.scenes) || Array.isArray(c.npcs) || Array.isArray(c.places))
  );
}
