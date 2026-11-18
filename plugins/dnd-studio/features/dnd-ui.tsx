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
import { svgDocument } from "../lib/icons";
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
    /** Graphical: no card of its own (for a group of switches inside one card). */
    bare?: boolean;
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
  const Svg = k.Svg;
  const parts = [
    <Box
      key={`${s.key}-row`}
      flexDirection="row"
      alignItems="center"
      gap={1}
      minWidth={0}
    >
      {/* The state at a glance: a small toggle beside the button (the engine drops a Svg inside a Button). */}
      {Svg ? (
        <Svg
          source={toggleSvg(k, s.on)}
          alt={s.on ? "an" : "aus"}
          width={TOGGLE.w}
          height={TOGGLE.h}
        />
      ) : null}
      {/* Desktop paints `label`, not the children: both carry the same text (kit v3.1). Always secondary: a
          bright primary pill per switch made the settings the loudest thing in the panel. */}
      <Button
        key={s.key}
        label={switchText(s.title, s.on)}
        variant="secondary"
        onPress={s.onPress}
      >
        {switchText(s.title, s.on)}
      </Button>
    </Box>,
    s.text ? Sentence(k, s.text, { faint: true }) : null,
  ];
  if (s.bare)
    return (
      <Box key={`${s.key}-sw`} flexDirection="column" gap={0} minWidth={0}>
        {parts}
      </Box>
    );
  return Card(k, { key: `${s.key}-card`, children: parts });
}

/** Toggle geometry (CSS px). */
export const TOGGLE = { w: 28, h: 16 } as const;

/**
 * The switch's toggle: a rounded track with a knob. On: track in the accent, knob right in the accent's ink; off: an
 * outlined, dimmed track with the knob left. Colors are theme keys (`schemeSvg` gives them light and dark).
 */
export function toggleSvg(k: Kit, on: boolean): string {
  const { w, h } = TOGGLE;
  const r = h / 2;
  const knob = r - 3;
  const track = on
    ? `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="${k.t.accent}"/>`
    : `<rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" rx="${r - 0.75}" fill="none" stroke="${k.t.faint}" stroke-width="1.5"/>`;
  const dot = `<circle cx="${on ? w - r : r}" cy="${r}" r="${knob}" fill="${on ? k.t.onAccent : k.t.faint}"/>`;
  // svgDocument adds xmlns and size and runs schemeSvg (the D&D brand) over it
  return svgDocument(`<svg viewBox="0 0 ${w} ${h}">${track}${dot}</svg>`);
}

/** The switch button's text, e.g. "◉ Zuhörer · an". */
export function switchText(title: string, on: boolean): string {
  return `${on ? SWITCH_ON : SWITCH_OFF} ${sanitize(title)} · ${on ? "an" : "aus"}`;
}

/** The switch's marks on the button (system-font characters, no emoji form). */
export const SWITCH_ON = "\u25C9";
export const SWITCH_OFF = "\u25CB";

/**
 * A foldable section as a card: icon + title + count/pill and a chevron knob (key `sec-<key>`) on top, its buttons
 * under the title, the rows when open. Terminal: the kit's v1 section (same toggle key).
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
  // One knob for every fold: a chevron button in the title row (▸ closed, ▾ open), closed unless the caller says so.
  // The fold's own buttons sit right under the title, so they stay where the section starts (Pause up top).
  const { Box, Button } = k;
  const open = k.isOpen(f.key, f.defaultOpen ?? false);
  const chevron = open ? "\u25BE" : "\u25B8";
  return Card(k, {
    key: f.key,
    tone: f.tone,
    children: [
      <Box key={`${f.key}-head`} flexDirection="row" alignItems="center" gap={1}>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          {CardTitle(k, {
            icon: f.icon,
            title: f.title,
            count: f.pill ? undefined : f.count,
            pill: f.pill,
          })}
        </Box>
        <Button
          key={`sec-${f.key}`}
          label={chevron}
          variant="secondary"
          onPress={() => k.toggle(f.key)}
        >
          {chevron}
        </Button>
      </Box>,
      f.actions?.length ? Actions(k, `${f.key}-acts`, f.actions, 4) : null,
      ...(open ? f.children : []),
    ].filter((x): x is RenderElement => !!x),
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
