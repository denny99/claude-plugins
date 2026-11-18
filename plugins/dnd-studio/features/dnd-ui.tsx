/**
 * D&D pieces on top of the shared kit (lib/ui.tsx stays a verbatim copy): the pane header with the Houndsridge logo
 * and the campaign title in brass, a real on/off switch, and opening the pane (by hand or automatically once a table
 * starts or the campaign build begins).
 */
import type { EngineInterface, RenderElement } from "claude-code";

import {
  HOUNDSRIDGE_ALT,
  HOUNDSRIDGE_SVG,
  LOGO_HEIGHT,
  LOGO_WIDTH,
} from "../lib/brand";
import { setTab } from "../lib/state";
import {
  Actions,
  Card,
  CardTitle,
  IconButton,
  PaneHeader,
  Pill,
  sanitize,
  Section,
  Sentence,
  truncate,
  wrapText,
} from "../lib/ui";
import type { Action, IconAction, IconName, Kit, PillProps } from "../lib/ui";
import type { Tone } from "../lib/theme";
import type { Tab } from "../types";

export const PANE = "dnd";
export const PANE_TITLE = "D&D";

/** Header: logo, "D&D", the campaign (heading, brass), one status pill, knobs right. Terminal: the kit's header. */
export function DndHeader(
  k: Kit,
  hd: { title: string; pill?: PillProps; actions?: IconAction[] },
): RenderElement {
  const { Box, Text } = k;
  const Svg = k.Svg;
  if (!k.graphical || !Svg)
    return PaneHeader(k, {
      label: "D&D",
      title: hd.title || "Studio",
      pill: hd.pill,
      actions: hd.actions,
    });
  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      <Svg
        source={HOUNDSRIDGE_SVG}
        alt={HOUNDSRIDGE_ALT}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
      />
      {k.narrow || /^D&D\b/.test(hd.title ?? "") ? null : (
        <Text size="caption" weight="bold" color={k.t.faint}>
          D&D
        </Text>
      )}
      <Box flexShrink={1} minWidth={0}>
        <Text
          size="heading"
          weight="bold"
          color={k.t.accentTintText}
          wrap="truncate-end"
        >
          {sanitize(hd.title || "Studio")}
        </Text>
      </Box>
      {hd.pill ? Pill(k, { ...hd.pill, shrink: true }) : null}
      <Box flexGrow={1} />
      {(hd.actions ?? []).map((a) => IconButton(k, a))}
    </Box>
  );
}

/**
 * An on/off switch in its own card: one native button, pressable as a whole ("● Zuhörer · an"), one sentence below.
 * Terminal: `[x] Title` as a plain button.
 */
export function Switch(
  k: Kit,
  s: {
    key: string;
    title: string;
    text?: string;
    on: boolean;
    icon?: IconName;
    onPress: () => void;
  },
): RenderElement {
  const { Box, Text, Button } = k;
  if (!k.graphical)
    return (
      <Box key={`${s.key}-sw`} flexDirection="column">
        <Button
          key={s.key}
          label={truncate(`${s.on ? "[x]" : "[ ]"} ${s.title}`, k.cols)}
          plain
          onPress={s.onPress}
        >
          <Text color={s.on ? "green" : undefined}>
            {truncate(`${s.on ? "[x]" : "[ ]"} ${s.title}`, k.cols)}
          </Text>
        </Button>
        {s.text && !k.compact ? (
          <Text dimColor>{wrapText(s.text, k.cols).join("\n")}</Text>
        ) : null}
      </Box>
    );
  return Card(k, {
    key: `${s.key}-card`,
    children: [
      // Desktop paints `label`, not the children: both carry the same text (kit v3.1).
      <Button
        key={s.key}
        label={switchText(s.title, s.on)}
        variant={s.on ? "primary" : "secondary"}
        onPress={s.onPress}
      >
        {switchText(s.title, s.on)}
      </Button>,
      s.text ? Sentence(k, s.text, { faint: true }) : null,
    ],
  });
}

/** The switch button's text, e.g. "◉ Zuhörer · an". */
export function switchText(title: string, on: boolean): string {
  return `${on ? SWITCH_ON : SWITCH_OFF} ${sanitize(title)} · ${on ? "an" : "aus"}`;
}

/** The switch's marks on the button (system-font characters, no emoji form). */
export const SWITCH_ON = "\u25C9";
export const SWITCH_OFF = "\u25CB";

/**
 * A foldable section as a card: icon + title + count/pill on top, the rows when open, then its buttons with a
 * "Einklappen"/"Aufklappen" link (key `sec-<key>`). Terminal: the kit's v1 section (same toggle key).
 */
export function Fold(
  k: Kit,
  f: {
    key: string;
    icon: IconName;
    title: string;
    count?: number | string;
    pill?: PillProps;
    tone?: Tone;
    defaultOpen?: boolean;
    actions?: Action[];
    children: (RenderElement | null)[];
  },
): RenderElement {
  if (!k.graphical)
    return Section(k, {
      key: f.key,
      title: f.title,
      count: f.pill ? f.pill.text : f.count,
      collapsible: true,
      defaultOpen: f.defaultOpen,
      actions: f.actions,
      children: f.children,
    });
  const open = k.isOpen(f.key, f.defaultOpen ?? true);
  const acts: Action[] = [
    ...(f.actions ?? []),
    {
      key: `sec-${f.key}`,
      label: open ? "Einklappen" : "Aufklappen",
      variant: "link",
      onPress: () => k.toggle(f.key),
    },
  ];
  return Card(k, {
    key: f.key,
    tone: f.tone,
    children: [
      CardTitle(k, {
        icon: f.icon,
        title: f.title,
        count: f.pill ? undefined : f.count,
        pill: f.pill,
      }),
      ...(open ? f.children : []),
      Actions(k, `${f.key}-acts`, acts, 4),
    ],
  });
}

/** Opens (or focuses) the pane on the D&D felt. */
export async function openPane($: EngineInterface): Promise<void> {
  // No backgroundColor: the app draws the pane's frame and surface (kit v3).
  await $.ui.open({ id: PANE, title: PANE_TITLE });
}

// --- auto-open: never at session start; once when a table goes live and once when the build begins ---------------

let autoOpenOn = true;
const opened = { table: false, build: false };

/** userConfig `autoOpen` (default true). */
export function configureAutoOpen(value: unknown): void {
  autoOpenOn = value !== false && value !== "false";
}

/** A table that ended may open the pane again when the next one starts. */
export function noteTableEnded(): void {
  opened.table = false;
}

/** Opens the pane on its tab the first time a table runs or a build starts in this session (userConfig autoOpen). */
export async function autoOpen(
  $: EngineInterface,
  why: "table" | "build",
  tab: Tab = why,
): Promise<void> {
  if (!autoOpenOn || opened[why]) return;
  opened[why] = true;
  try {
    await setTab($, tab);
    await openPane($);
  } catch (err) {
    $.ui.log(`dnd-studio: auto-open failed: ${String(err)}`);
  }
}

/** Test hook: forget what was opened. */
export function resetAutoOpen(): void {
  opened.table = false;
  opened.build = false;
  autoOpenOn = true;
}
