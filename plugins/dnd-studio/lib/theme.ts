/**
 * Brand themes of the UI kit (lib/ui.tsx): one token set per brand and mode. Pure data, no imports: copy this file next
 * to ui.tsx when copying the kit into another plugin.
 *
 * The graphical surfaces (desktop, vscode, mobile) paint with these hex tokens; the terminal paints with theme keys
 * only (`terminalColor`), so it follows the person's terminal theme and never gets a background.
 */

/** The brand a pane wears: deltastone (company mods), neutral (Unity), dnd (D&D Studio). */
export type Brand = 'deltastone' | 'neutral' | 'dnd'

/** Light or dark painting. */
export type Mode = 'dark' | 'light'

/** What a color means. Color is for state only: ok green, warn yellow (running), bad red, info blue. */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'accent'

/** A tinted surface: fill, text/icon on it, and its border. */
export type ToneColors = { bg: string; fg: string; border: string }

/** One brand in one mode. */
export type Tokens = {
  brand: Brand
  mode: Mode
  /** Pane background (`$.ui.open({ backgroundColor })`). */
  bg: string
  /** Card fill. */
  card: string
  /** Card border, secondary button border. */
  border: string
  /** Hairlines between list rows, skeleton bars, progress track. */
  line: string
  /** Sunken well: the tab strip, inputs. */
  well: string
  /** Main text. */
  text: string
  /** Sentences under titles. */
  muted: string
  /** Meta, counts, labels, idle icons. */
  faint: string
  /** Primary button fill. */
  accent: string
  /** Text on the accent fill. */
  onAccent: string
  /** Active tab fill, accent card fill. */
  accentTint: string
  /** Text on the accent tint. */
  accentTintText: string
  /** Link-style buttons. */
  link: string
  tones: Record<Tone, ToneColors>
}

const DELTASTONE_DARK: Tokens = {
  brand: 'deltastone',
  mode: 'dark',
  bg: '#18181b',
  card: '#27272a',
  border: '#3f3f46',
  line: '#3f3f46',
  well: '#111112',
  text: '#fafafa',
  muted: '#d0d0d5',
  faint: '#a1a1aa',
  accent: '#e08918',
  onAccent: '#09090a',
  accentTint: '#382206',
  accentTintText: '#ecb670',
  link: '#e69f44',
  tones: {
    ok: { bg: '#0a2a11', fg: '#7ac88c', border: '#1d5a2a' },
    warn: { bg: '#3b2f05', fg: '#ffc107', border: '#6b5508' },
    bad: { bg: '#3b080c', fg: '#f6a0a5', border: '#811219' },
    info: { bg: '#001a2d', fg: '#91bfde', border: '#0b3a5c' },
    neutral: { bg: '#3f3f46', fg: '#d0d0d5', border: '#52525b' },
    accent: { bg: '#382206', fg: '#ecb670', border: '#7b4b0d' },
  },
}

const DELTASTONE_LIGHT: Tokens = {
  brand: 'deltastone',
  mode: 'light',
  bg: '#ffffff',
  card: '#fafafa',
  border: '#e4e4e7',
  line: '#e4e4e7',
  well: '#f4f4f5',
  text: '#27272a',
  muted: '#525252',
  faint: '#71717a',
  accent: '#e08918',
  onAccent: '#09090a',
  accentTint: '#fdf0dc',
  accentTintText: '#8a4f00',
  link: '#b86a0a',
  tones: {
    ok: { bg: '#e3f6e8', fg: '#1b7a3a', border: '#b7e4c3' },
    warn: { bg: '#fff4d6', fg: '#8a6200', border: '#f3dc9b' },
    bad: { bg: '#fde7e7', fg: '#b42323', border: '#f5b5b5' },
    info: { bg: '#e6efff', fg: '#2452b3', border: '#bcd0fb' },
    neutral: { bg: '#f4f4f5', fg: '#525252', border: '#e4e4e7' },
    accent: { bg: '#fdf0dc', fg: '#8a4f00', border: '#f5cf96' },
  },
}

const NEUTRAL_DARK: Tokens = {
  brand: 'neutral',
  mode: 'dark',
  bg: '#1c2130',
  card: '#232a3a',
  border: '#2e3648',
  line: '#2a3142',
  well: '#161a25',
  text: '#e7e9ef',
  muted: '#b9c1d1',
  faint: '#8a93a6',
  accent: '#e9ecf2',
  onAccent: '#141821',
  accentTint: '#2c3447',
  accentTintText: '#ffffff',
  link: '#a3abbd',
  tones: {
    ok: { bg: '#16341f', fg: '#6fdc8c', border: '#245c35' },
    warn: { bg: '#3a2e12', fg: '#f2c14e', border: '#5e4a1c' },
    bad: { bg: '#3d1b1d', fg: '#ff9a9a', border: '#6b2a2e' },
    info: { bg: '#1b2a46', fg: '#9dbcff', border: '#2c4472' },
    neutral: { bg: '#2a3142', fg: '#b9c1d1', border: '#3a4359' },
    accent: { bg: '#2c3447', fg: '#ffffff', border: '#3a4359' },
  },
}

const NEUTRAL_LIGHT: Tokens = {
  brand: 'neutral',
  mode: 'light',
  bg: '#ffffff',
  card: '#f7f8fa',
  border: '#e3e6ec',
  line: '#e3e6ec',
  well: '#eceef2',
  text: '#1d2230',
  muted: '#4f5869',
  faint: '#5f6878',
  accent: '#1d2230',
  onAccent: '#ffffff',
  accentTint: '#ffffff',
  accentTintText: '#1d2230',
  link: '#4f5869',
  tones: {
    ok: { bg: '#e3f6e8', fg: '#1b7a3a', border: '#b7e4c3' },
    warn: { bg: '#fff4d6', fg: '#8a6200', border: '#f3dc9b' },
    bad: { bg: '#fde7e7', fg: '#b42323', border: '#f5b5b5' },
    info: { bg: '#e6efff', fg: '#2452b3', border: '#bcd0fb' },
    neutral: { bg: '#eceef2', fg: '#4f5869', border: '#cdd2db' },
    accent: { bg: '#ffffff', fg: '#1d2230', border: '#cdd2db' },
  },
}

const DND_DARK: Tokens = {
  brand: 'dnd',
  mode: 'dark',
  bg: '#0b1a15',
  card: '#163029',
  border: '#2c4a3f',
  line: '#1f3a31',
  well: '#0d1f19',
  text: '#ece4cf',
  muted: '#b9c9be',
  faint: '#8fa595',
  accent: '#c9a253',
  onAccent: '#0b1a15',
  accentTint: '#2c4a3f',
  accentTintText: '#e2c178',
  link: '#e2c178',
  tones: {
    ok: { bg: '#1b362e', fg: '#9bb48a', border: '#3d5f52' },
    warn: { bg: '#3d2a1b', fg: '#f0b07a', border: '#6b4a2c' },
    bad: { bg: '#3a1614', fg: '#e0837d', border: '#6b2a26' },
    info: { bg: '#12261f', fg: '#b9c9be', border: '#2c4a3f' },
    neutral: { bg: '#12261f', fg: '#8fa595', border: '#2c4a3f' },
    accent: { bg: '#2c4a3f', fg: '#e2c178', border: '#3d5f52' },
  },
}

const DND_LIGHT: Tokens = {
  brand: 'dnd',
  mode: 'light',
  bg: '#f4efe2',
  card: '#fbf7ec',
  border: '#d8ccb0',
  line: '#e4dac2',
  well: '#ece4cf',
  text: '#2a2216',
  muted: '#4d4330',
  faint: '#6b6050',
  accent: '#6e5418',
  onAccent: '#fbf7ec',
  accentTint: '#ece0bf',
  accentTintText: '#5e4712',
  link: '#6e5418',
  tones: {
    ok: { bg: '#e3eedb', fg: '#3f6b2e', border: '#bcd3ad' },
    warn: { bg: '#f6e6cc', fg: '#8a5a12', border: '#e3c48f' },
    bad: { bg: '#f6dcd9', fg: '#9e3530', border: '#e3aaa5' },
    info: { bg: '#e2ebe5', fg: '#2c4a3f', border: '#b9cdc1' },
    neutral: { bg: '#ece4cf', fg: '#4d4330', border: '#d8ccb0' },
    accent: { bg: '#ece0bf', fg: '#5e4712', border: '#d8c48f' },
  },
}

/** Every brand in both modes. */
export const THEMES: Record<Brand, Record<Mode, Tokens>> = {
  deltastone: { dark: DELTASTONE_DARK, light: DELTASTONE_LIGHT },
  neutral: { dark: NEUTRAL_DARK, light: NEUTRAL_LIGHT },
  dnd: { dark: DND_DARK, light: DND_LIGHT },
}

/** The tokens of a brand in a mode. */
export function themeTokens(brand: Brand, mode: Mode): Tokens {
  return (THEMES[brand] ?? THEMES.neutral)[mode] ?? THEMES[brand].dark
}

/** Reads light/dark off the engine's `theme` setting (`dark`, `light-daltonized`, …); undefined when it cannot tell. */
export function modeFromTheme(value: unknown): Mode | undefined {
  const v = String(value ?? '').toLowerCase()
  if (v.includes('light')) return 'light'
  if (v.includes('dark')) return 'dark'
  return undefined
}

/** Terminal colors: theme keys for state (they follow the terminal theme), the brand accent as hex. */
export function terminalColor(brand: Brand, tone: Tone): string | undefined {
  if (tone === 'ok') return 'success'
  if (tone === 'warn') return 'warning'
  if (tone === 'bad') return 'error'
  if (tone === 'info') return 'suggestion'
  if (tone === 'accent') return brand === 'deltastone' ? '#e08918' : brand === 'dnd' ? '#c9a253' : undefined
  return undefined
}

/**
 * Tokens that follow the app window instead of guessing its mode. The engine tells no plugin whether the desktop
 * window is light or dark (its `theme` setting can stay dark on a light window, and `overrideColorScheme` is ignored
 * by the desktop), and native buttons always follow the window. So graphical surfaces paint no fills of their own and
 * name theme keys (`text`, `inactive`, `success` …), which the app resolves for its current mode. Svg cannot take a
 * theme key: `schemeSvg` gives every key used as `fill`/`stroke`/`stop-color` a light color and a dark one under
 * `@media (prefers-color-scheme: dark)`. Fills only a Svg can paint (pill backgrounds) are named `tone-<tone>-bg`.
 */
export function windowTokens(brand: Brand): Tokens {
  const tone = (fg: string, t: Tone): ToneColors => ({ fg, bg: `tone-${t}-bg`, border: fg })
  return {
    brand,
    mode: 'dark',
    bg: '',
    card: '',
    border: 'subtle',
    line: 'subtle',
    well: '',
    text: 'text',
    muted: 'text',
    faint: 'inactive',
    accent: 'claude',
    onAccent: 'inverseText',
    accentTint: '',
    accentTintText: 'claude',
    link: 'claude',
    tones: {
      ok: tone('success', 'ok'),
      warn: tone('warning', 'warn'),
      bad: tone('error', 'bad'),
      info: tone('suggestion', 'info'),
      neutral: tone('inactive', 'neutral'),
      accent: tone('claude', 'accent'),
    },
  }
}

/** Whether a color is one a Box or Text can paint (a hex or a theme key), not a Svg-only name. */
export function boxPaint(color: string | undefined): string | undefined {
  if (!color || color.startsWith('tone-')) return undefined
  return color
}

/** The light and dark color of each name `windowTokens` hands to a Svg. */
export function schemeColors(brand: Brand): Record<string, { light: string; dark: string }> {
  const l = themeTokens(brand, 'light')
  const d = themeTokens(brand, 'dark')
  const pick = (f: (t: Tokens) => string) => ({ light: f(l), dark: f(d) })
  const out: Record<string, { light: string; dark: string }> = {
    text: pick((t) => t.text),
    inactive: pick((t) => t.faint),
    subtle: pick((t) => t.line),
    claude: pick((t) => t.link),
    inverseText: pick((t) => t.onAccent),
    success: pick((t) => t.tones.ok.fg),
    warning: pick((t) => t.tones.warn.fg),
    error: pick((t) => t.tones.bad.fg),
    suggestion: pick((t) => t.tones.info.fg),
  }
  for (const tone of ['ok', 'warn', 'bad', 'info', 'neutral', 'accent'] as const)
    out[`tone-${tone}-bg`] = pick((t) => t.tones[tone].bg)
  return out
}

/**
 * Adds a `<style>` to a Svg document for every scheme name it paints with (`fill="text"`, `stroke="success"` …): the
 * light color, then the dark one under `@media (prefers-color-scheme: dark)`. A CSS rule beats the (invalid)
 * presentation attribute, so the name never shows. Svg without such names is returned unchanged.
 */
export function schemeSvg(source: string, brand: Brand = 'dnd'): string {
  const colors = schemeColors(brand)
  const used = new Map<string, Set<string>>()
  for (const m of source.matchAll(/\s(fill|stroke|stop-color)="([a-zA-Z][\w-]*)"/g)) {
    const [, prop, name] = m
    if (!prop || !name || !colors[name]) continue
    if (!used.has(name)) used.set(name, new Set())
    used.get(name)!.add(prop)
  }
  if (!used.size) return source
  const rules = (mode: 'light' | 'dark') =>
    [...used]
      .flatMap(([name, props]) => [...props].map((p) => `[${p}="${name}"]{${p}:${colors[name]![mode]}}`))
      .join('')
  const style = `<style>${rules('light')}@media (prefers-color-scheme: dark){${rules('dark')}}</style>`
  return source.replace(/^(<svg\b[^>]*>)/i, `$1${style}`)
}
