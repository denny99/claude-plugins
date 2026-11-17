/**
 * Health: is the D&D Studio app listening, is Claude connected to its MCP server, how to start it on this OS, and the
 * rule toggles.
 */
import type {
  EngineInterface,
  PluginOptions,
  RenderElement,
} from "claude-code";

import { applyLook } from "./look";
import { createHost, startArgv, startHint, tidyError } from "../lib/host";
import { readClash, readHealth, setHealth, toggleRule } from "../lib/state";
import { SERVER_KEY } from "../lib/studio";
import { Line, Row, Section } from "../lib/ui";
import type { Kit } from "../lib/ui";
import type { Health, Rules } from "../types";

export function portOf(options: PluginOptions): number {
  const p = Number(options.port);
  return Number.isFinite(p) && p > 0 ? p : 37641;
}

/** Probes the app (any HTTP answer = up) and the MCP connection. */
export async function probe(
  $: EngineInterface,
  options: PluginOptions,
): Promise<Health> {
  const host = await createHost($);
  const http = await host.reachable(`http://127.0.0.1:${portOf(options)}/mcp`);
  let connected = false;
  let detail = http.detail;
  if (http.isUp) {
    const link = await $.mcp.connect(SERVER_KEY);
    connected = link.isConnected;
    if (!link.isConnected)
      detail = `${http.detail}; MCP: ${tidyError(link.message || link.reason)}`;
  }
  const h: Health = {
    checkedAt: await $.clock.now(),
    app: http.isUp ? "up" : "down",
    connected,
    detail,
    platform: host.platform,
  };
  await setHealth($, h);
  return h;
}

export async function startApp(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  const host = await createHost($);
  const argv = startArgv(host.platform, host.localAppData);
  if (!argv) {
    $.ui.toast(startHint(host.platform));
    return;
  }
  await host.run(argv[0]!, argv.slice(1));
  $.ui.toast("Starting DnD Studio… press Check in a few seconds.");
  $.clock.after(8000, () => void probe($, options));
}

/** The fix for an old user-level MCP server named like this plugin (its tools take the plugin's tool names). */
export const CLASH_FIX =
  "Run `claude mcp remove dnd-studio -s user`, then restart Claude Code (the D&D Studio app's new installer does this migration too).";

/** The health line for a failed tool registration at session start. */
export function clashText(why: string): string {
  const detail = tidyError(why);
  return /MCP server named|already/i.test(detail)
    ? `The plugin's own tool (initiative) is missing: an MCP server named "dnd-studio" is set up at user level and holds its name (${detail}). ${CLASH_FIX}`
    : `The plugin's own tool (initiative) could not be registered: ${detail}`;
}

export async function healthText($: EngineInterface): Promise<string> {
  const clash = await readClash($);
  const text = await healthLine($);
  return clash ? `${clashText(clash)}\n${text}` : text;
}

async function healthLine($: EngineInterface): Promise<string> {
  const h = await readHealth($);
  if (!h) return "Not checked yet.";
  if (h.app === "down")
    return `D&D Studio is not running (${h.detail}). ${startHint(h.platform as never)}`;
  if (!h.connected)
    return `The app runs but Claude is not connected: set the token (Studio → Settings → Connections → Install for Claude Code, or /plugin → dnd-studio → configure). ${h.detail}`;
  return "D&D Studio is running and connected.";
}

const RULES: { key: keyof Rules; label: string }[] = [
  { key: "annotate", label: "Notes on table calls" },
  { key: "denyLeaks", label: "Block handouts/secrets on the shared window" },
  { key: "denyTalkNpc", label: "Block talk_npc at a live table" },
  { key: "denyFamily", label: 'Block writes in profile "Meine Familie"' },
  { key: "spoilerSafe", label: "Spoiler-safe (I play along)" },
  { key: "looks", label: "Scene looks (theme + backdrop)" },
];

export function renderHealth(
  $: EngineInterface,
  k: Kit,
  options: PluginOptions,
  d: { health: Health | null; rules: Rules; clash?: string | null },
): RenderElement[] {
  const { health, rules } = d;
  const out: RenderElement[] = [];
  if (d.clash)
    out.push(
      Section(k, {
        key: "clash",
        title: "Old MCP server",
        children: [
          Row(k, {
            key: "h-clash",
            status: "failed",
            primary:
              'User-level MCP server "dnd-studio" takes the plugin\'s tool names',
            secondary: d.clash,
          }),
          Line(k, CLASH_FIX, { dim: true }),
        ],
      }),
    );
  out.push(
    Section(k, {
      key: "studio",
      title: "Studio",
      actions: [
        {
          key: "probe",
          label: "Check",
          primary: true,
          onPress: () => void probe($, options),
        },
        ...(health?.app === "down" && startArgv(health.platform as never, "x")
          ? [
              {
                key: "start",
                label: "Start app",
                onPress: () => void startApp($, options),
              },
            ]
          : []),
      ],
      children: health
        ? [
            Row(k, {
              key: "h-app",
              status: health.app === "up" ? "ok" : "failed",
              primary:
                health.app === "up"
                  ? `App listening on 127.0.0.1:${portOf(options)}`
                  : "App not running",
              secondary: health.detail,
            }),
            Row(k, {
              key: "h-mcp",
              status: health.connected
                ? "ok"
                : health.app === "up"
                  ? "failed"
                  : "idle",
              primary: health.connected
                ? "Claude connected"
                : "Claude not connected",
              secondary: health.connected
                ? ""
                : "Studio → Settings → Connections → Install for Claude Code",
            }),
            health.app === "down"
              ? Line(k, startHint(health.platform as never), { dim: true })
              : null,
          ].filter((x): x is RenderElement => !!x)
        : [Line(k, "Press Check.", { dim: true })],
    }),
  );
  out.push(
    Section(k, {
      key: "rules",
      title: "Rules",
      collapsible: true,
      children: RULES.map((r) =>
        Row(k, {
          key: `rule-${r.key}`,
          glyph: rules[r.key] ? "[x]" : "[ ]",
          primary: r.label,
          actions: [
            {
              key: `toggle-${r.key}`,
              label: rules[r.key] ? "Off" : "On",
              onPress: () => void toggleRule($, r.key).then(() => applyLook($)),
            },
          ],
        }),
      ),
    }),
  );
  return out;
}
