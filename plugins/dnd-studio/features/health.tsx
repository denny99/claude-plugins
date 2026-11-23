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
import type { StudioSpoiler } from "../lib/state";
import { SERVER_KEY } from "../lib/studio";
import { clockTime } from "../lib/model";
import { Card, ListRow, ProblemCard, Toggle } from "../lib/ui";
import type { Kit } from "../lib/ui";
import type { EveningState, Health, Rules, TableView } from "../types";

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
  $.ui.toast("Studio startet … der Zustand wird gleich neu gelesen.");
  $.clock.after(8000, () => void probe($, options));
}

/** The fix for an old user-level MCP server named like this plugin (its tools take the plugin's tool names). */
export const CLASH_FIX =
  "Im Terminal `claude mcp remove dnd-studio -s user` ausführen, dann Claude Code neu starten (der neue Installer der Studio-App erledigt das auch).";
const CLASH_FIX_EN =
  "Run `claude mcp remove dnd-studio -s user`, then restart Claude Code (the D&D Studio app's new installer does this migration too).";

/** The health line for a failed tool registration at session start. */
export function clashText(why: string): string {
  const detail = tidyError(why);
  return /MCP server named|already/i.test(detail)
    ? `The plugin's own tool (initiative) is missing: an MCP server named "dnd-studio" is set up at user level and holds its name (${detail}). ${CLASH_FIX_EN}`
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

// Each text is the row's meta: short enough to stand beside the name without being cut.
const RULES: { key: keyof Rules; label: string; text: string }[] = [
  {
    key: "annotate",
    label: "Tipps am Tisch",
    text: "Kurze Erinnerungen für Claude während des Abends",
  },
  {
    key: "denyLeaks",
    label: "Geheimes privat",
    text: "Handouts und Geheimnisse gehen als Flüstern an den Spieler",
  },
  {
    key: "denyTalkNpc",
    label: "NPCs sprechen selbst",
    text: "Am laufenden Tisch antworten NPCs sofort mit eigener Stimme",
  },
  {
    key: "denyFamily",
    label: "Profile schützen",
    text: "In geschützten Profilen (Plugin-Einstellung, Vorgabe „Meine Familie“) ändert Claude nichts",
  },
  {
    key: "spoilerSafe",
    label: "Spoilerfrei",
    text: "Blendet Ziele, Notizen, Geheimnisse und Bilder für dich aus",
  },
];

export function renderHealth(
  $: EngineInterface,
  k: Kit,
  options: PluginOptions,
  d: {
    health: Health | null;
    rules: Rules;
    /** The Studio's spoiler-free mode: when known, the switch „Spoilerfrei“ follows it and cannot be pressed here. */
    studioSpoiler?: StudioSpoiler;
    clash?: string | null;
    view?: TableView | null;
    evening?: EveningState;
    /** The manifest's version (brand.ts pluginVersion). */
    pluginVersion?: string;
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
      }),
    );
  if (health?.app === "down")
    out.push(
      ProblemCard(k, {
        key: "app-down",
        title: "Die Studio-App läuft nicht",
        cause: startHint(health.platform as never),
        // re-reading is the header's „Neu laden“: a card never repeats it
        action: startArgv(health.platform as never, "x")
          ? {
              key: "start",
              label: "Studio öffnen",
              variant: "primary",
              onPress: () => void startApp($, options),
            }
          : undefined,
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
      title: {
        icon: "stethoscope",
        title: "Zustand",
        subtitle: health
          ? `Zuletzt geprüft um ${clockTime(health.checkedAt)}.`
          : "Noch nicht geprüft.",
      },
      // the token is set in the plugin's configuration, not here: one sentence, no button that only explains
      hint: health?.connected
        ? "Der Token steht unter /plugin → dnd-studio → Konfigurieren."
        : "Token im Studio unter Einstellungen → Verbindungen kopieren, dann unter /plugin → dnd-studio → Konfigurieren einfügen.",
      children: [
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
                  : "Token fehlt",
              ),
            ]
          : []),
        row(
          "h-plugin",
          d.pluginVersion ? "ok" : "idle",
          "Plugin",
          `dnd-studio ${d.pluginVersion || "Version unbekannt"}`,
        ),
        row(
          "h-discord",
          disc?.connected ? "ok" : "idle",
          "Discord-Bot",
          disc?.connected
            ? `im Sprachkanal${disc.channel ? ` ${disc.channel}` : ""}`
            : "nicht im Sprachkanal",
        ),
        ...(d.clash
          ? [row("h-clash", "failed", "Alter Studio-Server", "blockiert das Plugin")]
          : []),
      ],
    }),
  );
  // One card per group of switches, each switch a row (name, state, what it does).
  const relook = (key: keyof Rules) => () =>
    void toggleRule($, key).then(() => applyLook($));
  out.push(
    Card(k, {
      key: "settings-looks",
      title: { icon: "moon", title: "Hintergründe" },
      children: [
        Toggle(k, {
          key: "rule-looks",
          label: "Tisch-Hintergrund",
          hint: "Szenenbild oder Spieltisch hinter dem laufenden Tisch",
          on: rules.looks,
          onToggle: relook("looks"),
        }),
        Toggle(k, {
          key: "rule-buildLooks",
          label: "Bau-Hintergründe",
          hint: "Beim Bauen wechselt der Hintergrund mit dem Abschnitt",
          on: rules.buildLooks,
          onToggle: relook("buildLooks"),
        }),
      ],
    }),
    Card(k, {
      key: "settings-rules",
      title: { icon: "list", title: "Regeln am Tisch" },
      children: RULES.map((r) =>
        r.key === "spoilerSafe" && d.studioSpoiler?.known
          ? ListRow(k, {
              key: `toggle-${r.key}`,
              title: r.label,
              meta: `Folgt dem Studio${d.studioSpoiler.campaign ? ` („${d.studioSpoiler.campaign}“)` : ""}, dort umschalten`,
              pill: {
                text: d.studioSpoiler.on ? k.s.on : k.s.off,
                tone: d.studioSpoiler.on ? "ok" : "neutral",
                glyph: false,
              },
              wrap: true,
            })
          : Toggle(k, {
          key: `toggle-${r.key}`,
          label: r.label,
          hint: r.text,
          on: rules[r.key],
          onToggle: relook(r.key),
        }),
      ),
    }),
  );
  return out;
}
