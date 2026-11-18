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
import { clockTime, isListenerMode } from "../lib/model";
import {
  Actions,
  Card,
  CardTitle,
  ListRow,
  ProblemCard,
  Sentence,
} from "../lib/ui";
import type { Kit } from "../lib/ui";
import type { EveningState, Health, Rules, TableView } from "../types";
import { Fold, Switch } from "./dnd-ui";

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
  $.ui.toast("Studio startet … in ein paar Sekunden „Neu prüfen“ drücken.");
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

const RULES: { key: keyof Rules; label: string; text: string }[] = [
  {
    key: "annotate",
    label: "Claude Tipps am Tisch geben",
    text: "Claude bekommt während des Abends kurze Erinnerungen, etwa wenn Discord nicht verbunden ist oder ein Spieler noch wartet.",
  },
  {
    key: "denyLeaks",
    label: "Geheimes nur privat zeigen",
    text: "Handouts und Geheimnisse für einen Spieler landen nicht im gemeinsamen Fenster, sondern als Flüstern bei ihm.",
  },
  {
    key: "denyTalkNpc",
    label: "NPCs am Tisch selbst sprechen lassen",
    text: "Bei laufendem Tisch antworten NPCs sofort mit ihrer eigenen Stimme, statt erst im Hintergrund vorbereitet zu werden.",
  },
  {
    key: "denyFamily",
    label: "Profil „Meine Familie“ schützen",
    text: "Solange dieses Profil im Studio offen ist, ändert Claude dort nichts.",
  },
  {
    key: "spoilerSafe",
    label: "Spoilerfrei (ich spiele mit)",
    text: "Blendet Ziele, Notizen, Geheimnisse und Bilder aus, damit du als Mitspieler nichts vorher siehst.",
  },
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
            ? clockTime(health.checkedAt)
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
                  : "Token fehlt: im Studio unter Einstellungen → Verbindungen kopieren",
              ),
            ]
          : [Sentence(k, "Noch nicht geprüft.", { faint: true })]),
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
        row(
          "h-clash",
          d.clash ? "failed" : "ok",
          "Alter Studio-Server",
          d.clash ? "blockiert das Plugin" : "keiner im Weg",
        ),
        Actions(
          k,
          "studio-acts",
          [
            {
              key: "reconfigure",
              label: health?.connected ? "Token ändern" : "Token eintragen",
              icon: "gear",
              variant: health?.connected ? ("link" as const) : ("secondary" as const),
              onPress: () =>
                $.ui.toast(
                  "1. Im Studio: Einstellungen → Verbindungen → Token kopieren. 2. Hier: /plugin → dnd-studio → Konfigurieren → Token einfügen.",
                ),
            },
          ],
          2,
        ),
      ].filter((x): x is RenderElement => !!x),
    }),
  );
  // One card for every switch of the plugin, grouped: the listener is switched at the table (one place), the looks
  // of the table and of the build sit together, then the table rules. Folded, like every other section.
  const listening = isListenerMode(d.view ?? null);
  out.push(
    Fold(k, {
      key: "settings",
      icon: "sliders",
      title: "Einstellungen",
      children: [
        CardTitle(k, { icon: "mic", title: "Zuhörer" }),
        Sentence(
          k,
          `Zuhörer ist ${listening ? "an" : "aus"}. Ein- und ausschalten im Tisch-Tab (Karte „Zuhörer“), nur bei laufendem Tisch.`,
          { faint: true },
        ),
        CardTitle(k, { icon: "moon", title: "Looks" }),
        Switch(k, {
          key: "rule-looks",
          title: "Szenen-Looks",
          text: "Hintergrund und Farben der App folgen der Szene am Tisch.",
          on: rules.looks,
          bare: true,
          onPress: () => void toggleRule($, "looks").then(() => applyLook($)),
        }),
        Switch(k, {
          key: "rule-buildLooks",
          title: "Bau-Looks",
          text: "Beim Bauen wechselt der Hintergrund mit dem Abschnitt.",
          on: rules.buildLooks,
          bare: true,
          onPress: () =>
            void toggleRule($, "buildLooks").then(() => applyLook($)),
        }),
        CardTitle(k, { icon: "list", title: "Regeln am Tisch" }),
        ...RULES.map((r) =>
          Switch(k, {
            key: `toggle-${r.key}`,
            title: r.label,
            text: r.text,
            on: rules[r.key],
            bare: true,
            onPress: () => void toggleRule($, r.key).then(() => applyLook($)),
          }),
        ),
      ],
    }),
  );
  return out;
}
