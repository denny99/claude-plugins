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
import { PLUGIN_VERSION } from "../lib/brand";
import { isListenerMode } from "../lib/model";
import {
  Actions,
  Card,
  CardTitle,
  ListRow,
  ProblemCard,
  Section,
  Sentence,
} from "../lib/ui";
import type { Kit } from "../lib/ui";
import type { EveningState, Health, Rules, TableView } from "../types";
import { Switch } from "./dnd-ui";
import { setListener } from "./evening";

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
  { key: "annotate", label: "Hinweise zu Tisch-Aufrufen" },
  {
    key: "denyLeaks",
    label: "Handouts/Geheimes nicht aufs gemeinsame Fenster",
  },
  { key: "denyTalkNpc", label: "talk_npc am laufenden Tisch sperren" },
  { key: "denyFamily", label: "Schreiben im Profil „Meine Familie“ sperren" },
  { key: "spoilerSafe", label: "Spoilerfrei (ich spiele mit)" },
];

export function renderHealth(
  $: EngineInterface,
  k: Kit,
  options: PluginOptions,
  d: {
    health: Health | null;
    rules: Rules;
    clash?: string | null;
    view?: TableView | null;
    evening?: EveningState;
  },
): RenderElement[] {
  const { health, rules } = d;
  const out: RenderElement[] = [];
  if (d.clash)
    out.push(
      ProblemCard(k, {
        key: "clash",
        title: "Namenskollision: alter MCP-Server „dnd-studio“",
        cause: CLASH_FIX,
        action: {
          key: "probe-clash",
          label: "Neu prüfen",
          icon: "refresh",
          onPress: () => void probe($, options),
        },
      }),
    );
  if (health?.app === "down")
    out.push(
      ProblemCard(k, {
        key: "app-down",
        title: "Die Studio-App läuft nicht",
        cause: startHint(health.platform as never),
        action: startArgv(health.platform as never, "x")
          ? {
              key: "start",
              label: "Studio öffnen",
              icon: "play",
              onPress: () => void startApp($, options),
            }
          : {
              key: "probe-down",
              label: "Neu prüfen",
              icon: "refresh",
              onPress: () => void probe($, options),
            },
      }),
    );
  const disc = d.evening?.discord ?? null;
  const version = d.evening?.versionNow ?? "";
  const row = (
    key: string,
    status: "ok" | "failed" | "idle" | "warning",
    title: string,
    meta: string,
  ): RenderElement => ListRow(k, { key, status, title, meta });
  out.push(
    Card(k, {
      key: "studio",
      children: [
        CardTitle(k, {
          icon: "stethoscope",
          title: "Zustand",
          count: health
            ? new Date(health.checkedAt).toISOString().slice(11, 16)
            : "",
        }),
        ...(health
          ? [
              row(
                "h-app",
                health.app === "up" ? "ok" : "failed",
                "Studio-App",
                health.app === "up"
                  ? `${version ? `${version} · ` : ""}läuft auf Port ${portOf(options)}`
                  : "läuft nicht",
              ),
              row(
                "h-mcp",
                health.connected
                  ? "ok"
                  : health.app === "up"
                    ? "failed"
                    : "idle",
                "Verbindung zu Claude",
                health.connected
                  ? "Token gesetzt"
                  : "Studio → Einstellungen → Verbindungen → Für Claude Code einrichten",
              ),
            ]
          : [Sentence(k, "Noch nicht geprüft.", { faint: true })]),
        row("h-plugin", "ok", "Plugin", `dnd-studio ${PLUGIN_VERSION}`),
        row(
          "h-discord",
          disc?.connected ? "ok" : "idle",
          "Discord-Bot",
          disc?.connected
            ? `im Sprachkanal${disc.channel ? ` ${disc.channel}` : ""}`
            : "nicht im Sprachkanal",
        ),
        row(
          "h-clash",
          d.clash ? "failed" : "ok",
          "Namenskollision",
          d.clash ? "alter MCP-Server hält den Namen" : "keine",
        ),
        Actions(
          k,
          "studio-acts",
          [
            {
              key: "probe",
              label: "Neu prüfen",
              icon: "refresh",
              variant: "primary",
              onPress: () => void probe($, options),
            },
            {
              key: "reconfigure",
              label: "Plugin neu einrichten",
              icon: "gear",
              variant: "secondary",
              onPress: () =>
                $.ui.toast(
                  "/plugin → dnd-studio → konfigurieren: Token aus Studio → Einstellungen → Verbindungen.",
                ),
            },
          ],
          2,
        ),
      ].filter((x): x is RenderElement => !!x),
    }),
  );
  const listening = isListenerMode(d.view ?? null);
  out.push(
    Switch(k, {
      key: "switch-listener",
      title: "Zuhörer",
      text: "Hört im Discord mit und reagiert, wenn jemand die Spielleitung anspricht. Nur bei laufendem Tisch.",
      icon: "mic",
      on: listening,
      onPress: () => void setListener($, listening ? "off" : "haiku"),
    }),
  );
  out.push(
    Switch(k, {
      key: "rule-looks",
      title: "Szenen-Looks",
      text: "Hintergrund und Farben der App folgen der Szene am Tisch.",
      icon: "moon",
      on: rules.looks,
      onPress: () => void toggleRule($, "looks").then(() => applyLook($)),
    }),
  );
  out.push(
    Section(k, {
      key: "rules",
      title: "Regeln",
      collapsible: true,
      defaultOpen: false,
      children: RULES.map((r) =>
        Switch(k, {
          key: `toggle-${r.key}`,
          title: r.label,
          on: rules[r.key],
          onPress: () => void toggleRule($, r.key).then(() => applyLook($)),
        }),
      ),
    }),
  );
  return out;
}
