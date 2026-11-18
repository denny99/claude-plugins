import type { EngineInterface, PluginOptions, Register } from "claude-code";

import {
  loadPlanApproval,
  loadRuns,
  refreshCampaign,
  registerBuild,
  renderBuild,
} from "../features/build";
import { refreshDiscord, registerEvening } from "../features/evening";
import { clashText, healthText, probe, renderHealth } from "../features/health";
import {
  loadLookOverrides,
  registerLook,
  renderLookPicker,
} from "../features/look";
import {
  endInitiative,
  nextTurn,
  refreshTable,
  registerTable,
  renderTable,
  startInitiative,
  tableSummary,
} from "../features/table";
import {
  readCampaign,
  readClash,
  readCheck,
  readEvening,
  readHealth,
  readInitiative,
  readLive,
  readLook,
  readRules,
  readRuns,
  readTab,
  readTable,
  setClash,
  setTab,
} from "../lib/state";
import { Header, Tabs, kit } from "../lib/ui";
import type { Tab } from "../types";

const PANE = "dnd";
const TABS: { id: Tab; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "build", label: "Build" },
  { id: "health", label: "Health" },
];

function tabOf(args: string): Tab | undefined {
  const w = args.trim().toLowerCase();
  return TABS.find((t) => t.id === w)?.id;
}

/** Reads what a tab shows (a person opened it, so the Studio may be asked). */
export async function refreshTab(
  $: EngineInterface,
  tab: Tab,
  options: PluginOptions,
): Promise<void> {
  if (tab === "table") {
    await refreshTable($);
    if ((await readTable($))?.discord) await refreshDiscord($);
  } else if (tab === "build") await refreshCampaign($);
  else await probe($, options);
}

export async function selectTab(
  $: EngineInterface,
  tab: Tab,
  options: PluginOptions,
): Promise<void> {
  await setTab($, tab);
  await refreshTab($, tab, options);
}

/** The model tool `initiative`: set, next, end or show the fight order. */
export async function initiativeTool(
  $: EngineInterface,
  input: Record<string, unknown>,
): Promise<string> {
  const action = String(input.action ?? "show");
  if (action === "set") {
    const order = Array.isArray(input.order)
      ? input.order.map(String).filter(Boolean)
      : [];
    if (!order.length) return "Give order: the names in turn order.";
    await startInitiative($, order);
    return `Fight started, round 1: ${order.join(", ")}. Nobody has the turn yet; call next to give it to ${order[0]} (the spotlight follows).`;
  }
  if (action === "next") {
    const ini = await nextTurn($);
    return ini.isActive
      ? `Round ${ini.round}: ${ini.order[ini.index]}'s turn.`
      : "No fight is running.";
  }
  if (action === "end") {
    await endInitiative($);
    return "Fight ended.";
  }
  return tableSummary($);
}

export function denyInitiative(): { deny: string } {
  return { deny: "dnd-studio: initiative failed." };
}

export const register: Register = (on, options) => {
  registerTable(on);
  registerBuild(on);
  registerLook(on);
  registerEvening(on);

  on("session.start", async ($, e, next) => {
    // Each registration on its own: one that fails (an old user-level MCP server named "dnd-studio" takes this
    // plugin's tool names) must not skip the rest, the kept state or next(e).
    try {
      await $.command.register({
        name: "dnd",
        description: "Open the D&D Studio pane (table, build, health)",
        argumentHint: "[table|build|health]",
      });
    } catch (err) {
      $.ui.log(`dnd-studio: /dnd not registered: ${String(err)}`);
    }
    try {
      await $.command.register({
        name: "dnd-scene",
        description: "Read the D&D table now: scene, round, whose turn, party",
      });
    } catch (err) {
      $.ui.log(`dnd-studio: /dnd-scene not registered: ${String(err)}`);
    }
    let clash: string | null = null;
    try {
      await $.tool.register({
        name: "initiative",
        description:
          "The fight order on the GM screen (kept by this plugin, the Studio has none). action set + order starts a fight (round 1, nobody has the turn yet); next gives the turn to the next in line (the first one right after set) and, for a hero, puts the Studio's spotlight on them (writes to the players' window); end stops it; show (default) reads the GM screen: scene, round, order, party values.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["set", "next", "end", "show"] },
            order: {
              type: "array",
              items: { type: "string" },
              description: "set: names in turn order, heroes and foes",
            },
          },
        },
      });
    } catch (err) {
      clash = err instanceof Error ? err.message : String(err);
      $.ui.log(`dnd-studio: ${clashText(clash)}`);
    }
    try {
      await setClash($, clash);
      await loadRuns($);
      await loadPlanApproval($);
      await loadLookOverrides($);
    } catch (err) {
      $.ui.log(`dnd-studio: loading kept state failed: ${String(err)}`);
    }
    return next(e);
  });

  on("command.run", { command: "dnd" }, async ($, e) => {
    const tab = tabOf(e.args) ?? (await readTab($));
    await $.ui.open({ id: PANE, title: "D&D" });
    await selectTab($, tab, options);
    return {
      text: tab === "health" ? await healthText($) : `D&D pane: ${tab}.`,
    };
  });

  on("command.run", { command: "dnd-scene" }, async ($) => {
    await refreshTable($);
    await setTab($, "table");
    await $.ui.open({ id: PANE, title: "D&D" });
    return { text: await tableSummary($) };
  });

  on("tool.call", { tool: "mcp__dnd-studio__initiative" }, async ($, e) => {
    return {
      result: await initiativeTool($, e as unknown as Record<string, unknown>),
    };
  }).catch(denyInitiative);

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const k = await kit($, e);
    const { Box, Input } = $.ui.resolve(e);
    const tab = await readTab($);
    const rules = await readRules($);
    const live = await readLive($);
    const now = await $.clock.now();
    const view = await readTable($);
    const look = await readLook($);
    const body =
      tab === "table"
        ? [
            ...renderTable($, k, Input as never, {
              view,
              ini: await readInitiative($),
              live,
              rules,
              now,
              evening: await readEvening($),
            }),
            renderLookPicker($, k, {
              sceneTitle: view?.scene?.title ?? "",
              applied: look.applied,
              enabled: rules.looks,
            }),
          ]
        : tab === "build"
          ? await renderBuild($, k, {
              runs: await readRuns($),
              campaign: await readCampaign($),
              live,
              rules,
              check: await readCheck($),
            })
          : renderHealth($, k, options, {
              health: await readHealth($),
              rules,
              clash: await readClash($),
            });
    return (
      <Box flexDirection="column" gap={1}>
        {Header(k, {
          title: "D&D STUDIO",
          context: view?.scene?.title ?? "",
          onRefresh: () => void refreshTab($, tab, options),
        })}
        {Tabs(k, {
          tabs: TABS,
          active: tab,
          onSelect: (id) => void selectTab($, id, options),
        })}
        {body.filter(Boolean)}
      </Box>
    );
  });
};
