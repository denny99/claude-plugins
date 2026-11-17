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
  const text = textOf(res.content);
  if (res.isError) throw new Error(text || `${tool} failed`);
  return jsonOf(text) ?? { text };
}
