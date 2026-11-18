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
import { themeTokens } from "../lib/theme";
import {
  Card,
  Icon,
  IconButton,
  PaneHeader,
  Pill,
  sanitize,
  Sentence,
  truncate,
  wrapText,
} from "../lib/ui";
import type { IconAction, IconName, Kit, PillProps } from "../lib/ui";
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
      {k.narrow ? null : (
        <Text size="caption" weight="bold" color={k.t.faint}>
          D&D
        </Text>
      )}
      <Box flexShrink={1}>
        <Text
          size="heading"
          weight="bold"
          color={k.t.accentTintText}
          wrap="truncate-end"
        >
          {sanitize(hd.title || "Studio")}
        </Text>
      </Box>
      {hd.pill ? Pill(k, hd.pill) : null}
      <Box flexGrow={1} />
      {(hd.actions ?? []).map((a) => IconButton(k, a))}
    </Box>
  );
}

function trackSvg(k: Kit, on: boolean): string {
  const track = on ? k.t.accent : k.t.line;
  const knob = on ? k.t.onAccent : k.t.muted;
  const cx = on ? 24 : 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 20" width="34" height="20"><rect x="1" y="1" width="32" height="18" rx="9" fill="${track}"/><circle cx="${cx}" cy="10" r="7" fill="${knob}"/></svg>`;
}

/**
 * An on/off switch in its own card: icon, title (the pressable part), the drawn track right, one sentence below.
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
  const Svg = k.Svg;
  if (!k.graphical || !Svg)
    return (
      <Box key={`${s.key}-sw`} flexDirection="column">
        <Button key={s.key} label={s.title} plain onPress={s.onPress}>
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
      <Box flexDirection="row" alignItems="center" gap={1}>
        {s.icon ? Icon(k, s.icon, { color: k.t.faint }) : null}
        <Box flexGrow={1} flexShrink={1}>
          <Button
            key={s.key}
            label={`${s.title}: ${s.on ? "an" : "aus"}`}
            plain
            onPress={s.onPress}
          >
            <Text weight="bold" color={k.t.text}>
              {sanitize(s.title)}
            </Text>
          </Button>
        </Box>
        <Svg
          source={trackSvg(k, s.on)}
          alt={s.on ? "an" : "aus"}
          width={34}
          height={20}
        />
      </Box>,
      s.text ? Sentence(k, s.text, { faint: true }) : null,
    ],
  });
}

/** Opens (or focuses) the pane on the D&D felt. */
export async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({
    id: PANE,
    title: PANE_TITLE,
    backgroundColor: themeTokens("dnd", "dark").bg,
  } as never);
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
