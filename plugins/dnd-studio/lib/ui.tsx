/**
 * Shared UI kit v2 (UX.md, mockup boards): one visual language for every pane and hub tab, in three brands. Copy this
 * file with `theme.ts` and `icons.ts` into sibling plugins (see the copy notes in KIT-V2.md): change the atom's plugin
 * name below, nothing else.
 *
 * Never name a variable `h` or `Fragment` in a .tsx file: the JSX factory is `h`.
 *
 * Components are plain functions taking the kit `k` first (not JSX components): `Card(k, {...})`. Build `k` once per
 * render with `const k = await kit($, e, { brand: 'deltastone' })`; it carries the surface's element constructors, the
 * body size, the brand tokens for light or dark and the kit's own small state (two-step confirms, collapsed sections,
 * overflow menus, error details, log expansion), so a render hook never threads `$` into the components (the validator
 * only lets `$` cross into function declarations).
 *
 * Graphical surfaces (desktop, vscode, mobile) paint cards, pills and icons (`Svg`) with the brand's hex tokens; the
 * terminal paints with theme keys only, draws no backgrounds and puts text glyphs where icons would be.
 *
 * Glyphs: ✓ green ok · ✗ red failed · ● yellow running/pending · ○ dim idle · ↑ yellow update available ·
 * ⚠ yellow warning (lint/tsc warnings only).
 *
 * v1 calls keep their exact output: the v2 look (icons, button variants, overflow tabs, collapsed logs, card states)
 * switches on only through the new fields (`icon`, `variant`, `maxVisible`, `collapsed`, object forms of the states).
 */
import { atom, read, update } from "claude-code";
import type { RenderInput, EngineInterface, RenderElement } from "claude-code";

import type { AskedState, UiKitState } from "../types";
import {
  glyphLabel,
  ICON_GLYPHS,
  ICONS,
  iconSvg,
  svgDocument,
  TERM_GLYPHS,
  type IconName,
} from "./icons";
import {
  boxPaint,
  modeFromTheme,
  terminalColor,
  themeTokens,
  windowTokens,
  type Brand,
  type Mode,
  type Tokens,
  type Tone,
} from "./theme";

export {
  glyphLabel,
  ICON_GLYPHS,
  ICONS,
  iconSvg,
  isIconName,
  svgDocument,
  TERM_GLYPHS,
  type IconName,
} from "./icons";
export {
  modeFromTheme,
  terminalColor,
  THEMES,
  themeTokens,
  type Brand,
  type Mode,
  type Tokens,
  type Tone,
  type ToneColors,
} from "./theme";

const EMPTY_UI: UiKitState = {
  toggled: [],
  more: [],
  details: [],
  logMore: [],
};
// On copy into another plugin: change the plugin name (it must stay a string literal).
const uiAtom = atom({ plugin: "dnd-studio", key: "ui" } as const, EMPTY_UI, {
  shape: "ui-1",
});

// --- text helpers ---

/** Strips ANSI escapes and control characters (a Pane refuses a Text holding one); tabs become spaces. */
export function sanitize(text: unknown): string {
  return (
    String(text ?? "")
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[@-_]?/g, "")
      .replace(/\t/g, "  ")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, "")
  );
}

/** Sanitizes, keeps the first line and cuts to `width` columns with a trailing `…`. */
export function truncate(text: unknown, width: number): string {
  const line = sanitize(text).split("\n")[0] ?? "";
  const w = Math.max(1, Math.floor(width));
  const chars = [...line];
  return chars.length <= w ? line : `${chars.slice(0, w - 1).join("")}…`;
}

/** Sanitizes and word-wraps prose to `width` columns (long words are cut); for wiki pages and messages. */
export function wrapText(text: unknown, width: number): string[] {
  const w = Math.max(4, Math.floor(width));
  const out: string[] = [];
  for (const raw of sanitize(text).split("\n")) {
    const lead = /^\s*/.exec(raw)?.[0] ?? "";
    let line = "";
    for (const word of raw.trim().split(/\s+/).filter(Boolean)) {
      let rest = word;
      while ([...rest].length > w - lead.length) {
        if (line) out.push(lead + line);
        line = "";
        const cut = w - lead.length - 1;
        out.push(`${lead}${[...rest].slice(0, cut).join("")}…`);
        rest = [...rest].slice(cut).join("");
      }
      const next = line ? `${line} ${rest}` : rest;
      if ([...(lead + next)].length > w) {
        out.push(lead + line);
        line = rest;
      } else line = next;
    }
    out.push(line ? lead + line : "");
  }
  return out;
}

// --- glyphs ---

export type Status =
  "ok" | "failed" | "running" | "pending" | "idle" | "update" | "warning";
export type Color = "green" | "red" | "yellow" | undefined;

const GLYPH: Record<Status, { char: string; color: Color; dim?: boolean }> = {
  ok: { char: "✓", color: "green" },
  failed: { char: "✗", color: "red" },
  running: { char: "●", color: "yellow" },
  pending: { char: "●", color: "yellow" },
  idle: { char: "○", color: undefined, dim: true },
  update: { char: "↑", color: "yellow" },
  warning: { char: "⚠", color: "yellow" },
};

/** The glyph character and color of a status. */
export function glyphOf(status: Status): {
  char: string;
  color: Color;
  dim?: boolean;
} {
  return GLYPH[status];
}

// --- kit ---

type El = (props: Record<string, unknown>) => RenderElement;

type Els = {
  Box: El;
  Text: El;
  Button: El;
  /** Absent on the terminal. */
  Svg?: El;
  Progress?: El;
};

/** Kit texts; `lang` picks the set. English is the v1 wording. */
export type KitStrings = {
  cancel: string;
  really: (label: string) => string;
  details: string;
  hideDetails: string;
  retry: string;
  more: string;
  log: string;
  hideLog: string;
  copy: string;
  loading: string;
  showMore: (hidden: number) => string;
  showLess: string;
  wrong: string;
};

export const KIT_STRINGS: Record<"en" | "de", KitStrings> = {
  en: {
    cancel: "Cancel",
    really: (label) => `Really ${label.toLowerCase()}?`,
    details: "Details",
    hideDetails: "Hide details",
    retry: "Retry",
    more: "More",
    log: "Log",
    hideLog: "Hide log",
    copy: "Copy",
    loading: "Loading…",
    showMore: (n) => `Show more (${n} earlier)`,
    showLess: "Show less",
    wrong: "Something went wrong.",
  },
  de: {
    cancel: "Abbrechen",
    really: (label) => `Wirklich ${label.toLowerCase()}?`,
    details: "Details",
    hideDetails: "Details ausblenden",
    retry: "Erneut versuchen",
    more: "Mehr",
    log: "Log",
    hideLog: "Log ausblenden",
    copy: "Kopieren",
    loading: "Lädt …",
    showMore: (n) => `Mehr zeigen (${n} frühere)`,
    showLess: "Weniger",
    wrong: "Etwas ist schiefgegangen.",
  },
};

/** Options of `kit()`. */
export type KitOptions = {
  /** Brand tokens to paint with (default `neutral`). */
  brand?: Brand;
  /** `auto` (default) reads the engine's `theme` setting; unknown there → dark. */
  mode?: Mode | "auto";
  /** Kit texts (default `en`). */
  lang?: "en" | "de";
};

export type Kit = Els & {
  Box: El;
  Text: El;
  Button: El;
  /** Columns of the pane body (`e.props.bodyColumns`, else the viewport's). */
  cols: number;
  /** Rows of the pane body (`e.props.scroll.bodyRows`, else the viewport's). */
  rows: number;
  /** Narrow or mobile: one column, secondary text hidden. */
  compact: boolean;
  /** Very narrow (under 48 columns, the 320 px board): buttons stack, tabs lose icons, header loses its label. */
  narrow: boolean;
  surface: string;
  /** The surface draws `Svg` (desktop, vscode, mobile): cards, pills and icons are painted. */
  graphical: boolean;
  brand: Brand;
  mode: Mode;
  /** Brand tokens for the mode. */
  t: Tokens;
  /** Kit texts. */
  s: KitStrings;
  state: UiKitState;
  /** Prompts sent to Claude whose answer has not ended yet (section „ask Claude“); read here so a render redraws. */
  asked: AskedState;
  isOpen: (key: string, defaultOpen?: boolean) => boolean;
  toggle: (key: string) => void;
  isMore: (key: string) => boolean;
  toggleMore: (key: string) => void;
  isConfirming: (key: string) => boolean;
  askConfirm: (key: string) => void;
  clearConfirm: () => void;
  hasDetails: (key: string) => boolean;
  toggleDetails: (key: string) => void;
  isLogMore: (key: string) => boolean;
  toggleLogMore: (key: string) => void;
  /** Copies text to the clipboard of the surface a press came from. */
  copy: (text: string, surface?: string) => void;
};

function flip(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** Patches the kit state (exported for tests and for actions that reset a confirm). */
export async function patchUi(
  $: EngineInterface,
  patch: Partial<UiKitState> | ((s: UiKitState) => Partial<UiKitState>),
): Promise<void> {
  await update($, uiAtom, (s) => ({
    ...s,
    ...(typeof patch === "function" ? patch(s) : patch),
  }));
}

/** Light or dark from the engine's `theme` setting; dark when it cannot tell. */
export async function detectMode($: EngineInterface): Promise<Mode> {
  try {
    const rows = await $.config.list();
    return (
      modeFromTheme(rows.find((row) => row.key === "theme")?.value) ?? "dark"
    );
  } catch {
    return "dark";
  }
}

/** Copies through the engine; a refused copy is ignored. */
async function copyText(
  $: EngineInterface,
  text: string,
  surface?: string,
): Promise<void> {
  try {
    await $.ui.copy({ text, ...(surface ? { surface } : {}) } as never);
  } catch {
    // nothing to copy to on this surface
  }
}

/** Builds the kit for one render: elements, body size, brand tokens and kit state (subscribes the drawing to it). */
export async function kit(
  $: EngineInterface,
  e: RenderInput<"Pane"> | RenderInput<"AbovePrompt">,
  opts: KitOptions = {},
): Promise<Kit> {
  const els = $.ui.resolve(e) as unknown as Els;
  const state = await read($, uiAtom);
  const props =
    (e as { props?: { bodyColumns?: number; scroll?: { bodyRows?: number } } })
      .props ?? {};
  const viewport = (e as { viewport?: { columns?: number; rows?: number } })
    .viewport;
  const cols = Math.max(20, props.bodyColumns ?? viewport?.columns ?? 80);
  const rows = Math.max(8, props.scroll?.bodyRows ?? viewport?.rows ?? 30);
  const surface = String((e as { surface?: string }).surface ?? "terminal");
  const graphical = surface !== "terminal" && typeof els.Svg === "function";
  const brand = opts.brand ?? "neutral";
  const mode: Mode =
    opts.mode === "dark" || opts.mode === "light"
      ? opts.mode
      : graphical
        ? await detectMode($)
        : "dark";
  return {
    Box: els.Box,
    Text: els.Text,
    Button: els.Button,
    Svg: els.Svg,
    Progress: els.Progress,
    cols,
    rows,
    compact: surface === "mobile" || cols < 60,
    narrow: cols < 48,
    surface,
    graphical,
    brand,
    mode,
    t:
      graphical && opts.mode !== "dark" && opts.mode !== "light"
        ? windowTokens(brand)
        : themeTokens(brand, mode),
    s: KIT_STRINGS[opts.lang ?? "en"],
    state,
    asked: await read($, askedAtom),
    isOpen: (key, defaultOpen = true) =>
      state.toggled.includes(key) ? !defaultOpen : defaultOpen,
    toggle: (key) =>
      void patchUi($, (s) => ({ toggled: flip(s.toggled, key) })),
    isMore: (key) => state.more.includes(key),
    toggleMore: (key) => void patchUi($, (s) => ({ more: flip(s.more, key) })),
    isConfirming: (key) => state.confirm === key,
    askConfirm: (key) => void patchUi($, { confirm: key }),
    clearConfirm: () => void patchUi($, { confirm: undefined }),
    hasDetails: (key) => state.details.includes(key),
    toggleDetails: (key) =>
      void patchUi($, (s) => ({ details: flip(s.details, key) })),
    isLogMore: (key) => state.logMore.includes(key),
    toggleLogMore: (key) =>
      void patchUi($, (s) => ({ logMore: flip(s.logMore, key) })),
    copy: (text, at) => void copyText($, text, at),
  };
}

// --- painting helpers ---

type Kid = RenderElement | null | false | undefined;
type Kids = Kid[] | RenderElement | null;

function kids(children: Kids | undefined): RenderElement[] {
  return (Array.isArray(children) ? children : [children]).filter(
    Boolean,
  ) as RenderElement[];
}

/** A tone's text color on this surface: brand hex when painted, a theme key on the terminal. */
export function toneColor(k: Kit, tone: Tone): string | undefined {
  return k.graphical ? k.t.tones[tone].fg : terminalColor(k.brand, tone);
}

/** Text color of a role: hex when painted, the surface's own on the terminal. */
function ink(k: Kit, role: "text" | "muted" | "faint"): string | undefined {
  return k.graphical ? k.t[role] : undefined;
}

/** The tone a status reads as. */
export function toneOf(status: Status): Tone {
  if (status === "ok") return "ok";
  if (status === "failed") return "bad";
  if (status === "idle") return "neutral";
  return "warn";
}

const STATUS_ICON: Record<Status, IconName> = {
  ok: "checkCircle",
  failed: "xCircle",
  running: "clock",
  pending: "clock",
  idle: "circle",
  update: "up",
  warning: "alert",
};

/** The icon a status reads as (error rows: cross in a circle). */
export function statusIcon(status: Status): IconName {
  return STATUS_ICON[status];
}

// --- v2 components ---

/**
 * A stroke icon: an `Svg` on graphical surfaces (color: `color`, else the tone's, else faint), a glyph `Text` on the
 * terminal for the icons that have one (TERM_GLYPHS), else nothing.
 */
export function Icon(
  k: Kit,
  name: IconName,
  opts: { size?: number; color?: string; tone?: Tone; alt?: string } = {},
): RenderElement | null {
  const { Text } = k;
  const Svg = k.Svg;
  if (k.graphical && Svg) {
    const size = opts.size ?? 16;
    const color =
      opts.color ?? (opts.tone ? k.t.tones[opts.tone].fg : k.t.faint);
    return (
      <Svg
        source={iconSvg(name, color, size)}
        alt={opts.alt ?? name}
        width={size}
        height={size}
      />
    );
  }
  const glyph = TERM_GLYPHS[name];
  if (!glyph) return null;
  return (
    <Text
      color={opts.tone ? terminalColor(k.brand, opts.tone) : undefined}
      dimColor={opts.tone ? undefined : true}
    >
      {glyph}
    </Text>
  );
}

/**
 * Default mark of a pill per tone: ✓ ok, ◷ warn (yellow means "running" here), ✕ bad, ● info. The mark follows the
 * meaning, not the color: a real warning passes `icon: 'alert'` (or `glyph: '⚠'`), an update `glyph: '↑'`.
 */
const TONE_GLYPH: Record<Tone, string> = {
  ok: "✓",
  warn: "◷",
  bad: "✕",
  info: "●",
  neutral: "",
  accent: "",
};
/** Default icon of a pill per tone on graphical surfaces (in place of the glyph), unless `glyph` or `icon` is given. */
const TONE_ICON: Partial<Record<Tone, IconName>> = { warn: "clock" };

export type PillProps = {
  text: string;
  tone?: Tone;
  /** The mark before the text; `false` for none. Default per tone (TONE_GLYPH). */
  glyph?: string | false;
  /** An icon in place of the glyph on graphical surfaces. Default per tone (TONE_ICON: warn → clock). */
  icon?: IconName;
};

/** Escapes text for SVG markup. */
function xmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pill geometry (CSS px): height, font size, side padding, icon size, estimated advance per character. */
const PILL = { h: 20, font: 12, pad: 8, icon: 12, gap: 4, radius: 4 } as const;

/** Estimated advance of one character at 12 px semibold system font (narrow, digits, capitals, rest). */
function charWidth(c: string): number {
  if (/[ilIj.,:;'!|·\s]/.test(c)) return 3.4;
  if (/[ft()\[\]r]/.test(c)) return 4.4;
  if (/[0-9]/.test(c)) return 6.9;
  if (/[mwMW]/.test(c)) return 9.6;
  if (/[A-ZÄÖÜ]/.test(c)) return 7.8;
  return 7.1;
}

/**
 * The `<svg>` document of a graphical pill: a slightly rounded tinted rect (`rx` = PILL.radius), an optional icon at
 * the left and the text in the system font, both in the tone color. Width estimated from the text length.
 */
export function pillSvg(
  text: string,
  fg: string,
  bg: string,
  icon?: IconName,
): { source: string; width: number } {
  const iconW = icon ? PILL.icon + PILL.gap : 0;
  const textW = [...text].reduce((w, c) => w + charWidth(c), 0);
  const width = Math.ceil(PILL.pad * 2 + iconW + textW);
  const scale = PILL.icon / 24;
  const top = (PILL.h - PILL.icon) / 2;
  const mark = icon
    ? `<g transform="translate(${PILL.pad} ${top}) scale(${scale})" fill="none" stroke="${fg}" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round">${(ICONS[icon] ?? "").replace(/currentColor/g, fg)}</g>`
    : "";
  const source = svgDocument(
    `<svg viewBox="0 0 ${width} ${PILL.h}"><rect width="${width}" height="${PILL.h}" rx="${PILL.radius}" ` +
      `fill="${bg}"></rect>${mark}<text x="${PILL.pad + iconW + textW / 2}" y="${PILL.h / 2 + PILL.font * 0.35}" ` +
      `text-anchor="middle" font-family="-apple-system, Segoe UI, sans-serif" font-size="${PILL.font}" font-weight="600" ` +
      `fill="${fg}">${xmlText(text)}</text></svg>`,
  );
  return { source, width };
}

/**
 * A state pill: tinted chip with a mark (✓ ◷ ↑ ⚠ ✕) and a short sentence ("3 rot · 2 neu"). Graphical: one
 * non-pressable `Svg` (a rounded rect, `rx` = half height; a Box has no corner radius without a border, and a bordered
 * Box grows to three rows on a desktop), `alt` = the text; `shrink` cuts the text beforehand (an image does not
 * shrink). Terminal: a colored Text.
 */
export function Pill(
  k: Kit,
  p: PillProps & { shrink?: boolean },
): RenderElement {
  const { Box, Text } = k;
  const tone = p.tone ?? "neutral";
  const glyph = p.glyph === false ? "" : (p.glyph ?? TONE_GLYPH[tone]);
  const Svg = k.Svg;
  if (!k.graphical || !Svg) {
    return (
      <Text
        color={terminalColor(k.brand, tone)}
        dimColor={tone === "neutral" ? true : undefined}
      >
        {truncate(
          glyph ? `${glyph} ${p.text}` : p.text,
          Math.max(4, Math.floor(k.cols / 2)),
        )}
      </Text>
    );
  }
  const c = k.t.tones[tone];
  const iconName =
    p.icon ?? (p.glyph === undefined ? TONE_ICON[tone] : undefined);
  const raw =
    sanitize(!iconName && glyph ? `${glyph} ${p.text}` : p.text).split(
      "\n",
    )[0] ?? "";
  const text = p.shrink
    ? truncate(raw, Math.max(6, Math.floor(k.cols / 3)))
    : raw;
  const pic = pillSvg(text, c.fg, c.bg, iconName);
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      flexShrink={p.shrink ? 1 : 0}
      minWidth={p.shrink ? 0 : undefined}
    >
      <Svg source={pic.source} alt={text} width={pic.width} height={PILL.h} />
    </Box>
  );
}

/** A card: framed, filled, rounded box (tone tints it, e.g. `bad` for a problem). The terminal draws no frame. */
export function Card(
  k: Kit,
  c: { key?: string; tone?: Tone; gap?: number; children: Kids },
): RenderElement {
  const { Box } = k;
  if (!k.graphical)
    return (
      <Box key={c.key} flexDirection="column">
        {kids(c.children)}
      </Box>
    );
  const fill = c.tone ? k.t.tones[c.tone].bg : k.t.card;
  const border = c.tone ? k.t.tones[c.tone].border : k.t.border;
  return (
    <Box
      key={c.key}
      flexDirection="column"
      gap={c.gap ?? 1}
      padding={1}
      minWidth={0}
      flexShrink={1}
      backgroundColor={boxPaint(fill)}
      borderStyle="round"
      borderColor={border}
    >
      {kids(c.children)}
    </Box>
  );
}

/** Card title row: icon left, title, then a count (dim) or a pill on the right. */
export function CardTitle(
  k: Kit,
  c: {
    icon?: IconName;
    title: string;
    count?: number | string;
    pill?: PillProps;
    tone?: Tone;
  },
): RenderElement {
  const { Box, Text } = k;
  const count = c.count === undefined || c.count === "" ? "" : String(c.count);
  if (!k.graphical) {
    const room = Math.max(
      4,
      k.cols -
        (count ? [...count].length + 1 : 0) -
        (c.pill ? [...c.pill.text].length + 4 : 0),
    );
    return (
      <Box flexDirection="row" gap={1}>
        <Text bold color={c.tone ? terminalColor(k.brand, c.tone) : undefined}>
          {truncate(c.title, room)}
        </Text>
        {count ? <Text dimColor>{count}</Text> : null}
        {c.pill ? Pill(k, c.pill) : null}
      </Box>
    );
  }
  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      {c.icon
        ? Icon(k, c.icon, {
            tone: c.tone,
            color: c.tone ? undefined : k.t.faint,
          })
        : null}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text
          weight="bold"
          color={c.tone ? k.t.tones[c.tone].fg : k.t.text}
          wrap="truncate-end"
        >
          {sanitize(c.title)}
        </Text>
      </Box>
      {count ? (
        <Text size="caption" color={k.t.faint}>
          {sanitize(count)}
        </Text>
      ) : null}
      {c.pill ? (
        <Box paddingRight={1} flexShrink={0} alignSelf="center">
          {Pill(k, c.pill)}
        </Box>
      ) : null}
    </Box>
  );
}

/** A sentence in a card ("409 von 412 grün · Lauf vor 4 min"): wrapped, muted. */
export function Sentence(
  k: Kit,
  text: string,
  opts: { tone?: Tone; faint?: boolean; wrap?: "wrap" | "truncate-end" } = {},
): RenderElement {
  const { Text } = k;
  if (!k.graphical)
    return (
      <Text
        color={opts.tone ? terminalColor(k.brand, opts.tone) : undefined}
        dimColor={opts.faint ? true : undefined}
      >
        {wrapText(text, k.cols).join("\n")}
      </Text>
    );
  // The Box keeps a long sentence inside the card: without minWidth 0 a flex child may grow past the pane.
  const { Box } = k;
  return (
    <Box flexDirection="column" flexShrink={1} minWidth={0}>
      <Text
        size="footnote"
        color={
          opts.tone
            ? k.t.tones[opts.tone].fg
            : ink(k, opts.faint ? "faint" : "muted")
        }
        wrap={opts.wrap ?? "wrap"}
      >
        {sanitize(text)}
      </Text>
    </Box>
  );
}

export type IconAction = {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
};

/**
 * A header knob: a native Button, pressable as a whole. Graphical: "<glyph> <label>" (compact bodies: the glyph alone,
 * `label` stays its accessible name), `variant` secondary. Terminal: a one-glyph plain Button named by `label`.
 */
export function IconButton(k: Kit, a: IconAction): RenderElement {
  const { Button } = k;
  if (!k.graphical)
    return (
      <Button key={a.key} label={a.label} plain onPress={a.onPress}>
        {TERM_GLYPHS[a.icon] ?? a.label}
      </Button>
    );
  const glyph = ICON_GLYPHS[a.icon];
  // A desktop draws `label` in place of the children: the glyph must be in the label itself.
  const shown = k.compact && glyph ? glyph : glyphLabel(a.icon, a.label);
  return (
    <Button key={a.key} label={shown} variant="secondary" onPress={a.onPress}>
      {shown}
    </Button>
  );
}

/**
 * Pane header: logo (an SVG string or an element; graphical surfaces only), LABEL, title, one status pill, icon knobs
 * on the right. Narrow drops the label; the terminal draws `LABEL · title  pill` and the knobs as glyph buttons.
 */
export function PaneHeader(
  k: Kit,
  hd: {
    title: string;
    label?: string;
    logo?: string | RenderElement;
    logoAlt?: string;
    logoWidth?: number;
    logoHeight?: number;
    pill?: PillProps;
    actions?: IconAction[];
  },
): RenderElement {
  const { Box, Text } = k;
  const Svg = k.Svg;
  const knobs = (hd.actions ?? []).map((a) => IconButton(k, a));
  if (!k.graphical) {
    const label = hd.label && !k.narrow ? `${hd.label} · ` : "";
    const room = Math.max(
      6,
      k.cols -
        [...label].length -
        (hd.pill ? [...hd.pill.text].length + 4 : 0) -
        knobs.length * 4,
    );
    return (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Text bold>
          {label ? <Text dimColor>{label}</Text> : null}
          {truncate(hd.title, room)}
        </Text>
        {hd.pill ? Pill(k, hd.pill) : null}
        {knobs}
      </Box>
    );
  }
  const logo =
    typeof hd.logo === "string" && Svg ? (
      <Svg
        source={svgDocument(hd.logo)}
        alt={hd.logoAlt ?? hd.label ?? "logo"}
        width={hd.logoWidth ?? 18}
        height={hd.logoHeight ?? hd.logoWidth ?? 18}
      />
    ) : typeof hd.logo === "object" && hd.logo ? (
      hd.logo
    ) : null;
  return (
    <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
      {logo}
      {hd.label && !k.narrow ? (
        <Text size="caption" weight="bold" color={k.t.faint}>
          {sanitize(hd.label).toUpperCase()}
        </Text>
      ) : null}
      <Box flexShrink={1} minWidth={0}>
        <Text weight="bold" color={k.t.text} wrap="truncate-end">
          {sanitize(hd.title)}
        </Text>
      </Box>
      {hd.pill ? Pill(k, { ...hd.pill, shrink: true }) : null}
      <Box flexGrow={1} />
      {knobs}
    </Box>
  );
}

/** A hairline across the body: an Svg wider than any pane, clipped to the slot (graphical surfaces only). */
function Rule(k: Kit): RenderElement | null {
  const Svg = k.Svg;
  if (!Svg) return null;
  return (
    <Svg
      source={svgDocument(`<svg width="4000" height="1" viewBox="0 0 4000 1" preserveAspectRatio="none"><rect width="4000" height="1" fill="${k.t.line}"/></svg>`)}
      alt="divider"
      height={1}
    />
  );
}

/** A Box spacing (d.ts `Space`): cells or a step the surface sizes itself. */
export type Space = number | "xs" | "sm" | "md" | "lg" | "xl";

/**
 * The mandatory outermost box of every kit pane: spaces the sections (`gap`, `md`) and rules the header (usually
 * `PaneHeader`) off with a hairline. It paints no surface and keeps no inner margin of its own: the app draws the
 * pane's frame, fill and spacing (open the pane without `backgroundColor`). Terminal: one blank row between sections.
 */
export function PaneBody(
  k: Kit,
  b: {
    key?: string;
    header?: RenderElement | null;
    gap?: Space;
    children: Kids;
  },
): RenderElement {
  const { Box } = k;
  if (!k.graphical)
    return (
      <Box key={b.key} flexDirection="column" gap={b.gap ?? 1}>
        {b.header ?? null}
        {kids(b.children)}
      </Box>
    );
  return (
    <Box key={b.key} flexDirection="column" gap={b.gap ?? "md"}>
      {b.header ? (
        <Box flexDirection="column" gap="sm">
          {b.header}
          {Rule(k)}
        </Box>
      ) : null}
      {kids(b.children)}
    </Box>
  );
}

/** A problem first: tinted card with what is wrong, why (one sentence) and the button that fixes it. */
export function ProblemCard(
  k: Kit,
  p: {
    key: string;
    title: string;
    cause: string;
    tone?: "bad" | "warn";
    icon?: IconName;
    action?: Action;
    more?: Action[];
  },
): RenderElement {
  const tone = p.tone ?? "bad";
  const acts: Action[] = [
    ...(p.action ? [{ variant: "primary" as const, ...p.action }] : []),
    ...(p.more ?? []).map((a) => ({ variant: "link" as const, ...a })),
  ];
  return Card(k, {
    key: p.key,
    tone,
    children: [
      CardTitle(k, {
        icon: p.icon ?? "alert",
        title: k.graphical ? p.title : `✗ ${p.title}`,
        tone,
      }),
      Sentence(k, p.cause),
      acts.length ? Actions(k, `${p.key}-acts`, acts, acts.length) : null,
    ],
  });
}

export type StepState = "done" | "active" | "todo" | "failed";

export type Step = {
  key?: string;
  title: string;
  detail?: string;
  state: StepState;
  body?: RenderElement | null;
};

const STEP_TONE: Record<StepState, Tone> = {
  done: "ok",
  active: "accent",
  todo: "neutral",
  failed: "bad",
};

const STEP_MARK = 22;

/** The round step mark: a filled circle with the number (or ✓ ✗) centred in it. */
export function stepMarkSvg(mark: string, fg: string, bg: string): string {
  const r = STEP_MARK / 2;
  return svgDocument(
    `<svg viewBox="0 0 ${STEP_MARK} ${STEP_MARK}"><circle cx="${r}" cy="${r}" r="${r}" fill="${bg}"></circle>` +
      `<text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="-apple-system, Segoe UI, sans-serif" font-size="12" font-weight="700" ` +
      `fill="${fg}">${xmlText(mark)}</text></svg>`,
  );
}

/** Steps with a rail: ✓ done, ● (or the number) active, ○ todo, ✗ failed; an active step may carry a body card. */
export function Stepper(
  k: Kit,
  s: { key?: string; steps: Step[] },
): RenderElement {
  const { Box, Text } = k;
  const rows = s.steps.map((step, i) => {
    const last = i === s.steps.length - 1;
    const mark =
      step.state === "done"
        ? "✓"
        : step.state === "failed"
          ? "✗"
          : k.graphical
            ? String(i + 1)
            : step.state === "active"
              ? "●"
              : "○";
    if (!k.graphical) {
      const color =
        step.state === "todo"
          ? undefined
          : terminalColor(k.brand, STEP_TONE[step.state]);
      return (
        <Box key={step.key} flexDirection="column">
          <Text
            color={color}
            dimColor={step.state === "todo" ? true : undefined}
            bold={step.state === "active" ? true : undefined}
          >
            {truncate(`${mark} ${sanitize(step.title)}`, k.cols)}
          </Text>
          {step.detail ? (
            <Text dimColor>
              {truncate(`│ ${sanitize(step.detail)}`, k.cols)}
            </Text>
          ) : null}
          {step.body ?? null}
          {!last ? <Text dimColor>│</Text> : null}
        </Box>
      );
    }
    const tone = k.t.tones[STEP_TONE[step.state]];
    const fill = step.state === "active" ? k.t.accent : tone.bg;
    const markColor = step.state === "active" ? k.t.onAccent : tone.fg;
    return (
      <Box key={step.key} flexDirection="row" gap={1}>
        <Box flexDirection="column" alignItems="center" width={3}>
          {k.Svg ? (
            <k.Svg
              source={stepMarkSvg(mark, markColor, fill)}
              alt={mark}
              width={STEP_MARK}
              height={STEP_MARK}
            />
          ) : (
            <Text weight="bold" color={markColor}>
              {mark}
            </Text>
          )}
          {!last ? <Text color={k.t.faint}>│</Text> : null}
        </Box>
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          gap={0}
          paddingBottom={last ? 0 : 1}
        >
          <Text
            weight={step.state === "active" ? "bold" : "medium"}
            color={step.state === "todo" ? k.t.faint : k.t.text}
          >
            {sanitize(step.title)}
          </Text>
          {step.detail ? (
            <Text size="footnote" color={k.t.faint}>
              {sanitize(step.detail)}
            </Text>
          ) : null}
          {step.body ?? null}
        </Box>
      </Box>
    );
  });
  return (
    <Box key={s.key} flexDirection="column">
      {rows}
    </Box>
  );
}

/** A list row: status icon, title, meta (hidden when narrow), a pill, actions. Error rows get the cross-in-circle. */
export function ListRow(
  k: Kit,
  r: {
    key: string;
    title: string;
    status?: Status;
    icon?: IconName;
    tone?: Tone;
    meta?: string;
    pill?: PillProps;
    actions?: Action[];
    /** Graphical: the title wraps instead of being cut ("…"); narrow puts the pill on a line of its own below it. */
    wrap?: boolean;
  },
): RenderElement {
  const { Box, Text } = k;
  const tone = r.tone ?? (r.status ? toneOf(r.status) : undefined);
  const icon = r.icon ?? (r.status ? statusIcon(r.status) : undefined);
  if (!k.graphical) {
    const g = r.status ? glyphOf(r.status) : undefined;
    const mark = g?.char ?? (icon ? TERM_GLYPHS[icon] : undefined);
    const meta = r.meta && !k.compact ? `  ${sanitize(r.meta)}` : "";
    const pillLen = r.pill ? [...r.pill.text].length + 3 : 0;
    const head = truncate(
      `${mark ? `${mark} ` : ""}${sanitize(r.title)}`,
      Math.max(6, k.cols - pillLen),
    );
    const rest = Math.max(0, k.cols - [...head].length - pillLen);
    return (
      <Box key={r.key} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text
            color={tone ? terminalColor(k.brand, tone) : undefined}
            dimColor={g?.dim}
          >
            {head}
            {meta && rest > 3 ? (
              <Text dimColor>{truncate(meta, rest)}</Text>
            ) : null}
          </Text>
          {r.pill ? Pill(k, r.pill) : null}
        </Box>
        {r.actions?.length ? Actions(k, r.key, r.actions) : null}
      </Box>
    );
  }
  const acts = r.actions?.length ? Actions(k, r.key, r.actions) : null;
  // A wrapping row in a narrow body: title (wrapped) beside the icon, the pill under the title, nothing cut.
  if (r.wrap && k.narrow)
    return (
      <Box key={r.key} flexDirection="column" paddingY={0}>
        <Box flexDirection="row" alignItems="flex-start" gap={1}>
          {icon
            ? Icon(k, icon, {
                tone,
                color: tone ? undefined : k.t.faint,
                size: 14,
              })
            : null}
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap={0}>
            <Text size="footnote" color={k.t.text} wrap="wrap">
              {sanitize(r.title)}
            </Text>
            {r.pill ? (
              <Box flexDirection="row" flexShrink={0}>
                {Pill(k, r.pill)}
              </Box>
            ) : null}
          </Box>
        </Box>
        {acts}
      </Box>
    );
  return (
    <Box key={r.key} flexDirection="column" paddingY={0}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        {icon
          ? Icon(k, icon, {
              tone,
              color: tone ? undefined : k.t.faint,
              size: 14,
            })
          : null}
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text
            size="footnote"
            color={k.t.text}
            wrap={r.wrap ? "wrap" : "truncate-end"}
          >
            {sanitize(r.title)}
          </Text>
        </Box>
        {r.meta && !k.narrow ? (
          <Box flexShrink={1} minWidth={0}>
            <Text size="caption" color={k.t.faint} wrap="truncate-end">
              {sanitize(r.meta)}
            </Text>
          </Box>
        ) : null}
        {r.pill ? (
          <Box paddingRight={1} flexShrink={0} alignSelf="center">
            {Pill(k, r.pill)}
          </Box>
        ) : null}
        {acts && !k.narrow ? acts : null}
      </Box>
      {acts && k.narrow ? acts : null}
    </Box>
  );
}

/**
 * Label / value rows; `copy` adds a framed copy knob for raw data (paths, URLs, IDs). Graphical: drawn as a card (it is
 * one block of facts); `bare: true` leaves the frame off when it already sits in a Card.
 */
export function KeyValue(
  k: Kit,
  kv: {
    key?: string;
    bare?: boolean;
    rows: {
      key?: string;
      label: string;
      value: string;
      copy?: boolean;
      tone?: Tone;
    }[];
  },
): RenderElement {
  const { Box, Text } = k;
  const width = Math.min(
    Math.floor(k.cols / 2),
    Math.max(0, ...kv.rows.map((r) => [...sanitize(r.label)].length)),
  );
  const rows = kv.rows.map((r, i) => {
    const id = r.key ?? `${kv.key ?? "kv"}-${i}`;
    const copy = r.copy
      ? CopyButton(k, { key: `${id}-copy`, text: r.value, iconOnly: true })
      : null;
    if (!k.graphical) {
      const label = truncate(sanitize(r.label).padEnd(width), width);
      const room = Math.max(4, k.cols - width - 2 - (copy ? 4 : 0));
      return (
        <Box key={id} flexDirection="row" gap={1}>
          <Text dimColor>{label}</Text>
          <Text color={r.tone ? terminalColor(k.brand, r.tone) : undefined}>
            {truncate(r.value, room)}
          </Text>
          {copy}
        </Box>
      );
    }
    return (
      <Box key={id} flexDirection="row" alignItems="center" gap={1}>
        <Box flexShrink={0}>
          <Text size="footnote" color={k.t.muted}>
            {sanitize(r.label)}
          </Text>
        </Box>
        <Box
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          flexDirection="row"
          justifyContent="flex-end"
        >
          <Text
            size="footnote"
            tabular
            color={r.tone ? k.t.tones[r.tone].fg : k.t.text}
            wrap="truncate-middle"
          >
            {sanitize(r.value)}
          </Text>
        </Box>
        {copy}
      </Box>
    );
  });
  if (k.graphical && !kv.bare) return Card(k, { key: kv.key, children: rows });
  return (
    <Box key={kv.key} flexDirection="column">
      {rows}
    </Box>
  );
}

/**
 * A copy button for raw data; `show` prints the value (mono, cut in the middle) before it. `iconOnly`: graphical, a
 * small framed knob with the copy icon (the label is its click target, as on every framed knob); terminal, `⧉`.
 */
export function CopyButton(
  k: Kit,
  c: {
    key: string;
    text: string;
    label?: string;
    show?: boolean;
    iconOnly?: boolean;
  },
): RenderElement {
  const { Box, Text, Button } = k;
  const label = c.label ?? k.s.copy;
  const press = (e: { surface?: string }) => k.copy(c.text, e?.surface);
  const btn =
    c.iconOnly && k.graphical ? (
      IconButton(k, {
        key: c.key,
        icon: "copy",
        label,
        onPress: press as () => void,
      })
    ) : c.iconOnly ? (
      <Button key={c.key} label={label} plain onPress={press}>
        {TERM_GLYPHS.copy ?? label}
      </Button>
    ) : k.graphical ? (
      <Button
        key={c.key}
        label={glyphLabel("copy", label)}
        variant="secondary"
        onPress={press}
      >
        {glyphLabel("copy", label)}
      </Button>
    ) : (
      <Button key={c.key} plain onPress={press}>
        {label}
      </Button>
    );
  if (!c.show) return btn;
  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      {c.show ? (
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text
            mono
            dimColor={k.graphical ? undefined : true}
            color={ink(k, "faint")}
            wrap="truncate-middle"
          >
            {k.graphical
              ? sanitize(c.text)
              : truncate(c.text, Math.max(6, k.cols - [...label].length - 4))}
          </Text>
        </Box>
      ) : null}
      {btn}
    </Box>
  );
}

/** Progress bar with a sentence under it ("128 von 412 · noch ca. 2 min"); no `value` draws it as running. */
export function ProgressBlock(
  k: Kit,
  p: {
    key?: string;
    label: string;
    value?: number;
    max?: number;
    valueText?: string;
    sentence?: string;
    tone?: Tone;
  },
): RenderElement {
  const { Box, Text } = k;
  const Progress = k.Progress;
  const color = toneColor(k, p.tone ?? "warn");
  const bar = Progress ? (
    <Progress
      label={sanitize(p.label) || "…"}
      value={p.value}
      max={p.max}
      valueText={p.valueText}
      color={color}
    />
  ) : (
    <Text>
      {truncate(`${p.label}${p.valueText ? `  ${p.valueText}` : ""}`, k.cols)}
    </Text>
  );
  return (
    <Box key={p.key} flexDirection="column" gap={k.graphical ? 1 : 0}>
      {bar}
      {p.sentence ? Sentence(k, p.sentence, { faint: true }) : null}
    </Box>
  );
}

// --- v1 components (extended) ---

export type Action = {
  key: string;
  label: string;
  onPress: () => void;
  /** Destructive: two-step via ConfirmButton; a string is the confirm label ("Really delete?"). */
  confirm?: boolean | string;
  /** v1 spelling of `variant: 'primary'`. */
  primary?: boolean;
  /** v2: the icon's text glyph in front of the label (graphical surfaces; `ICON_GLYPHS`). */
  icon?: IconName;
  /** v2: primary (one per view), secondary, link (plain text button). Absent with no icon: the v1 plain look. */
  variant?: "primary" | "secondary" | "link";
};

function isV2(a: Action): boolean {
  return a.icon !== undefined || a.variant !== undefined;
}

/** One line of text, sanitized and cut to the body width (minus `indent`). */
export function Line(
  k: Kit,
  text: unknown,
  style: { color?: Color; dim?: boolean; bold?: boolean; indent?: number } = {},
): RenderElement {
  const { Text } = k;
  const pad = " ".repeat(style.indent ?? 0);
  return (
    <Text color={style.color} dimColor={style.dim} bold={style.bold}>
      {truncate(pad + sanitize(text), k.cols)}
    </Text>
  );
}

/** A status glyph as its own colored Text. */
export function StatusGlyph(k: Kit, status: Status): RenderElement {
  const { Text } = k;
  const g = glyphOf(status);
  return (
    <Text color={g.color} dimColor={g.dim}>
      {g.char}
    </Text>
  );
}

/** Two-step destructive button: first press turns it into "Really …?" + Cancel. */
export function ConfirmButton(
  k: Kit,
  a: {
    key: string;
    label: string;
    confirmLabel?: string;
    onConfirm: () => void;
  },
): RenderElement {
  const { Box, Button } = k;
  // Graphical: a real (secondary) button like its neighbours, not bare text; the terminal keeps the plain one.
  if (!k.isConfirming(a.key))
    return k.graphical ? (
      <Button
        key={a.key}
        label={a.label}
        variant="secondary"
        onPress={() => k.askConfirm(a.key)}
      >
        {a.label}
      </Button>
    ) : (
      <Button key={a.key} plain onPress={() => k.askConfirm(a.key)}>
        {a.label}
      </Button>
    );
  return (
    <Box flexDirection="row" gap={1}>
      <Button
        key={a.key}
        variant="primary"
        onPress={() => {
          k.clearConfirm();
          a.onConfirm();
        }}
      >
        {a.confirmLabel ?? k.s.really(a.label)}
      </Button>
      <Button key={`${a.key}-cancel`} plain onPress={() => k.clearConfirm()}>
        {k.s.cancel}
      </Button>
    </Box>
  );
}

/**
 * One action button. v1 (no `icon`/`variant`): plain, primary or two-step. v2: the engine's own `variant`
 * primary/secondary (the app paints it; a desktop ignores colors on a Button), `link` as a plain Button without glyph. Graphical
 * surfaces put the icon's text glyph in front of the label ("↑ Pushen"): the whole native Button is the click target
 * (`label` names it). The terminal keeps `[ label ]`.
 */
export function ActionButton(k: Kit, a: Action): RenderElement {
  const { Button } = k;
  if (a.confirm)
    return ConfirmButton(k, {
      key: a.key,
      label: a.label,
      confirmLabel: typeof a.confirm === "string" ? a.confirm : undefined,
      onConfirm: a.onPress,
    });
  if (!isV2(a))
    return (
      <Button
        key={a.key}
        plain={a.primary ? undefined : true}
        variant={a.primary ? "primary" : undefined}
        onPress={a.onPress}
      >
        {a.label}
      </Button>
    );
  const variant = a.variant ?? (a.primary ? "primary" : "secondary");
  if (variant === "link")
    return (
      <Button key={a.key} label={a.label} plain onPress={a.onPress}>
        {a.label}
      </Button>
    );
  // A desktop draws `label` in place of the children: the glyph must be in the label itself.
  const text = k.graphical ? glyphLabel(a.icon, a.label) : a.label;
  return (
    <Button key={a.key} label={text} variant={variant} onPress={a.onPress}>
      {text}
    </Button>
  );
}

/**
 * A wrapped row of buttons: at most `max` (3) shown, the rest behind a "…" toggle keyed `${key}-more`. Narrow body
 * with v2 actions: the primary on a row of its own (stretched where the surface lets a Button stretch), the other
 * buttons and links together in one wrapping row below it, so they do not each take a line.
 */
export function Actions(
  k: Kit,
  key: string,
  actions: Action[],
  max = 3,
): RenderElement | null {
  const { Box, Button } = k;
  if (!actions.length) return null;
  const open = k.isMore(key);
  const shown = actions.length > max && !open ? actions.slice(0, max) : actions;
  const toggle =
    actions.length > max ? (
      <Button key={`${key}-more`} plain onPress={() => k.toggleMore(key)}>
        {open ? "‹" : "…"}
      </Button>
    ) : null;
  const isPrimary = (a: Action) =>
    (isV2(a)
      ? (a.variant ?? (a.primary ? "primary" : "secondary"))
      : a.primary
        ? "primary"
        : "") === "primary";
  const lead = shown.filter(isPrimary);
  if (k.narrow && actions.some(isV2) && lead.length) {
    const rest = shown.filter((a) => !isPrimary(a));
    return (
      <Box flexDirection="column" alignItems="stretch" gap={1}>
        {lead.map((a) => ActionButton(k, a))}
        {rest.length || toggle ? (
          <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
            {rest.map((a) => ActionButton(k, a))}
            {toggle}
          </Box>
        ) : null}
      </Box>
    );
  }
  return (
    <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
      {shown.map((a) => ActionButton(k, a))}
      {toggle}
    </Box>
  );
}

export function Header(
  k: Kit,
  hd: {
    title: string;
    context?: string;
    actions?: Action[];
    onRefresh?: () => void;
    refreshing?: boolean;
    key?: string;
  },
): RenderElement {
  const { Box, Text, Button } = k;
  const key = hd.key ?? "header";
  const title = truncate(hd.title, k.cols);
  const room = k.cols - [...title].length - 2;
  // A title cut to the full width leaves no room: drawing "  …" after it would overflow the line.
  const ctx =
    hd.context && !k.compact && room >= 4 ? truncate(hd.context, room) : "";
  return (
    <Box flexDirection="column">
      <Text bold>
        {title}
        {ctx ? <Text dimColor>{`  ${ctx}`}</Text> : null}
      </Text>
      {((hd.actions?.length ?? 0) > 0 || hd.onRefresh) && (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {(hd.actions ?? []).map((a) => ActionButton(k, a))}
          {hd.onRefresh && (
            <Button key={`${key}-refresh`} plain onPress={hd.onRefresh}>
              {hd.refreshing ? "⟳ …" : "⟳ Refresh"}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

/** Section: bold title + dim count; collapsible (▾/▸ button keyed `sec-${key}`) when `collapsible`. */
export function Section(
  k: Kit,
  s: {
    key: string;
    title: string;
    count?: number | string;
    collapsible?: boolean;
    defaultOpen?: boolean;
    actions?: Action[];
    children: Kid[] | RenderElement | null;
  },
): RenderElement {
  const { Box, Text, Button } = k;
  const open = s.collapsible ? k.isOpen(s.key, s.defaultOpen ?? true) : true;
  const label = truncate(
    `${s.collapsible ? (open ? "▾ " : "▸ ") : ""}${s.title}`,
    k.cols,
  );
  const room = k.cols - [...label].length - 1;
  const count =
    s.count === undefined || s.count === "" || room < 2
      ? ""
      : ` ${truncate(s.count, room)}`;
  const head = s.collapsible ? (
    <Button key={`sec-${s.key}`} plain onPress={() => k.toggle(s.key)}>
      {`${label}${count}`}
    </Button>
  ) : (
    <Text bold>
      {label}
      {count ? <Text dimColor>{count}</Text> : null}
    </Text>
  );
  return (
    <Box flexDirection="column">
      {s.actions?.length ? (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {head}
          {s.actions.map((a) => ActionButton(k, a))}
        </Box>
      ) : (
        head
      )}
      {open && kids(s.children)}
    </Box>
  );
}

/** Row: leading glyph + primary, dim secondary (hidden when compact), ≤3 actions + "…" overflow. v1; v2 uses ListRow. */
export function Row(
  k: Kit,
  r: {
    key: string;
    status?: Status;
    /** Overrides the status glyph (e.g. `[x]`). */
    glyph?: string;
    primary: string;
    secondary?: string;
    color?: Color;
    dim?: boolean;
    actions?: Action[];
    indent?: number;
  },
): RenderElement {
  const { Box, Text } = k;
  const g = r.status ? glyphOf(r.status) : undefined;
  const mark = r.glyph ?? g?.char;
  const pad = " ".repeat(r.indent ?? 0);
  const head = truncate(
    `${pad}${mark ? `${mark} ` : ""}${sanitize(r.primary)}`,
    k.cols,
  );
  return (
    <Box flexDirection="column">
      <Text color={r.color ?? g?.color} dimColor={r.dim ?? g?.dim}>
        {head}
      </Text>
      {r.secondary && !k.compact ? (
        <Text dimColor>
          {truncate(`${pad}  ${sanitize(r.secondary)}`, k.cols)}
        </Text>
      ) : null}
      {r.actions?.length ? Actions(k, r.key, r.actions) : null}
    </Box>
  );
}

export type EmptyInfo = {
  icon?: IconName;
  title: string;
  text?: string;
  action?: Action;
};

/** Empty state. A string: one dim line (v1). An object: calm icon, one sentence what is going on, at most one button. */
export function EmptyState(k: Kit, info: string | EmptyInfo): RenderElement {
  if (typeof info === "string") return Line(k, info, { dim: true });
  const { Box, Text } = k;
  const action = info.action
    ? ActionButton(k, { variant: "secondary", ...info.action })
    : null;
  if (!k.graphical)
    return (
      <Box flexDirection="column">
        <Text bold>{truncate(info.title, k.cols)}</Text>
        {info.text ? Sentence(k, info.text, { faint: true }) : null}
        {action}
      </Box>
    );
  return (
    <Box flexDirection="column" alignItems="center" gap={1} paddingY={2}>
      {Icon(k, info.icon ?? "circle", { size: 28, color: k.t.faint })}
      <Text weight="bold" color={k.t.text} wrap="truncate-end">
        {sanitize(info.title)}
      </Text>
      {info.text ? Sentence(k, info.text) : null}
      {action}
    </Box>
  );
}

const BAR_WIDTHS = ["72%", "48%", "86%", "60%", "40%"];

/**
 * Loading state. A string: one dim line (v1). An object: placeholder cards in the shape that is coming (`shape`: bars
 * per card, default one card of 3) and, after 3 s or so, a sentence saying why it takes long (`text`). No spinner.
 */
export function LoadingState(
  k: Kit,
  info: string | { text?: string; shape?: number[] } = k.s.loading,
): RenderElement {
  if (typeof info === "string") return Line(k, info, { dim: true });
  const { Box, Text } = k;
  if (!k.graphical) return Line(k, info.text ?? k.s.loading, { dim: true });
  const cards = (info.shape ?? [3]).map((bars, i) =>
    Card(k, {
      key: `skeleton-${i}`,
      children: Array.from({ length: Math.max(1, bars) }, (_, j) => (
        <Box
          key={`sk-${i}-${j}`}
          height={1}
          width={BAR_WIDTHS[(i + j) % BAR_WIDTHS.length]}
          backgroundColor={boxPaint(k.t.line)}
        />
      )),
    }),
  );
  return (
    <Box flexDirection="column" gap={1}>
      {cards}
      {info.text ? (
        <Text size="footnote" color={k.t.faint}>
          {sanitize(info.text)}
        </Text>
      ) : null}
    </Box>
  );
}

/**
 * Error state. v1 (no `title`): red one-liner + Details toggle (`${key}-details`) + Retry (`${key}-retry`). v2 (with
 * `title`): a bad-toned card saying what did not work and what still runs, one helping button (`action`), Retry as a
 * link and the raw details only on press.
 */
export function ErrorState(
  k: Kit,
  err: {
    key: string;
    message: string;
    details?: string;
    onRetry?: () => void;
    title?: string;
    action?: Action;
  },
): RenderElement {
  const { Box, Text, Button } = k;
  const lines = sanitize(err.message).split("\n");
  const first = lines[0] || k.s.wrong;
  const details = [err.details ? sanitize(err.details) : "", ...lines.slice(1)]
    .filter(Boolean)
    .join("\n");
  const shown = k.hasDetails(err.key);
  const detailLines = shown
    ? details
        .split("\n")
        .slice(0, Math.max(3, k.rows - 6))
        .map((l) => (
          <Text
            dimColor={k.graphical && err.title !== undefined ? undefined : true}
            color={err.title !== undefined ? ink(k, "faint") : undefined}
          >
            {truncate(l || " ", k.cols)}
          </Text>
        ))
    : [];
  if (err.title !== undefined) {
    const acts: Action[] = [
      ...(err.action ? [{ variant: "primary" as const, ...err.action }] : []),
      ...(err.onRetry
        ? [
            {
              key: `${err.key}-retry`,
              label: k.s.retry,
              onPress: err.onRetry,
              variant: "link" as const,
            },
          ]
        : []),
      ...(details
        ? [
            {
              key: `${err.key}-details`,
              label: shown ? k.s.hideDetails : k.s.details,
              onPress: () => k.toggleDetails(err.key),
              variant: "link" as const,
            },
          ]
        : []),
    ];
    return Card(k, {
      key: err.key,
      tone: "bad",
      children: [
        CardTitle(k, {
          icon: "xCircle",
          title: k.graphical ? err.title : `✗ ${err.title}`,
          tone: "bad",
        }),
        Sentence(k, first),
        acts.length ? Actions(k, `${err.key}-acts`, acts, acts.length) : null,
        ...detailLines,
      ],
    });
  }
  return (
    <Box flexDirection="column">
      <Text color="red">{truncate(`✗ ${first}`, k.cols)}</Text>
      {(details || err.onRetry) && (
        <Box flexDirection="row" gap={1}>
          {details ? (
            <Button
              key={`${err.key}-details`}
              plain
              onPress={() => k.toggleDetails(err.key)}
            >
              {shown ? k.s.hideDetails : k.s.details}
            </Button>
          ) : null}
          {err.onRetry ? (
            <Button key={`${err.key}-retry`} plain onPress={err.onRetry}>
              {k.s.retry}
            </Button>
          ) : null}
        </Box>
      )}
      {detailLines}
    </Box>
  );
}

/**
 * Long output: newest lines at the bottom, bounded to the body rows; "Show more" (`${key}-more`) widens it.
 * `collapsed` (v2): only the last non-empty line and a "Log" button (same key) until pressed.
 */
export function LogBox(
  k: Kit,
  b: {
    key: string;
    title?: string;
    lines: readonly string[];
    rows?: number;
    onClose?: () => void;
    collapsed?: boolean;
  },
): RenderElement {
  const { Box, Text, Button } = k;
  const base = b.rows ?? Math.max(4, Math.floor(k.rows / 2) - 2);
  const more = k.isLogMore(b.key);
  const all = b.lines.flatMap((l) => sanitize(l).split("\n"));
  if (b.collapsed && !more) {
    const last = [...all].reverse().find((l) => l.trim()) ?? "";
    // Graphical: the link's text in the line's own size and color (a label would be drawn at button size instead).
    const btn = k.graphical ? (
      <Button
        key={`${b.key}-more`}
        plain
        onPress={() => k.toggleLogMore(b.key)}
      >
        <Text size="footnote" color={k.t.link}>
          {k.s.log}
        </Text>
      </Button>
    ) : (
      ActionButton(k, {
        key: `${b.key}-more`,
        label: k.s.log,
        icon: "log",
        variant: "link",
        onPress: () => k.toggleLogMore(b.key),
      })
    );
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text
            dimColor={k.graphical ? undefined : true}
            color={ink(k, "faint")}
            size="footnote"
            wrap="truncate-end"
          >
            {k.graphical
              ? last || " "
              : truncate(
                  last || " ",
                  Math.max(4, k.cols - [...k.s.log].length - 3),
                )}
          </Text>
        </Box>
        {btn}
      </Box>
    );
  }
  const room = more ? base * 4 : base;
  const shown = all.slice(-room);
  const hidden = all.length - shown.length;
  return (
    <Box flexDirection="column">
      {(b.title || b.onClose) && (
        <Box flexDirection="row" gap={1}>
          {b.title ? (
            <Text bold>{truncate(b.title, Math.max(1, k.cols - 4))}</Text>
          ) : null}
          {b.onClose ? (
            <Button key={`${b.key}-close`} plain onPress={b.onClose}>
              ✕
            </Button>
          ) : null}
        </Box>
      )}
      {(hidden > 0 || more) && (
        <Button
          key={`${b.key}-more`}
          plain
          onPress={() => k.toggleLogMore(b.key)}
        >
          {more
            ? b.collapsed
              ? k.s.hideLog
              : k.s.showLess
            : k.s.showMore(hidden)}
        </Button>
      )}
      {shown.map((l) => (
        <Text dimColor>{truncate(l || " ", k.cols)}</Text>
      ))}
    </Box>
  );
}

export type TabItem<T extends string> = {
  id: T;
  label: string;
  badge?: string;
  /** v2 marker (switches to the one-row strip); tabs draw no glyph since Kit v3.2, text only. */
  icon?: IconName;
  /** v2: a count after the label ("Review · 2"). */
  count?: number | string;
};

/**
 * Tab bar: one Button per tab keyed `${keyPrefix ?? 'tab-'}${id}`, the active one primary; wraps on narrow bodies (v1).
 * v2 (any `icon` or `maxVisible`): one row of native Buttons, the active one `variant: 'primary'`, the rest plain, each
 * "<label> · <count>" (no glyph); past `maxVisible` the rest sit behind a "More" tab (`${prefix}more`) whose menu lists them
 * under the strip (same keys); the active tab always stays in the strip. Narrow bodies keep the strip on one line.
 */
export function Tabs<T extends string>(
  k: Kit,
  t: {
    tabs: TabItem<T>[];
    active: T;
    onSelect: (id: T) => void;
    keyPrefix?: string;
    maxVisible?: number;
    moreLabel?: string;
  },
): RenderElement {
  const { Box, Button } = k;
  const prefix = t.keyPrefix ?? "tab-";
  const text = (tab: TabItem<T>) =>
    `${tab.label}${tab.count !== undefined && tab.count !== "" ? ` · ${tab.count}` : ""}${tab.badge ? ` ${tab.badge}` : ""}`;
  const v2 = t.maxVisible !== undefined || t.tabs.some((tab) => tab.icon);
  if (!v2)
    return (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {t.tabs.map((tab) => (
          <Button
            key={`${prefix}${tab.id}`}
            plain={tab.id === t.active ? undefined : true}
            variant={tab.id === t.active ? "primary" : undefined}
            onPress={() => t.onSelect(tab.id)}
          >
            {text(tab)}
          </Button>
        ))}
      </Box>
    );
  const max = Math.max(2, t.maxVisible ?? t.tabs.length);
  let strip = t.tabs;
  let rest: TabItem<T>[] = [];
  if (t.tabs.length > max) {
    strip = t.tabs.slice(0, max - 1);
    const active = t.tabs.find((tab) => tab.id === t.active);
    if (active && !strip.includes(active))
      strip = [...strip.slice(0, -1), active];
    rest = t.tabs.filter((tab) => !strip.includes(tab));
  }
  const menuKey = `${prefix}menu`;
  const menuOpen = rest.length > 0 && k.isMore(menuKey);
  const one = (tab: TabItem<T>, inMenu = false) => {
    const on = tab.id === t.active;
    const press = () => {
      if (inMenu) k.toggleMore(menuKey);
      t.onSelect(tab.id);
    };
    if (k.graphical)
      return (
        <Button
          key={`${prefix}${tab.id}`}
          label={text(tab)}
          plain={on ? undefined : true}
          variant={on ? "primary" : undefined}
          onPress={press}
        >
          {text(tab)}
        </Button>
      );
    return (
      <Button
        key={`${prefix}${tab.id}`}
        plain={on ? undefined : true}
        variant={on ? "primary" : undefined}
        onPress={press}
      >
        {text(tab)}
      </Button>
    );
  };
  const moreText = `${t.moreLabel ?? k.s.more}${menuOpen ? " ▴" : " ▾"}`;
  const moreTab = !rest.length ? null : k.graphical ? (
    <Button
      key={`${prefix}more`}
      label={t.moreLabel ?? k.s.more}
      plain
      onPress={() => k.toggleMore(menuKey)}
    >
      {moreText}
    </Button>
  ) : (
    <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
      <Button key={`${prefix}more`} plain onPress={() => k.toggleMore(menuKey)}>
        {moreText}
      </Button>
    </Box>
  );
  const bar = k.graphical ? (
    <Box
      flexDirection="row"
      alignItems="center"
      gap={1}
      flexWrap={k.narrow ? "nowrap" : "wrap"}
      overflow={k.narrow ? "hidden" : undefined}
    >
      {strip.map((tab) => one(tab))}
      {moreTab}
    </Box>
  ) : (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      {strip.map((tab) => one(tab))}
      {moreTab}
    </Box>
  );
  if (!menuOpen) return bar;
  const menu = k.graphical ? (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      {rest.map((tab) => one(tab, true))}
    </Box>
  ) : (
    <Box flexDirection="column" paddingLeft={2}>
      {rest.map((tab) => one(tab, true))}
    </Box>
  );
  return (
    <Box flexDirection="column" gap={k.graphical ? 1 : 0}>
      {bar}
      {menu}
    </Box>
  );
}

// --- ask Claude: buttons that hand a prompt to Claude ---
//
// Every button that sends Claude a prompt goes through `askClaude` / `askAction`: it toasts at once (Claude may be
// busy, then the prompt only waits in the queue and is not visible in the chat), sends the same task (`key`) only
// once until Claude answered *that* prompt, and the button reads „✓ An Claude geschickt“ meanwhile (an engine Button
// has no `disabled`; a press then only toasts „Schon an Claude geschickt“). `failurePrompt` builds the prompt for a
// failed run: what failed, the last output lines, the full output's path, and the ask for a cause and a proposal.
//
// Lock (v2, 2026-11-18): a sent task stays locked until the turn whose prompt carries it has ended — the main loop's
// `turn.start` text is searched for the task's `probe` (start of its prompt); that turn's id binds the task, and
// only that turn's `turn.complete` answers it. A turn that started for something else (a typed prompt, a running
// turn ending while the task still waits in the queue, several plugin prompts the engine merges) releases nothing.
// An answered task turns its button into „Nochmal schicken“ (sending again is a choice, never silent) for
// `ASK_DONE_MS`. Without a matching turn the lock ends after `ASK_TIMEOUT_MS` (fixed time from the press).
//
// Copy into another kit copy (one block, no other kit change except the two `asked` lines in `kit()`/`Kit`):
// - this section; change the plugin name of `askedAtom` (string literal);
// - types/index.d.ts: `AskedEntry` (with `probe`, `turnId`, phase `done`), `AskedState` and
//   `asked: ShapedState<AskedState>` in PluginState;
// - Kit: field `asked: AskedState`, read in `kit()` (`asked: await read($, askedAtom)`) so a render redraws;
// - hooks: `on('turn.start')` → `askTurnStart($, e)`, `on('turn.complete')` → `askTurnComplete($, e)`, each after
//   `await next(e)` (see hooks/register.tsx). Without them the lock ends after `ASK_TIMEOUT_MS` only.

const EMPTY_ASKED: AskedState = { busy: false, sent: {} };
// On copy into another plugin: change the plugin name (it must stay a string literal).
const askedAtom = atom(
  { plugin: "dnd-studio", key: "asked" } as const,
  EMPTY_ASKED,
  { shape: "asked-2" },
);

/** Fallback end of the lock when no turn carrying the prompt comes (a reload, a host without turn events). */
export const ASK_TIMEOUT_MS = 15 * 60_000;
/** How long an answered task offers „Nochmal schicken“ before the button is back to normal. */
export const ASK_DONE_MS = 30 * 60_000;
/** Characters of a prompt's start that find it in a turn's text (whitespace folded). */
const PROBE_CHARS = 160;

/** German texts of the ask-Claude buttons and toasts. */
export const ASK_TEXT = {
  sent: "An Claude geschickt.",
  queued: " – kommt nach der laufenden Antwort.",
  again: "Schon an Claude geschickt – kommt mit der Antwort darauf.",
  label: "An Claude geschickt",
  resend: "Nochmal schicken",
  failed: "Konnte nicht an Claude schicken.",
  ask: "Finde die Ursache und schlag eine Lösung vor; ändere noch nichts ohne Rückfrage.",
} as const;

/** Ends `text` with exactly one sentence mark: a `.` unless it already ends with `.`, `!`, `?`, `:` or `…`. */
export function sentence(text: string): string {
  const t = text.trim();
  return !t || /[.!?:…]$/.test(t) ? t : `${t}.`;
}

/** The lock key of a task: the button key, else the prompt text itself. */
export function askKey(text: string, key?: string): string {
  return key ?? `text:${text}`;
}

/** Folds whitespace so a prompt is found in a turn's text however the engine wrapped it. */
function fold(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The probe that finds a prompt in a turn's text: its folded start. */
export function askProbe(text: string): string {
  return fold(text).slice(0, PROBE_CHARS);
}

/** The toast of a sent prompt; `busy` adds that it comes after the running answer. */
export function askToast(base: string, busy: boolean): string {
  return busy ? `${base.trim().replace(/[.!]+$/, "")}${ASK_TEXT.queued}` : base;
}

/** Whether a task is locked (sent, Claude's answer to it not ended yet). For render: pass `k.asked`. */
export function isAsked(asked: AskedState, key: string): boolean {
  const e = asked.sent[key];
  return e !== undefined && e.phase !== "done";
}

/** Whether Claude already answered this task (its button then offers „Nochmal schicken“). */
export function isAnswered(asked: AskedState, key: string): boolean {
  return asked.sent[key]?.phase === "done";
}

export type AskOptions = {
  /** The prompt, or a producer run after the lock is taken (e.g. take a screenshot first); `undefined` sends nothing. */
  text: string | (() => Promise<string | undefined>);
  /** Lock key (the button key); default: the text. */
  key?: string;
  /** Toast when sent (default „An Claude geschickt.“); „ – kommt nach der laufenden Antwort.“ is added when busy. */
  toast?: string;
};

export type AskResult = "sent" | "queued" | "again" | "skipped" | "failed";

/** Drops answered tasks older than `ASK_DONE_MS`. */
function pruneAsked(sent: AskedState["sent"], now: number): AskedState["sent"] {
  const out: AskedState["sent"] = {};
  for (const [k, v] of Object.entries(sent))
    if (v.phase !== "done" || now - v.at < ASK_DONE_MS) out[k] = v;
  return out;
}

/**
 * Sends a prompt to Claude once: toasts, takes the lock in the `asked` atom (never from a render hook: call it from
 * `onPress`, a command or a tool), and keeps it until the turn carrying this prompt ended (or `ASK_TIMEOUT_MS`).
 * An answered task is sent again on a new press (its button says „Nochmal schicken“).
 */
export async function askClaude(
  $: EngineInterface,
  opts: AskOptions,
): Promise<AskResult> {
  const key = askKey(typeof opts.text === "string" ? opts.text : "", opts.key);
  const at = await $.clock.now();
  let dup = false;
  let busy = false;
  await update($, askedAtom, (s) => {
    const sent = pruneAsked(s.sent, at);
    dup = sent[key] !== undefined && sent[key]?.phase !== "done";
    busy = s.busy;
    return dup
      ? { ...s, sent }
      : { ...s, sent: { ...sent, [key]: { at, phase: "queued" as const } } };
  });
  if (dup) {
    $.ui.toast(ASK_TEXT.again);
    return "again";
  }
  const text =
    typeof opts.text === "string"
      ? opts.text
      : await opts.text().catch(() => undefined);
  if (!text) {
    await releaseAsk($, key, at);
    return "skipped";
  }
  const probe = askProbe(text);
  await update($, askedAtom, (s) =>
    s.sent[key]?.at === at
      ? { ...s, sent: { ...s.sent, [key]: { ...s.sent[key]!, probe } } }
      : s,
  );
  $.ui.toast(askToast(opts.toast ?? ASK_TEXT.sent, busy));
  $.clock.after(ASK_TIMEOUT_MS, () => void releaseAsk($, key, at));
  try {
    await $.prompt.submit({ text });
  } catch {
    await releaseAsk($, key, at);
    $.ui.toast(ASK_TEXT.failed);
    return "failed";
  }
  return busy ? "queued" : "sent";
}

/** Drops the lock of `key` when it is still the one taken at `at` and not answered yet. */
async function releaseAsk(
  $: EngineInterface,
  key: string,
  at: number,
): Promise<void> {
  await update($, askedAtom, (s) => {
    const e = s.sent[key];
    if (e?.at !== at || e.phase === "done") return s;
    const sent = { ...s.sent };
    delete sent[key];
    return { ...s, sent };
  });
}

/**
 * `turn.start` of the main loop (call after `await next(e)`): Claude is busy; each waiting task whose probe is in
 * this turn's text is now being answered, bound to this turn. Tasks not in the text keep waiting.
 */
export async function askTurnStart(
  $: EngineInterface,
  e: { agentId?: string; text?: string; turnId?: string },
): Promise<void> {
  if (e.agentId !== undefined) return;
  const now = await $.clock.now();
  const text = fold(e.text ?? "");
  const bound: string[] = [];
  await update($, askedAtom, (s) => {
    const sent = pruneAsked(s.sent, now);
    for (const [k, v] of Object.entries(sent))
      if (v.phase === "queued" && v.probe && text && text.includes(v.probe)) {
        sent[k] = { ...v, phase: "running", turnId: e.turnId };
        bound.push(k);
      }
    return { busy: true, sent };
  });
  if (bound.length)
    $.ui.log(`ask: turn ${e.turnId ?? "?"} carries ${bound.join(", ")}`, {
      to: "debug",
    });
}

/** `turn.complete` of the main loop (call after `await next(e)`): the tasks this turn carried are answered. */
export async function askTurnComplete(
  $: EngineInterface,
  e: { agentId?: string; turnId?: string },
): Promise<void> {
  if (e.agentId !== undefined) return;
  const now = await $.clock.now();
  await update($, askedAtom, (s) => {
    const sent: AskedState["sent"] = {};
    for (const [k, v] of Object.entries(s.sent))
      sent[k] =
        v.phase === "running" && v.turnId === e.turnId
          ? { at: now, phase: "done" }
          : v;
    return { busy: false, sent };
  });
}

/**
 * An `Action` that asks Claude: „✓ An Claude geschickt“ while locked (a press then only toasts), „Nochmal schicken“
 * once Claude answered it (a press sends it again), else as given.
 */
export function askAction(
  $: EngineInterface,
  k: Kit,
  a: {
    key: string;
    label: string;
    icon?: IconName;
    variant?: Action["variant"];
  } & Omit<AskOptions, "key">,
): Action {
  const press = (): void =>
    void askClaude($, { text: a.text, key: a.key, toast: a.toast });
  if (isAsked(k.asked, a.key))
    return {
      key: a.key,
      label: ASK_TEXT.label,
      icon: "check",
      variant:
        a.variant === "primary" ? "secondary" : (a.variant ?? "secondary"),
      onPress: press,
    };
  if (isAnswered(k.asked, a.key))
    return {
      key: a.key,
      label: ASK_TEXT.resend,
      icon: a.icon ?? "claude",
      variant: "secondary",
      onPress: press,
    };
  return {
    key: a.key,
    label: a.label,
    icon: a.icon ?? "claude",
    variant: a.variant ?? "secondary",
    onPress: press,
  };
}

/**
 * The prompt for a failed run: what failed (one sentence), the last `lines` (20) output lines without control
 * characters, the path of the full output, an optional hint (a tool to read more), then the ask for the cause and a
 * proposal — not a fix. No doubled sentence marks („. .“).
 */
export function failurePrompt(f: {
  what: string;
  tail?: readonly string[];
  outputPath?: string;
  hint?: string;
  ask?: string;
  lines?: number;
}): string {
  const tail = (f.tail ?? [])
    .map((l) => sanitize(l).trimEnd())
    .filter((l) => l.trim() !== "")
    .slice(-(f.lines ?? 20))
    .map((l) => (l.length > 300 ? `${l.slice(0, 299)}…` : l));
  return [
    sentence(f.what),
    ...(tail.length
      ? [
          "",
          `Letzte ${tail.length === 1 ? "Ausgabezeile" : `${tail.length} Ausgabezeilen`}:`,
          "```",
          ...tail,
          "```",
        ]
      : []),
    ...(f.outputPath ? [`Volle Ausgabe: ${f.outputPath}`] : []),
    ...(f.hint ? [sentence(f.hint)] : []),
    "",
    f.ask ?? ASK_TEXT.ask,
  ].join("\n");
}

// --- launcher strip above the prompt (Band v4: two fixed lines, both left-aligned) ---
// Keep this section identical in every copy of the kit and in ds-usage-line's hooks/register.tsx (see README "Band").

/** Key prefix that marks a plugin's band row as a launcher row (`launch:<plugin>@<version>`), so a merger can find it. */
export const LAUNCH_PREFIX = "launch:";
/** The band layout this copy draws. A row keyed `…@<n>` with n above it hands the merge to a newer copy. */
export const BAND_VERSION = 4;
/** The plugin whose launcher row is the meter line (line 2): found by its key `launch:ds-usage-line@<n>`, any version. */
export const METER_PLUGIN = "ds-usage-line";
/** The root key of a plugin's launcher row. */
export const launchKey = (plugin: string): string =>
  `${LAUNCH_PREFIX}${plugin}@${BAND_VERSION}`;

/**
 * Root props of a starter row (`LauncherRow`, line 1): one line that shrinks and clips, its status cut with "…". The
 * merger may not set these on its own boxes (the engine refuses `minWidth`/`overflow` on a Box holding another
 * plugin's row), so every row brings them.
 */
export const LAUNCH_ROW = {
  flexDirection: "row",
  flexWrap: "nowrap",
  alignItems: "center",
  flexShrink: 1,
  minWidth: 0,
  overflow: "hidden",
} as const;
/**
 * Root props of the meter row (ds-usage-line, line 2): one line, left-aligned, as wide as its content, never wraps.
 * Its key (`launch:ds-usage-line@<n>`) marks it as the meter line (`isTrailing`), not its props. It fits itself to
 * `bodyColumns` (drops "bis …", then shortens its bars), so nothing on line 1 changes it.
 */
export const LAUNCH_METERS = {
  flexDirection: "row",
  flexWrap: "nowrap",
  alignItems: "center",
  justifyContent: "flex-start",
  flexShrink: 0,
} as const;
/** Space between the starters on line 1, inside a row and between rows alike: even gaps. */
export const starterGap = (graphical: boolean): number | "md" =>
  graphical ? "md" : 2;

export type LauncherChipProps = {
  key: string;
  /** Unused since Kit v3.2 (launcher chips carry no glyph: "Solutions", not "▦ Solutions"); kept for callers. */
  icon?: IconName;
  label: string;
  /**
   * A short state after the chip ("Gerät fehlt", "Tests laufen", "Call 15:30", "Runde 2"), a few words; the first thing
   * cut with "…" when line 1 gets tight. Band v4: only drawn with a `tone` that says it matters (see `tone`).
   */
  status?: string;
  /**
   * Whether and how the status stands. Band v4 rule: a quiet state shows no text, so each starter decides here.
   * `warn`/`bad`: needs the person, drawn in color. `ok`/`info`: something really runs or waits ("Tests laufen",
   * "App startet", "Tisch läuft", "Entwurf bereit"), drawn quiet. `neutral` or none: calm ("Editor bereit",
   * "verbunden", "läuft nicht"), no text at all, only the name.
   */
  tone?: Tone;
  /** The chip that matters now: `variant: 'primary'` (at most one per row). */
  primary?: boolean;
  onPress: () => void;
};

/** Whether a status tone is drawn in color: only what needs the person (warn, bad); the rest stays quiet. */
const loud = (tone?: Tone): tone is "warn" | "bad" =>
  tone === "warn" || tone === "bad";
/** Whether a chip's status stands at all (Band v4): only with a tone that is not calm (`neutral`/none show no text). */
export const showsStatus = (c: { status?: string; tone?: Tone }): boolean =>
  !!c.status &&
  (c.tone === "warn" ||
    c.tone === "bad" ||
    c.tone === "ok" ||
    c.tone === "info");

/**
 * One starter chip of line 1: a native Button with the bare name (pressable as a whole, no glyph) and, when it
 * matters (`showsStatus`), its status close after it ("Flutter · Gerät fehlt"). The button never shrinks; the status
 * is cut with "…". The terminal draws `[ label ]` and the status dim.
 */
export function LauncherChip(k: Kit, c: LauncherChipProps): RenderElement {
  const { Box, Text, Button } = k;
  const btn = (
    <Button
      key={c.key}
      label={c.label}
      variant={c.primary ? "primary" : undefined}
      plain={c.primary ? undefined : true}
      onPress={c.onPress}
    >
      {c.label}
    </Button>
  );
  if (!c.status || !showsStatus(c)) return btn;
  const tone = loud(c.tone) ? c.tone : undefined;
  const status = k.graphical ? (
    <Text
      size="footnote"
      color={tone ? k.t.tones[tone].fg : k.t.faint}
      wrap="truncate-end"
    >
      {`· ${sanitize(c.status)}`}
    </Text>
  ) : (
    <Text
      color={tone ? terminalColor(k.brand, tone) : undefined}
      dimColor={tone ? undefined : true}
      wrap="truncate-end"
    >
      {`· ${truncate(c.status, Math.max(6, Math.floor(k.cols / 3)))}`}
    </Text>
  );
  return (
    <Box
      key={`${c.key}-chip`}
      flexDirection="row"
      flexWrap="nowrap"
      alignItems="center"
      gap={k.graphical ? "xs" : 1}
      flexShrink={1}
      minWidth={0}
      overflow="hidden"
    >
      <Box key={`${c.key}-btn`} flexShrink={0}>
        {btn}
      </Box>
      {status}
    </Box>
  );
}

/**
 * A plugin's launcher row for its `AbovePrompt` hook: chips in one line that shrinks and clips (`LAUNCH_ROW`), keyed
 * `launch:<plugin>@4` so `mergeLauncherRows` (any installed plugin's) puts it on line 1 with every other starter.
 */
export function LauncherRow(
  k: Kit,
  r: { plugin: string; chips: Kids },
): RenderElement {
  const { Box } = k;
  return (
    <Box
      key={launchKey(r.plugin)}
      {...LAUNCH_ROW}
      gap={starterGap(k.graphical)}
    >
      {kids(r.chips)}
    </Box>
  );
}

type BandRow = { plugin: string; tree: RenderElement };
type BandNode = {
  type?: unknown;
  props?: Record<string, unknown>;
  children?: unknown;
  press?: unknown;
};
/** A Button in a settled tree: its handler sits in `press` once drawn, in `props.onPress` before. */
const isPressable = (n: BandNode): boolean =>
  n.type === "Button" ||
  n.press !== undefined ||
  typeof n.props?.onPress === "function";
const rootProps = (row: BandRow) =>
  (row.tree as { props?: { key?: unknown; justifyContent?: unknown } }).props;

/** Whether a band row is a launcher row (its root Box keyed `launch:…`). */
export function isLauncherRow(row: BandRow): boolean {
  const key = rootProps(row)?.key;
  return typeof key === "string" && key.startsWith(LAUNCH_PREFIX);
}

/**
 * Whether a launcher row is the meter line (line 2): its root key is `launch:ds-usage-line@<n>` (v2, v3 and v4 alike).
 * Not its alignment: since v4 the meter line is left-aligned like the starters.
 */
export function isTrailing(row: BandRow): boolean {
  const key = rootProps(row)?.key;
  return (
    typeof key === "string" &&
    key.startsWith(`${LAUNCH_PREFIX}${METER_PLUGIN}@`)
  );
}

/** The band version a launcher row was drawn for: the `@<n>` of its key, 1 for a row keyed before v2. */
export function bandVersion(row: BandRow): number {
  const m = /@(\d+)$/.exec(String(rootProps(row)?.key ?? ""));
  return m ? Number(m[1]) : 1;
}

const nodeKids = (n: BandNode): unknown[] => {
  const c = n.children ?? n.props?.children;
  return Array.isArray(c)
    ? c.flat(8)
    : c === undefined || c === null || c === false
      ? []
      : [c];
};
const plainText = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : n && typeof n === "object"
      ? nodeKids(n as BandNode)
          .map(plainText)
          .join("")
      : "";

/** The names of a starter row's buttons (their `label`), in order. */
export function starterLabels(row: BandRow): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const p = (n as BandNode).props ?? {};
    if (isPressable(n as BandNode)) {
      out.push(String(p.label ?? plainText(n)));
      return;
    }
    for (const c of nodeKids(n as BandNode)) walk(c);
  };
  walk(row.tree);
  return out;
}

/** Cells a status keeps at least before its row moves into "+N": "Gerät…" (and the "· " before it). */
const STATUS_MIN = 8;
/**
 * The fewest cells a starter row takes on line 1 (pure): every button whole (`[ label ]`, 4 for its frame), every
 * status cut to `STATUS_MIN`, the row's gaps. An estimate from the tree: the row itself still shrinks and clips.
 */
export function starterMinWidth(row: BandRow): number {
  let cells = 0;
  let parts = 0;
  const walk = (n: unknown): void => {
    if (typeof n === "string" || typeof n === "number") {
      cells += Math.min([...String(n)].length, STATUS_MIN) + 1;
      parts++;
      return;
    }
    if (!n || typeof n !== "object") return;
    const p = (n as BandNode).props ?? {};
    if (isPressable(n as BandNode)) {
      cells += [...String(p.label ?? plainText(n))].length + 4;
      parts++;
      return;
    }
    for (const c of nodeKids(n as BandNode)) walk(c);
  };
  walk(row.tree);
  return cells + Math.max(0, parts - 1) * 2;
}

/**
 * Which starters stand on line 1 and which go into "+N" (pure): all while their least widths fit `columns`, else the
 * last ones move into "+N" until the rest and the "+N" chip fit; one starter always stays.
 */
export function fitStarters<T extends BandRow>(
  starters: readonly T[],
  columns: number,
): { shown: T[]; hidden: T[] } {
  const gap = 2;
  const need = (rows: readonly T[]) =>
    rows.reduce((sum, r) => sum + starterMinWidth(r), 0) +
    Math.max(0, rows.length - 1) * gap;
  const shown = [...starters];
  const hidden: T[] = [];
  const more = () => (hidden.length ? gap + `+${hidden.length}`.length + 2 : 0);
  while (shown.length > 1 && need(shown) + more() > columns)
    hidden.unshift(shown.pop()!);
  return { shown, hidden };
}

/** Cells the "‹" chip takes on a later page (`[ ‹ ]` and the gap after it). */
const BACK_CELLS = 7;

/**
 * Line 1 in pages (pure): page 1 is what `fitStarters` keeps, each later page takes the next starters that fit beside
 * a "‹" (and a "+N" while more follow). One page when all fit; every page holds at least one starter.
 */
export function starterPages<T extends BandRow>(
  starters: readonly T[],
  columns: number,
): T[][] {
  const pages: T[][] = [];
  let rest = [...starters];
  while (rest.length) {
    const { shown, hidden } = fitStarters(
      rest,
      pages.length ? columns - BACK_CELLS : columns,
    );
    pages.push(shown);
    rest = hidden;
  }
  return pages;
}

/**
 * The page of line 1 the person turned to with "+N" / "‹". Kept in this module (the copy whose merger draws the
 * band holds it; a render hook may not write `$.state`), back to the first page as soon as all starters fit again.
 */
let bandPage = 0;

/** Turns line 1 to `page` and asks for a redraw of the band. */
function turnBandPage($: EngineInterface, page: number): void {
  bandPage = Math.max(0, page);
  try {
    $.ui.invalidate("ui.render" as never);
  } catch {
    // drawn anew with the next frame
  }
}

/** The fine rule between the lines on graphical surfaces: a 1-px hairline wider than any slot, clipped to it. */
const HAIRLINE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1" viewBox="0 0 4000 1" preserveAspectRatio="none">' +
  "<style>rect{fill:rgba(0,0,0,.12)}@media (prefers-color-scheme: dark){rect{fill:rgba(255,255,255,.14)}}</style>" +
  '<rect width="4000" height="1"/></svg>';

/**
 * The `AbovePromptList` hook that lays the band out in **two fixed lines**, both left-aligned:
 *
 * 1. **Starters** of every mod, in their order, one line that never wraps: each row shrinks and clips by itself
 *    (`LAUNCH_ROW`), statuses go first with "…"; what does not fit at all moves behind a quiet "+N": a press turns
 *    line 1 to those starters (with "‹" to turn back), no hover card.
 * 2. a hairline with inner margin, then the **meter line** (`isTrailing`, ds-usage-line), as wide as its content,
 *    which fits itself.
 *
 * Without meters only line 1; with fewer than two launcher rows the hook passes (a lone row draws itself). Other rows
 * stay stacked under the two lines. Each launcher row goes through `next` alone (the engine lets a hook only reorder
 * and leave out rows and wrap what `next(e)` returns), so presses stay with the plugin that drew the chip. A v2 or v3
 * row is drawn as it comes: a starter on line 1, an older usage row on line 2 (the column around it keeps it left).
 *
 * Several plugins carry a copy: a copy that finds a row keyed for a newer band version (`@<n>`) passes the rows
 * untouched, so the newest copy installed draws the band, whatever the chain's order.
 *
 *   on('ui.render', { component: 'AbovePromptList' }, ($, e, next) => mergeLauncherRows($, e, next))
 */
export async function mergeLauncherRows(
  $: EngineInterface,
  e: RenderInput<"AbovePromptList">,
  next: (e: RenderInput<"AbovePromptList">) => Promise<unknown>,
): Promise<unknown> {
  const rows = e.props.rows;
  const found = rows.filter(isLauncherRow);
  if (found.length < 2) return next(e);
  if (found.some((row) => bandVersion(row) > BAND_VERSION)) return next(e);
  const columns = Number(e.props.bodyColumns) || 80;
  const pages = starterPages(
    found.filter((row) => !isTrailing(row)),
    columns,
  );
  // all fit again: the next overflow starts on page 1
  if (pages.length <= 1) bandPage = 0;
  const page = Math.min(bandPage, Math.max(0, pages.length - 1));
  const shown = pages[page] ?? [];
  const after = pages.slice(page + 1).reduce((n, p) => n + p.length, 0);
  const meterRows = found.filter(isTrailing);
  const others = rows.filter((row) => !isLauncherRow(row));
  const only = async (subset: readonly BandRow[]) =>
    (await next({
      ...e,
      props: { ...e.props, rows: subset },
    })) as RenderElement;
  const starters: RenderElement[] = [];
  for (const row of shown) starters.push(await only([row]));
  const meters: RenderElement[] = [];
  for (const row of meterRows) meters.push(await only([row]));
  const rest = others.length ? await only(others) : null;
  const { Box, Text, Svg } = $.ui.resolve(e) as unknown as Els;
  const graphical =
    String((e as { surface?: string }).surface ?? "terminal") !== "terminal";
  // "+N" turns line 1 to the starters that did not fit, "‹" back: same height, nothing wraps, line 2 stays. Quiet
  // plain buttons, no hover card (it would cover the prompt).
  const { Button } = $.ui.resolve(e) as unknown as Els;
  const pager = (key: string, label: string, to: number) => (
    <Button
      key={key}
      label={label}
      plain
      onPress={() => turnBandPage($, to)}
    >
      {label}
    </Button>
  );
  const back = page > 0 ? pager("launch-back", "‹", page - 1) : null;
  const more = after ? pager("launch-more", `+${after}`, page + 1) : null;
  // Only flex props on boxes that hold other plugins' rows: the engine refuses `minWidth`/`overflow` there.
  const line1 = starters.length ? (
    <Box
      key="launch-strip"
      flexDirection="row"
      flexWrap="nowrap"
      alignItems="center"
      columnGap={starterGap(graphical)}
    >
      {back}
      {starters}
      {more}
    </Box>
  ) : null;
  // A hairline with inner margin: an Svg clipped to its slot on graphical surfaces (a Text of '─' is wider there than
  // the slot and ends in "…"), a dim line two cells short of the width in the terminal.
  const rule =
    line1 && meters.length ? (
      <Box
        key="launch-rule"
        flexDirection="row"
        paddingX={graphical ? "sm" : 1}
        paddingY={graphical ? "xs" : 0}
      >
        {graphical && Svg ? (
          <Svg source={HAIRLINE} alt="" height={1} />
        ) : (
          <Text dimColor>{"─".repeat(Math.max(1, columns - 2))}</Text>
        )}
      </Box>
    ) : null;
  // A column that sizes the meter row to its content: line 2 stands left and never stretches (older right-aligned
  // usage rows too). Only flex props: it holds another plugin's row.
  const line2 = meters.length ? (
    <Box key="launch-meters" flexDirection="column" alignItems="flex-start">
      {meters}
    </Box>
  ) : null;
  return (
    <Box key="launch-band" flexDirection="column">
      {line1}
      {rule}
      {line2}
      {rest}
    </Box>
  );
}
