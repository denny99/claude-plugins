import type {
  EngineInterface,
  PluginOptions,
  Register,
  RenderElement,
  RenderInput,
} from "claude-code";

import {
  loadPlanApproval,
  loadRuns,
  refreshCampaign,
  registerBuild,
  renderBuild,
} from "../features/build";
import { refreshDiscord, registerEvening } from "../features/evening";
import { clashText, healthText, probe, renderHealth } from "../features/health";
import { pluginVersion } from "../lib/brand";
import {
  loadLookOverrides,
  registerLook,
  renderLookPicker,
} from "../features/look";
import {
  bandStatus,
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
  readReview,
  readRules,
  readRuns,
  readTab,
  readTable,
  setClash,
  setTab,
} from "../lib/state";
import { isLive } from "../lib/model";
import {
  LauncherChip,
  LauncherRow,
  PaneBody,
  Tabs,
  kit,
  mergeLauncherRows,
  toneColor,
  truncate,
} from "../lib/ui";
import type { IconName } from "../lib/ui";
import type { Tab } from "../types";
import {
  configureAutoOpen,
  DndHeader,
  openPane,
  PANE,
} from "../features/dnd-ui";
import {
  openCount,
  renderReview,
  REVIEW_TOOL,
  REVIEW_TOOL_DESCRIPTION,
  reviewTool,
  startReviewSession,
} from "../features/review";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "table", label: "Tisch", icon: "dice" },
  { id: "build", label: "Bau", icon: "hammer" },
  { id: "review", label: "Prüfen", icon: "speaker" },
  { id: "health", label: "Zustand", icon: "heart" },
];
const TAB_ALIASES: Record<string, Tab> = {
  tisch: "table",
  bau: "build",
  pruefen: "review",
  prüfen: "review",
  zustand: "health",
};

function tabOf(args: string): Tab | undefined {
  const w = args.trim().toLowerCase();
  return TABS.find((t) => t.id === w)?.id ?? TAB_ALIASES[w];
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
  else if (tab === "health") await probe($, options);
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

export function denyReview(): { deny: string } {
  return { deny: "dnd-studio: review failed." };
}

async function probeQuietly(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  try {
    await probe($, options);
  } catch {
    // no chip is all a failed probe costs
  }
}

/**
 * The launcher row above the prompt (key launch:dnd-studio): the "D&D" chip while the Studio answers (or a table is
 * live), and at a live table its state as a button to the Table tab, hints after it. Null: nothing to show.
 */
async function drawLauncher(
  $: EngineInterface,
  e: RenderInput<"AbovePrompt">,
  options: PluginOptions,
): Promise<RenderElement | null> {
  const table = await bandStatus($);
  const health = await readHealth($);
  if (!table && health?.app !== "up") return null;
  const k = await kit($, e, { brand: "dnd", lang: "de" });
  const { Button, Text } = k;
  const chips: RenderElement[] = [
    LauncherChip(k, {
      key: "launch-dnd",
      icon: "dice",
      label: "D&D",
      onPress: () => void openPane($),
    }),
  ];
  if (table) {
    // Desktop paints `label`, not the children: both carry the same text (kit v3.1).
    const tableText = k.graphical
      ? table.status
      : truncate(table.status, Math.max(12, Math.floor(k.cols * 0.6)));
    chips.push(
      <Button
        key="launch-dnd-table"
        label={tableText}
        plain
        onPress={() => void openTable($, options)}
      >
        {tableText}
      </Button>,
    );
    for (const [n, hint] of table.hints.entries())
      chips.push(
        <Text
          key={`launch-dnd-hint-${n}`}
          size={k.graphical ? "footnote" : undefined}
          color={
            k.graphical
              ? toneColor(k, hint.tone)
              : hint.tone === "bad"
                ? "red"
                : hint.tone === "ok"
                  ? "green"
                  : "yellow"
          }
          wrap="truncate-end"
        >
          {truncate(hint.text, Math.max(12, Math.floor(k.cols * 0.4)))}
        </Text>,
      );
  }
  return LauncherRow(k, { plugin: "dnd-studio", chips });
}

async function openTable(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  await openPane($);
  await selectTab($, "table", options);
}

export const register: Register = (on, options) => {
  configureAutoOpen(options.autoOpen);
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
        description: "Open the D&D Studio pane (table, build, review, health)",
        argumentHint: "[table|build|review|health]",
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
      await $.tool.register({
        name: REVIEW_TOOL,
        description: REVIEW_TOOL_DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["add", "list", "clear"] },
            items: {
              type: "array",
              description: "add: the new things to review",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  kind: { type: "string", enum: ["sound", "image", "video"] },
                  source: { type: "string" },
                  meta: { type: "string" },
                  agent: { type: "string" },
                  scene: { type: "string" },
                },
                required: ["name", "source"],
              },
            },
          },
        },
      });
    } catch (err) {
      clash = clash ?? (err instanceof Error ? err.message : String(err));
      $.ui.log(`dnd-studio: review tool not registered: ${String(err)}`);
    }
    try {
      await setClash($, clash);
      await loadRuns($);
      await loadPlanApproval($);
      await loadLookOverrides($);
      startReviewSession(await $.clock.now());
    } catch (err) {
      $.ui.log(`dnd-studio: loading kept state failed: ${String(err)}`);
    }
    // Whether the Studio answers decides the launcher chip; probed after start, outside the hook's budget.
    $.clock.after(1500, () => void probeQuietly($, options));
    return next(e);
  });

  on("command.run", { command: "dnd" }, async ($, e) => {
    const tab = tabOf(e.args) ?? (await readTab($));
    await openPane($);
    await selectTab($, tab, options);
    return {
      text: tab === "health" ? await healthText($) : `D&D pane: ${tab}.`,
    };
  });

  on("command.run", { command: "dnd-scene" }, async ($) => {
    await refreshTable($);
    await setTab($, "table");
    await openPane($);
    return { text: await tableSummary($) };
  });

  on("tool.call", { tool: "mcp__dnd-studio__initiative" }, async ($, e) => {
    return {
      result: await initiativeTool($, e as unknown as Record<string, unknown>),
    };
  }).catch(denyInitiative);

  on("tool.call", { tool: "mcp__dnd-studio__review" }, async ($, e) => {
    return {
      result: await reviewTool($, e as unknown as Record<string, unknown>),
    };
  }).catch(denyReview);

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    return (await drawLauncher($, e, options)) ?? next(e);
  });
  on(
    "ui.render",
    { component: "AbovePromptList" },
    async ($, e, next) =>
      (await mergeLauncherRows($, e, next as never)) as RenderElement,
  );

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const k = await kit($, e, { brand: "dnd", lang: "de" });
    const { Box, Input } = $.ui.resolve(e);
    const tab = await readTab($);
    const rules = await readRules($);
    const live = await readLive($);
    const now = await $.clock.now();
    const view = await readTable($);
    const look = await readLook($);
    const ini = await readInitiative($);
    const evening = await readEvening($);
    const review = await readReview($);
    const campaign = await readCampaign($);
    const runs = await readRuns($);
    const building = runs.some((r) => r.state === "running");
    const body =
      tab === "table"
        ? [
            ...renderTable($, k, Input as never, {
              view,
              ini,
              live,
              rules,
              now,
              evening,
            }),
            renderLookPicker($, k, {
              sceneTitle: view?.scene?.title ?? "",
              applied: look.applied,
              enabled: rules.looks,
            }),
          ]
        : tab === "build"
          ? await renderBuild($, k, {
              runs,
              campaign,
              live,
              rules,
              check: await readCheck($),
            })
          : tab === "review"
            ? renderReview($, k, Input as never, review)
            : renderHealth($, k, options, {
                health: await readHealth($),
                rules,
                clash: await readClash($),
                view,
                evening,
                pluginVersion: await pluginVersion($),
              });
    const tableLive = isLive(view, ini);
    const waiting = openCount(review);
    return PaneBody(k, {
      header: DndHeader(k, {
        title: campaign?.name || view?.scene?.title || "Studio",
        pill: tableLive
          ? { text: "am Tisch", tone: "ok", icon: "dice" }
          : building
            ? { text: "Bau", tone: "info", glyph: "◷" }
            : undefined,
        actions: [
          {
            key: "refresh",
            icon: "refresh",
            label: "Aktualisieren",
            onPress: () => void refreshTab($, tab, options),
          },
        ],
      }),
      children: [
        Tabs(k, {
          tabs: TABS.map((t) => ({
            ...t,
            count: t.id === "review" && waiting ? waiting : undefined,
          })),
          active: tab,
          maxVisible: 4,
          moreLabel: "Mehr",
          onSelect: (id) => void selectTab($, id, options),
        }),
        ...body.filter(Boolean),
      ],
    });
  });
};
