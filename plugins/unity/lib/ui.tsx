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
 *
 * Places, not only parts (design rules R1–R10, kit 3): the kit decides where things stand.
 * - Rank of a button (R1): every `Action` names its `variant`: `primary` (one per card, the action the card is for),
 *   `secondary` (triggers something), `link` (shows, opens, reloads, folds). A two-step action keeps its look while it
 *   asks; `danger` is secondary with ⚠ and never primary. `Actions` takes `{ primary, secondary, links }`, orders them
 *   and hides text actions behind "…" first. Fixed helpers: `reloadAction` („Neu laden“), `openAction` („↗ Öffnen“),
 *   `askAction` (label stays, „geschickt“ is a pill). Marks before a label only ↑ ↓ ↗ ▶ ⚠ (never ✓).
 * - A list row (R3): `ListRow` shows at most two actions on the right; `details` (and every further action) unfolds
 *   under the row behind the text action „Details“ / „Schließen“ at a fixed place. `indent` draws trees, `check` a row
 *   to tick. Meta keeps a minimum width and moves under the title on narrow bodies.
 * - Forms, filters, switches (R1, R4): `Field` (label | field | button, one input per row), `SelectRow` (a select
 *   that cuts long values in the middle), `Form` (values, selects and fields in one label grid), `SearchField` (no
 *   label, an example as placeholder), `Segment` (a filter switch that never uses `primary`), `Toggle` (a setting as a
 *   row with its state on the right).
 * - Words (R6, R10): the fixed words are in `KIT_STRINGS` (reload, open, details, close, cancel, askClaude), foreign
 *   status words go through `translateStatus`. `tests/kit-rules.ts` counts the rules on a drawing (copy it too).
 * - A card (R2): `Card(k, { title, filter, children, empty, hint, status, actions })` lays its parts out in that one
 *   order; the status line is always there when the card has actions, the action row is its last line. A `KeyValue`
 *   or `ErrorState` in a card has no frame of its own.
 */
import { atom, read, update } from 'claude-code'
import type { RenderInput, EngineInterface, RenderElement } from 'claude-code'

import type { AskedState, UiKitState } from '../types'
import { glyphLabel, ICON_GLYPHS, ICONS, iconSvg, svgDocument, TERM_GLYPHS, type IconName } from './icons'
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
} from './theme'

export { glyphLabel, ICON_GLYPHS, ICONS, iconSvg, isIconName, svgDocument, TERM_GLYPHS, type IconName } from './icons'
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
} from './theme'

/** The kit state plus the question of the pending confirm (kept here, so a plugin's `types` need no new field). */
type UiState = UiKitState & { confirmText?: string }

const EMPTY_UI: UiState = { toggled: [], more: [], details: [], logMore: [] }
// On copy into another plugin: change the plugin name (it must stay a string literal).
const uiAtom = atom({ plugin: 'unity', key: 'ui' } as const, EMPTY_UI, { shape: 'ui-1' })

// --- text helpers ---

/** Strips ANSI escapes and control characters (a Pane refuses a Text holding one); tabs become spaces. */
export function sanitize(text: unknown): string {
  return (
    String(text ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[@-_]?/g, '')
      .replace(/\t/g, '  ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, '')
  )
}

/** Sanitizes, keeps the first line and cuts to `width` columns with a trailing `…`. */
export function truncate(text: unknown, width: number): string {
  const line = sanitize(text).split('\n')[0] ?? ''
  const w = Math.max(1, Math.floor(width))
  const chars = [...line]
  return chars.length <= w ? line : `${chars.slice(0, w - 1).join('')}…`
}

/** Sanitizes and word-wraps prose to `width` columns (long words are cut); for wiki pages and messages. */
export function wrapText(text: unknown, width: number): string[] {
  const w = Math.max(4, Math.floor(width))
  const out: string[] = []
  for (const raw of sanitize(text).split('\n')) {
    const lead = /^\s*/.exec(raw)?.[0] ?? ''
    let line = ''
    for (const word of raw.trim().split(/\s+/).filter(Boolean)) {
      let rest = word
      while ([...rest].length > w - lead.length) {
        if (line) out.push(lead + line)
        line = ''
        const cut = w - lead.length - 1
        out.push(`${lead}${[...rest].slice(0, cut).join('')}…`)
        rest = [...rest].slice(cut).join('')
      }
      const next = line ? `${line} ${rest}` : rest
      if ([...(lead + next)].length > w) {
        out.push(lead + line)
        line = rest
      } else line = next
    }
    out.push(line ? lead + line : '')
  }
  return out
}

// --- glyphs ---

export type Status = 'ok' | 'failed' | 'running' | 'pending' | 'idle' | 'update' | 'warning'
export type Color = 'green' | 'red' | 'yellow' | undefined

const GLYPH: Record<Status, { char: string; color: Color; dim?: boolean }> = {
  ok: { char: '✓', color: 'green' },
  failed: { char: '✗', color: 'red' },
  running: { char: '●', color: 'yellow' },
  pending: { char: '●', color: 'yellow' },
  idle: { char: '○', color: undefined, dim: true },
  update: { char: '↑', color: 'yellow' },
  warning: { char: '⚠', color: 'yellow' },
}

/** The glyph character and color of a status. */
export function glyphOf(status: Status): { char: string; color: Color; dim?: boolean } {
  return GLYPH[status]
}

// --- kit ---

type El = (props: Record<string, unknown>) => RenderElement

type Els = {
  Box: El
  Text: El
  Button: El
  /** Absent on the terminal. */
  Svg?: El
  Progress?: El
  /** Form elements and the engine's link; absent where a surface has none (the kit then falls back or leaves out). */
  Input?: El
  Select?: El
  Link?: El
}

/** Kit texts; `lang` picks the set. English is the v1 wording. */
export type KitStrings = {
  cancel: string
  really: (label: string) => string
  details: string
  hideDetails: string
  retry: string
  more: string
  log: string
  hideLog: string
  copy: string
  loading: string
  showMore: (hidden: number) => string
  showLess: string
  wrong: string
  /** Fixed words (R6): re-read the pane's data, open something external, a sent prompt's state. */
  reload: string
  open: string
  sent: string
  /** Folds an unfolded row or view again (R6: „Details“ / „Schließen“). */
  close: string
  /** The button of a search field, and a setting's two states and its text action. */
  search: string
  on: string
  off: string
  toggle: string
  /** The deed of a setting's text action: what a press does (`Toggle`). */
  turnOn: string
  turnOff: string
  /** The one label of a button that hands Claude a task (R6). */
  askClaude: string
}

export const KIT_STRINGS: Record<'en' | 'de', KitStrings> = {
  en: {
    cancel: 'Cancel',
    really: label => `Really ${label.toLowerCase()}?`,
    details: 'Details',
    hideDetails: 'Hide details',
    retry: 'Retry',
    more: 'More',
    log: 'Log',
    hideLog: 'Hide log',
    copy: 'Copy',
    loading: 'Loading…',
    showMore: n => `Show more (${n} earlier)`,
    showLess: 'Show less',
    wrong: 'Something went wrong.',
    reload: 'Reload',
    open: 'Open',
    sent: 'sent',
    close: 'Close',
    search: 'Search',
    on: 'on',
    off: 'off',
    toggle: 'Switch',
    turnOn: 'Turn on',
    turnOff: 'Turn off',
    askClaude: 'Ask Claude',
  },
  de: {
    cancel: 'Abbrechen',
    really: label => `Wirklich ${label.toLowerCase()}?`,
    details: 'Details',
    hideDetails: 'Schließen',
    retry: 'Erneut versuchen',
    more: 'Mehr',
    log: 'Log',
    hideLog: 'Log ausblenden',
    copy: 'Kopieren',
    loading: 'Lädt …',
    showMore: n => `Mehr zeigen (${n} frühere)`,
    showLess: 'Weniger',
    wrong: 'Etwas ist schiefgegangen.',
    reload: 'Neu laden',
    open: 'Öffnen',
    sent: 'geschickt',
    close: 'Schließen',
    search: 'Suchen',
    on: 'an',
    off: 'aus',
    toggle: 'Umschalten',
    turnOn: 'Einschalten',
    turnOff: 'Ausschalten',
    askClaude: 'An Claude',
  },
}

/** Options of `kit()`. */
export type KitOptions = {
  /** Brand tokens to paint with (default `neutral`). */
  brand?: Brand
  /** `auto` (default) reads the engine's `theme` setting; unknown there → dark. */
  mode?: Mode | 'auto'
  /** Kit texts (default `en`). */
  lang?: 'en' | 'de'
}

export type Kit = Els & {
  Box: El
  Text: El
  Button: El
  /** Columns of the pane body (`e.props.bodyColumns`, else the viewport's). */
  cols: number
  /** Rows of the pane body (`e.props.scroll.bodyRows`, else the viewport's). */
  rows: number
  /** Narrow or mobile: one column, secondary text hidden. */
  compact: boolean
  /** Very narrow (under 48 columns, the 320 px board): buttons stack, tabs lose icons, header loses its label. */
  narrow: boolean
  surface: string
  /** The surface draws `Svg` (desktop, vscode, mobile): cards, pills and icons are painted. */
  graphical: boolean
  brand: Brand
  mode: Mode
  /** Brand tokens for the mode. */
  t: Tokens
  /** Kit texts. */
  s: KitStrings
  state: UiKitState
  isOpen: (key: string, defaultOpen?: boolean) => boolean
  toggle: (key: string) => void
  isMore: (key: string) => boolean
  toggleMore: (key: string) => void
  /** Drops every "more" entry starting with `prefix`, then adds `key` when given (one write). */
  setMore: (prefix: string, key?: string) => void
  /** The page a paged strip (Tabs) was turned to; undefined = follow the active tab. */
  pageOf?: (key: string) => number | undefined
  setPage?: (key: string, page: number | undefined) => void
  isConfirming: (key: string) => boolean
  /** Arms a two-step button; `text` is its question, shown in the fixed `StatusLine` (never as a new line). */
  askConfirm: (key: string, text?: string) => void
  clearConfirm: () => void
  /**
   * One press of a two-step button, decided on the kit state at press time (not at render time): asks when nothing is
   * pending, confirms when this key's question already stands. A desktop button can keep the handler of the step
   * before (same key, re-rendered as the question): with this, such a press confirms instead of asking again
   * (unity Runde 3: the first click on „Sperre … lösen?“ did nothing).
   */
  pressConfirm: (key: string, onConfirm: () => void, text?: string) => void
  hasDetails: (key: string) => boolean
  toggleDetails: (key: string) => void
  isLogMore: (key: string) => boolean
  toggleLogMore: (key: string) => void
  /** Copies text to the clipboard of the surface a press came from. */
  copy: (text: string, surface?: string) => void
  /** Runs `fn` after `ms` (the engine's clock); absent in a kit built without `$`: then a caller runs it at once. */
  later?: (ms: number, fn: () => void) => void
  /** Prompts sent to Claude whose answer has not ended yet (section „ask Claude“); read here so a render redraws. */
  asked: AskedState
  /** The render input this kit was built for: what every kit of one drawing shares (a pane and its parts). */
  draw?: object
}

function flip(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter(k => k !== key) : [...list, key]
}

/**
 * A press of a two-step button with key `key` while `pending` is the question standing now: confirm (and clear) when
 * it is this key's, else ask. Decided at press time, see {@link Kit.pressConfirm}.
 */
export function confirmStep(pending: string | undefined, key: string): { fire: boolean; confirm: string | undefined } {
  return pending === key ? { fire: true, confirm: undefined } : { fire: false, confirm: key }
}

/** Patches the kit state (exported for tests and for actions that reset a confirm). */
export async function patchUi(
  $: EngineInterface,
  patch: Partial<UiState> | ((s: UiState) => Partial<UiState>),
): Promise<void> {
  await update($, uiAtom, s => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
}

/** Light or dark from the engine's `theme` setting; dark when it cannot tell. */
export async function detectMode($: EngineInterface): Promise<Mode> {
  try {
    const rows = await $.config.list()
    return modeFromTheme(rows.find(row => row.key === 'theme')?.value) ?? 'dark'
  } catch {
    return 'dark'
  }
}

/** Copies through the engine; a refused copy is ignored. */
async function copyText($: EngineInterface, text: string, surface?: string): Promise<void> {
  try {
    await $.ui.copy({ text, ...(surface ? { surface } : {}) } as never)
  } catch {
    // nothing to copy to on this surface
  }
}

/** Builds the kit for one render: elements, body size, brand tokens and kit state (subscribes the drawing to it). */
export async function kit(
  $: EngineInterface,
  e: RenderInput<'Pane'> | RenderInput<'AbovePrompt'>,
  opts: KitOptions = {},
): Promise<Kit> {
  const els = $.ui.resolve(e) as unknown as Els
  const state = await read($, uiAtom)
  const props = (e as { props?: { bodyColumns?: number; scroll?: { bodyRows?: number } } }).props ?? {}
  const viewport = (e as { viewport?: { columns?: number; rows?: number } }).viewport
  const cols = Math.max(20, props.bodyColumns ?? viewport?.columns ?? 80)
  const rows = Math.max(8, props.scroll?.bodyRows ?? viewport?.rows ?? 30)
  const surface = String((e as { surface?: string }).surface ?? 'terminal')
  const graphical = surface !== 'terminal' && typeof els.Svg === 'function'
  const brand = opts.brand ?? 'neutral'
  const mode: Mode =
    opts.mode === 'dark' || opts.mode === 'light' ? opts.mode : graphical ? await detectMode($) : 'dark'
  // the status line holds one row: a question that does not fit it is also toasted in full (a toast moves nothing)
  const tellQuestion = (text?: string) => {
    if (!text || [...text].length <= cols) return
    try {
      $.ui.toast(text)
    } catch {
      // no toast on this surface
    }
  }
  return {
    Box: els.Box,
    Text: els.Text,
    Button: els.Button,
    Svg: els.Svg,
    Progress: els.Progress,
    Input: els.Input,
    Select: els.Select,
    Link: els.Link,
    cols,
    rows,
    compact: surface === 'mobile' || cols < 60,
    narrow: cols < 48,
    surface,
    graphical,
    brand,
    mode,
    t: graphical && opts.mode !== 'dark' && opts.mode !== 'light' ? windowTokens(brand) : themeTokens(brand, mode),
    s: KIT_STRINGS[opts.lang ?? 'en'],
    state,
    isOpen: (key, defaultOpen = true) => (state.toggled.includes(key) ? !defaultOpen : defaultOpen),
    toggle: key => void patchUi($, s => ({ toggled: flip(s.toggled, key) })),
    isMore: key => state.more.includes(key),
    toggleMore: key => void patchUi($, s => ({ more: flip(s.more, key) })),
    setMore: (prefix, key) =>
      void patchUi($, s => ({ more: [...s.more.filter(x => !x.startsWith(prefix)), ...(key ? [key] : [])] })),
    pageOf: key => state.pages?.[key],
    setPage: (key, page) =>
      void patchUi($, s => {
        const pages = { ...(s.pages ?? {}) }
        if (page === undefined) delete pages[key]
        else pages[key] = page
        return { pages }
      }),
    isConfirming: key => state.confirm === key,
    askConfirm: (key, text) => {
      void patchUi($, { confirm: key, confirmText: text })
      tellQuestion(text)
    },
    clearConfirm: () => void patchUi($, { confirm: undefined, confirmText: undefined }),
    pressConfirm: (key, onConfirm, text) =>
      void (async () => {
        let fire = false
        await patchUi($, s => {
          const step = confirmStep(s.confirm, key)
          fire = step.fire
          return { confirm: step.confirm, confirmText: step.confirm === undefined ? undefined : text }
        })
        if (fire) onConfirm()
        else tellQuestion(text)
      })(),
    hasDetails: key => state.details.includes(key),
    toggleDetails: key => void patchUi($, s => ({ details: flip(s.details, key) })),
    isLogMore: key => state.logMore.includes(key),
    toggleLogMore: key => void patchUi($, s => ({ logMore: flip(s.logMore, key) })),
    copy: (text, at) => void copyText($, text, at),
    later: (ms, fn) => {
      try {
        $.clock.after(ms, fn)
      } catch {
        fn()
      }
    },
    asked: await read($, askedAtom),
    draw: typeof e === 'object' && e !== null ? e : undefined,
  }
}

// --- painting helpers ---

type Kid = RenderElement | null | false | undefined
type Kids = Kid[] | RenderElement | null

function kids(children: Kids | undefined): RenderElement[] {
  return (Array.isArray(children) ? children : [children]).filter(Boolean) as RenderElement[]
}

/** A tone's text color on this surface: brand hex when painted, a theme key on the terminal. */
/**
 * The gap between the lines of a wrapped row of buttons or pills on graphical surfaces (seen in the app: the lines of a
 * wrapped action row touched). The terminal keeps its `gap`.
 */
function lineGap(k: Kit): { rowGap?: Space } {
  return k.graphical ? { rowGap: 'sm' } : {}
}

type DrawnNode = { props?: { key?: unknown }; children?: unknown[] }

/** Whether a drawn tree holds an element with this key (a card looks for the two-step button that asks). */
function holdsKey(node: unknown, key: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(n => holdsKey(n, key))
  const el = node as DrawnNode
  return el.props?.key === key || (el.children ?? []).some(c => holdsKey(c, key))
}

/**
 * The states (one per drawing) in which a card shows the pending two-step question: `PaneBody`, built after its
 * cards, then leaves the question out of its own line, so it stands once.
 */
const QUESTION_IN_CARD = new WeakSet<object>()
/**
 * The same claim per drawing (the render input, `k.draw`) and button key: a pane whose parts each build a kit of their
 * own (the hub and its tabs) reads the kit state once per kit, so the state object of the card's kit is not the pane's.
 */
const QUESTION_IN_DRAW = new WeakMap<object, Set<string>>()

function claimQuestion(k: Kit, key: string): void {
  QUESTION_IN_CARD.add(k.state as object)
  if (!k.draw) return
  const keys = QUESTION_IN_DRAW.get(k.draw) ?? new Set<string>()
  keys.add(key)
  QUESTION_IN_DRAW.set(k.draw, keys)
}

function questionClaimed(k: Kit): boolean {
  if (QUESTION_IN_CARD.has(k.state as object)) return true
  const pending = k.state.confirm
  return pending !== undefined && !!k.draw && !!QUESTION_IN_DRAW.get(k.draw)?.has(pending)
}

export function toneColor(k: Kit, tone: Tone): string | undefined {
  return k.graphical ? k.t.tones[tone].fg : terminalColor(k.brand, tone)
}

/** Text color of a role: hex when painted, the surface's own on the terminal. */
function ink(k: Kit, role: 'text' | 'muted' | 'faint'): string | undefined {
  return k.graphical ? k.t[role] : undefined
}

/** The tone a status reads as. */
export function toneOf(status: Status): Tone {
  if (status === 'ok') return 'ok'
  if (status === 'failed') return 'bad'
  if (status === 'idle') return 'neutral'
  return 'warn'
}

const STATUS_ICON: Record<Status, IconName> = {
  ok: 'checkCircle',
  failed: 'xCircle',
  running: 'clock',
  pending: 'clock',
  idle: 'circle',
  update: 'up',
  warning: 'alert',
}

/** The icon a status reads as (error rows: cross in a circle). */
export function statusIcon(status: Status): IconName {
  return STATUS_ICON[status]
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
  const { Text } = k
  const Svg = k.Svg
  if (k.graphical && Svg) {
    const size = opts.size ?? 16
    const color = opts.color ?? (opts.tone ? k.t.tones[opts.tone].fg : k.t.faint)
    return <Svg source={iconSvg(name, color, size)} alt={opts.alt ?? name} width={size} height={size} />
  }
  const glyph = TERM_GLYPHS[name]
  if (!glyph) return null
  return (
    <Text color={opts.tone ? terminalColor(k.brand, opts.tone) : undefined} dimColor={opts.tone ? undefined : true}>
      {glyph}
    </Text>
  )
}

/**
 * Default mark of a pill per tone: ✓ ok, ◷ warn (yellow means "running" here), ✕ bad, ● info. The mark follows the
 * meaning, not the color: a real warning passes `icon: 'alert'` (or `glyph: '⚠'`), an update `glyph: '↑'`.
 */
const TONE_GLYPH: Record<Tone, string> = { ok: '✓', warn: '◷', bad: '✕', info: '●', neutral: '', accent: '' }
/** Default icon of a pill per tone on graphical surfaces (in place of the glyph), unless `glyph` or `icon` is given. */
const TONE_ICON: Partial<Record<Tone, IconName>> = { warn: 'clock' }

export type PillProps = {
  text: string
  tone?: Tone
  /** The mark before the text; `false` for none. Default per tone (TONE_GLYPH). */
  glyph?: string | false
  /** An icon in place of the glyph on graphical surfaces. Default per tone (TONE_ICON: warn → clock). */
  icon?: IconName
  /**
   * Makes the pill pressable, and visibly so: a native Button "<mark> <text> ›" (secondary on graphical surfaces: an
   * Svg takes no press and may not sit in a Button; the terminal keeps the tone color). `key` addresses it.
   */
  onPress?: () => void
  key?: string
}

/** Escapes text for SVG markup. */
function xmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Pill geometry (CSS px): height, font size, side padding, icon size, estimated advance per character. */
const PILL = { h: 20, font: 12, pad: 8, icon: 12, gap: 4, radius: 4 } as const

/** Estimated advance of one character at 12 px semibold system font (narrow, digits, capitals, rest). */
function charWidth(c: string): number {
  if (/[ilIj.,:;'!|·\s]/.test(c)) return 3.4
  if (/[ft()\[\]r]/.test(c)) return 4.4
  if (/[0-9]/.test(c)) return 6.9
  if (/[mwMW]/.test(c)) return 9.6
  if (/[A-ZÄÖÜ]/.test(c)) return 7.8
  return 7.1
}

/**
 * The `<svg>` document of a graphical pill: a slightly rounded tinted rect (`rx` = PILL.radius), an optional icon at
 * the left and the text in the system font, both in the tone color. Width estimated from the text length; the text is
 * centred in its room so an estimate that is off spreads over both sides instead of eating the right padding.
 */
export function pillSvg(text: string, fg: string, bg: string, icon?: IconName): { source: string; width: number } {
  const iconW = icon ? PILL.icon + PILL.gap : 0
  const textW = [...text].reduce((w, c) => w + charWidth(c), 0)
  const width = Math.ceil(PILL.pad * 2 + iconW + textW)
  const scale = PILL.icon / 24
  const top = (PILL.h - PILL.icon) / 2
  const mark = icon
    ? `<g transform="translate(${PILL.pad} ${top}) scale(${scale})" fill="none" stroke="${fg}" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round">${(ICONS[icon] ?? '').replace(/currentColor/g, fg)}</g>`
    : ''
  const source = svgDocument(
    `<svg viewBox="0 0 ${width} ${PILL.h}"><rect width="${width}" height="${PILL.h}" rx="${PILL.radius}" ` +
      `fill="${bg}"></rect>${mark}<text x="${PILL.pad + iconW + textW / 2}" text-anchor="middle" ` +
      `y="${PILL.h / 2 + PILL.font * 0.35}" ` +
      `font-family="-apple-system, Segoe UI, sans-serif" font-size="${PILL.font}" font-weight="600" ` +
      `fill="${fg}">${xmlText(text)}</text></svg>`,
  )
  return { source, width }
}

/**
 * A state pill: tinted chip with a mark (✓ ◷ ↑ ⚠ ✕) and a short sentence ("3 rot · 2 neu"). Graphical: one
 * non-pressable `Svg` (a rounded rect, `rx` = half height; a Box has no corner radius without a border, and a bordered
 * Box grows to three rows on a desktop), `alt` = the text; `shrink` cuts the text beforehand (an image does not
 * shrink). Terminal: a colored Text.
 */
export function Pill(k: Kit, p: PillProps & { shrink?: boolean }): RenderElement {
  const { Box, Text } = k
  const tone = p.tone ?? 'neutral'
  const glyph = p.glyph === false ? '' : (p.glyph ?? TONE_GLYPH[tone])
  const Svg = k.Svg
  if (p.onPress) {
    const { Button } = k
    const label = `${glyph ? `${glyph} ` : ''}${(sanitize(p.text).split('\n')[0] ?? '').trim()} ›`
    return (
      <Button
        key={p.key ?? `pill-${p.text}`}
        label={label}
        plain={k.graphical ? undefined : true}
        variant={k.graphical ? 'secondary' : undefined}
        onPress={p.onPress}
      >
        {k.graphical ? label : <Text color={terminalColor(k.brand, tone)}>{label}</Text>}
      </Button>
    )
  }
  if (!k.graphical || !Svg) {
    return (
      <Text color={terminalColor(k.brand, tone)} dimColor={tone === 'neutral' ? true : undefined}>
        {truncate(glyph ? `${glyph} ${p.text}` : p.text, Math.max(4, Math.floor(k.cols / 2)))}
      </Text>
    )
  }
  const c = k.t.tones[tone]
  const iconName = p.icon ?? (p.glyph === undefined ? TONE_ICON[tone] : undefined)
  const raw = sanitize(!iconName && glyph ? `${glyph} ${p.text}` : p.text).split('\n')[0] ?? ''
  const text = p.shrink ? truncate(raw, Math.max(6, Math.floor(k.cols / 3))) : raw
  const pic = pillSvg(text, c.fg, c.bg, iconName)
  return (
    <Box flexDirection="row" alignItems="center" flexShrink={p.shrink ? 1 : 0} minWidth={p.shrink ? 0 : undefined}>
      <Svg source={pic.source} alt={text} width={pic.width} height={PILL.h} />
    </Box>
  )
}

/**
 * What a framed block (KeyValue, the v2 ErrorState) is drawn as inside a card: no frame of its own (R2: no card in a
 * card). `Card` swaps its direct children for these.
 */
const IN_CARD = new WeakMap<object, RenderElement>()

/** The frameless form of a child when it sits in a card. */
function inCard(child: RenderElement): RenderElement {
  return typeof child === 'object' && child !== null ? (IN_CARD.get(child as object) ?? child) : child
}

export type CardTitleProps = {
  icon?: IconName
  /** A name, not a sentence. */
  title: string
  /** One quiet line under the title (what the card is about, a time span). */
  subtitle?: string
  /** Right of the title: a number, or (instead) a status pill. With both, the pill stands. */
  count?: number | string
  pill?: PillProps
  tone?: Tone
}

export type CardProps = {
  key?: string
  tone?: Tone
  gap?: number
  /** The title row (R2): a name, or the full `CardTitle` props. */
  title?: string | CardTitleProps
  /** Under the title: the card's switch or search field (`Segment`, `SearchField`). */
  filter?: Kid
  /** The content. */
  children?: Kids
  /** A calm sentence drawn instead of the content when there is none (R8). */
  empty?: string
  /** At most one hint, pale, above the status line (R7). No instructions, no button names. */
  hint?: string
  /**
   * The card's status line: „läuft“, result, error and the question of the two-step button it holds (in its actions
   * or in its content). Graphical surfaces draw it only when it says something; the terminal keeps one (blank) row
   * whenever the card has `actions`. `false` leaves it out.
   */
  status?: StatusInfo | string | null | false
  /** The one action row, the card's last line (R2), by rank; a list is sorted by rank. */
  actions?: Action[] | ActionGroups
  /** How many actions stand before "…" (3). */
  maxActions?: number
  /** The actions stay in the order given (a list, or the groups main → secondary → text) instead of sorted by rank. */
  keepOrder?: boolean
}

/**
 * A card: framed, filled, rounded box (tone tints it, e.g. `bad` for a problem). The terminal draws no frame.
 *
 * Give it its parts by name and the kit puts them in the one order every card has (R2): `title` → `filter` →
 * content (`children`, or the `empty` sentence) → `hint` → `status` → `actions`. A card built from free `children`
 * alone keeps working as before. A `KeyValue` or a v2 `ErrorState` among the children loses its own frame.
 */
export function Card(k: Kit, c: CardProps): RenderElement {
  const { Box } = k
  const body = kids(c.children).map(inCard)
  const given = c.actions ? (Array.isArray(c.actions) ? c.actions : rankedActions(c.actions)) : []
  const acts = c.keepOrder ? given : sortByRank(given)
  const id = c.key ?? 'card'
  let status: RenderElement | null = null
  if (!k.graphical) {
    if (c.status !== false && (c.status !== undefined || acts.length))
      status = StatusLine(k, { key: `${id}-status`, status: c.status, keys: acts.map(a => a.key) })
  } else if (c.status !== false) {
    // No reserved empty line (seen in the app: a hole above every action row): the line is drawn only when it says
    // something. The question of a two-step button stands in the card that holds the button, in its action row or
    // in its content (a list row), and then nowhere else.
    const pending = k.state.confirm
    const asks =
      pending !== undefined &&
      !!(k.state as UiState).confirmText &&
      (acts.some(a => a.key === pending) || holdsKey(body, pending))
    const text = typeof c.status === 'string' ? c.status : c.status?.text
    if (asks && pending !== undefined) claimQuestion(k, pending)
    if (asks || text)
      status = StatusLine(k, {
        key: `${id}-status`,
        status: c.status,
        keys: asks && pending !== undefined ? [pending] : [],
      })
  }
  const parts: Kid[] = [
    c.title !== undefined
      ? CardTitle(k, typeof c.title === 'string' ? { title: c.title, tone: c.tone } : c.title)
      : null,
    c.filter ?? null,
    ...(body.length ? body : c.empty ? [Sentence(k, c.empty, { faint: true })] : []),
    c.hint ? Sentence(k, c.hint, { faint: true }) : null,
    status,
    acts.length ? Actions(k, id, acts, c.maxActions ?? 3) : null,
  ]
  if (!k.graphical)
    return (
      <Box key={c.key} flexDirection="column">
        {kids(parts)}
      </Box>
    )
  const fill = c.tone ? k.t.tones[c.tone].bg : k.t.card
  const border = c.tone ? k.t.tones[c.tone].border : k.t.border
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
      {kids(parts)}
    </Box>
  )
}

/**
 * Card title row: icon left, title, directly after it a quiet count ("Stapel · 2") or (instead) a pill on the right;
 * `subtitle` is a quiet line of its own under it.
 */
export function CardTitle(k: Kit, c: CardTitleProps): RenderElement {
  const { Box, Text } = k
  const count = c.pill || c.count === undefined || c.count === '' ? '' : String(c.count)
  if (!k.graphical) {
    const room = Math.max(4, k.cols - (count ? [...count].length + 1 : 0) - (c.pill ? [...c.pill.text].length + 4 : 0))
    const row = (
      <Box flexDirection="row" gap={1}>
        <Text bold color={c.tone ? terminalColor(k.brand, c.tone) : undefined}>
          {truncate(c.title, room)}
        </Text>
        {count ? <Text dimColor>{count}</Text> : null}
        {c.pill ? Pill(k, c.pill) : null}
      </Box>
    )
    if (!c.subtitle) return row
    return (
      <Box flexDirection="column">
        {row}
        <Text dimColor>{truncate(c.subtitle, k.cols)}</Text>
      </Box>
    )
  }
  const row = (
    <Box flexDirection="row" alignItems="center" gap={1}>
      {c.icon ? Icon(k, c.icon, { tone: c.tone, color: c.tone ? undefined : k.t.faint }) : null}
      <Box flexShrink={1} minWidth={0}>
        <Text weight="bold" color={c.tone ? k.t.tones[c.tone].fg : k.t.text} wrap="truncate-end">
          {sanitize(c.title)}
        </Text>
      </Box>
      {/* one form for a count: the quiet number directly after the title ("Stapel · 2"), never at the far right */}
      {count ? (
        <Text size="caption" color={k.t.faint}>
          {`· ${sanitize(count)}`}
        </Text>
      ) : null}
      <Box flexGrow={1} />
      {c.pill ? Pill(k, c.pill) : null}
    </Box>
  )
  if (!c.subtitle) return row
  return (
    <Box flexDirection="column" gap={0}>
      {row}
      <Text size="footnote" color={k.t.faint} wrap="wrap">
        {sanitize(c.subtitle)}
      </Text>
    </Box>
  )
}

/** A sentence in a card ("409 von 412 grün · Lauf vor 4 min"): wrapped, muted. */
export function Sentence(
  k: Kit,
  text: string,
  opts: { tone?: Tone; faint?: boolean; wrap?: 'wrap' | 'truncate-end' } = {},
): RenderElement {
  const { Text } = k
  if (!k.graphical)
    return (
      <Text color={opts.tone ? terminalColor(k.brand, opts.tone) : undefined} dimColor={opts.faint ? true : undefined}>
        {wrapText(text, k.cols).join('\n')}
      </Text>
    )
  // The Box keeps a long sentence inside the card: without minWidth 0 a flex child may grow past the pane.
  const { Box } = k
  return (
    <Box flexDirection="column" flexShrink={1} minWidth={0}>
      <Text
        size="footnote"
        color={opts.tone ? k.t.tones[opts.tone].fg : ink(k, opts.faint ? 'faint' : 'muted')}
        wrap={opts.wrap ?? 'wrap'}
      >
        {sanitize(text)}
      </Text>
    </Box>
  )
}

export type IconAction = {
  key: string
  icon: IconName
  label: string
  onPress: () => void
  /** `primary` marks a knob whose view is open (e.g. a Jobs view covering the tabs); default secondary. */
  variant?: 'primary' | 'secondary'
}

/**
 * Icons whose glyph never stands before a label: the labelled knob shows the label alone (before a label stand only
 * the marks with a fixed meaning, ↑ ↓ ↗ ▶ ⚠). Names, not `IconName`: a copy of the kit may have icons this one lacks.
 */
const LABEL_ONLY_ICONS: readonly string[] = ['refresh', 'rotate', 'copy', 'log']

/**
 * A header knob: a native Button, pressable as a whole. Graphical: "<glyph> <label>" (the label alone for a reload,
 * copy or log knob; compact bodies: the glyph alone, `label` stays its accessible name), `variant` secondary unless
 * the action says primary. Terminal: a one-glyph Button named by `label`, plain unless primary.
 */
export function IconButton(k: Kit, a: IconAction): RenderElement {
  const { Button } = k
  if (!k.graphical)
    return (
      <Button
        key={a.key}
        label={a.label}
        plain={a.variant === 'primary' ? undefined : true}
        variant={a.variant === 'primary' ? 'primary' : undefined}
        onPress={a.onPress}
      >
        {TERM_GLYPHS[a.icon] ?? a.label}
      </Button>
    )
  const glyph = ICON_GLYPHS[a.icon]
  // A desktop draws `label` in place of the children: the glyph must be in the label itself. A reload, copy or log
  // knob with its label shows the label alone; the icon-only (compact) form keeps its glyph.
  const shown = k.compact && glyph ? glyph : LABEL_ONLY_ICONS.includes(a.icon) ? a.label : glyphLabel(a.icon, a.label)
  return (
    <Button key={a.key} label={shown} variant={a.variant ?? 'secondary'} onPress={a.onPress}>
      {shown}
    </Button>
  )
}

/**
 * Pane header: logo (an SVG string or an element; graphical surfaces only), LABEL, title, one status pill, icon knobs
 * on the right. Narrow drops the label; the terminal draws `LABEL · title  pill` and the knobs as glyph buttons.
 */
export function PaneHeader(
  k: Kit,
  hd: {
    title: string
    label?: string
    logo?: string | RenderElement
    logoAlt?: string
    logoWidth?: number
    logoHeight?: number
    pill?: PillProps
    actions?: IconAction[]
  },
): RenderElement {
  const { Box, Text } = k
  const Svg = k.Svg
  const knobs = (hd.actions ?? []).map(a => IconButton(k, a))
  if (!k.graphical) {
    const label = hd.label && !k.narrow ? `${hd.label} · ` : ''
    const room = Math.max(
      6,
      k.cols - [...label].length - (hd.pill ? [...hd.pill.text].length + 4 : 0) - knobs.length * 4,
    )
    return (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Text bold>
          {label ? <Text dimColor>{label}</Text> : null}
          {truncate(hd.title, room)}
        </Text>
        {hd.pill ? Pill(k, hd.pill) : null}
        {knobs}
      </Box>
    )
  }
  const logo =
    typeof hd.logo === 'string' && Svg ? (
      <Svg
        source={svgDocument(hd.logo)}
        alt={hd.logoAlt ?? hd.label ?? 'Logo'}
        width={hd.logoWidth ?? 18}
        height={hd.logoHeight ?? hd.logoWidth ?? 18}
      />
    ) : typeof hd.logo === 'object' && hd.logo ? (
      hd.logo
    ) : null
  return (
    // minHeight: the row is as high with knobs as without (seen: the header moved by some pixels with a button)
    <Box flexDirection="row" alignItems="center" gap={1} flexWrap="nowrap" minWidth={0} minHeight={HEADER_ROWS}>
      {logo}
      {hd.label && !k.narrow ? (
        <Text size="caption" weight="bold" color={k.t.faint}>
          {sanitize(hd.label)}
        </Text>
      ) : null}
      <Box flexShrink={1} minWidth={0}>
        <Text weight="bold" color={k.t.text} wrap="truncate-end">
          {sanitize(hd.title)}
        </Text>
      </Box>
      {hd.pill ? (
        <Box flexShrink={0} paddingRight={1}>
          {Pill(k, hd.pill)}
        </Box>
      ) : null}
      <Box flexGrow={1} />
      {/* one row that never wraps: the title is cut, the knobs stay together on the right (seen live: a knob alone on
          a second line under the logo) */}
      <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
        {knobs}
      </Box>
    </Box>
  )
}

/** Rows the graphical pane header is at least high: room for a knob, so a header without one is as high. */
export const HEADER_ROWS = 2
/** Rows a framed button takes on graphical surfaces: a box that stands in for one keeps the row this high. */
export const KNOB_ROWS = HEADER_ROWS

/** A hairline across the body: an Svg wider than any pane, clipped to the slot (graphical surfaces only). */
function Rule(k: Kit): RenderElement | null {
  const Svg = k.Svg
  if (!Svg) return null
  return (
    <Svg
      source={svgDocument(
        `<svg width="4000" height="1" viewBox="0 0 4000 1" preserveAspectRatio="none"><rect width="4000" height="1" fill="${k.t.line}"/></svg>`,
      )}
      alt="divider"
      height={1}
    />
  )
}

/** A Box spacing (d.ts `Space`): cells or a step the surface sizes itself. */
export type Space = number | 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * The mandatory outermost box of every kit pane: spaces the sections (`gap`, `md`) and rules the header (usually
 * `PaneHeader`) off with a hairline. It paints no surface and keeps no inner margin of its own: the app draws the
 * pane's frame, fill and spacing (open the pane without `backgroundColor`). Terminal: one blank row between sections.
 */
export function PaneBody(
  k: Kit,
  b: {
    key?: string
    header?: RenderElement | null
    gap?: Space
    /**
     * The pane's status line under the header. It shows the question of a pending two-step button that sits in no
     * card (a card shows its own), else this status ("läuft …", a result, an error). Graphical surfaces draw no line
     * when there is nothing to say; the terminal keeps one blank row. `false` leaves the line out (a pane that
     * places `StatusLine` itself).
     */
    status?: StatusInfo | string | null | false
    /** `false`: the pane's line shows no two-step question (its cards have `actions` and show their own). */
    question?: false
    children: Kids
  },
): RenderElement {
  const { Box } = k
  // Graphical: no reserved empty line under the header (seen in the app: a hole); the line is drawn when there is a
  // status or a question no card shows (a card holding the asking button has claimed it while it was built).
  const asks =
    b.question !== false && k.state.confirm !== undefined && !!(k.state as UiState).confirmText && !questionClaimed(k)
  const said = typeof b.status === 'string' ? b.status : b.status ? b.status.text : ''
  const line =
    b.status === false || (k.graphical && !asks && !said)
      ? null
      : StatusLine(k, {
          key: b.key ? `${b.key}-status` : undefined,
          status: b.status,
          question: k.graphical && !asks ? false : b.question,
        })
  if (!k.graphical)
    return (
      <Box key={b.key} flexDirection="column" gap={b.gap ?? 1}>
        {b.header ?? null}
        {line}
        {kids(b.children)}
      </Box>
    )
  return (
    <Box key={b.key} flexDirection="column" gap={b.gap ?? 'md'}>
      {b.header ? (
        <Box flexDirection="column" gap="sm">
          {b.header}
          {Rule(k)}
          {line}
        </Box>
      ) : (
        line
      )}
      {kids(b.children)}
    </Box>
  )
}

/** What a status line says: a running step, a result or an error. `running` puts ◷ in front (tone `warn` unless set). */
export type StatusInfo = { text: string; tone?: Tone; running?: boolean }

/** The blank a status line holds its row with (a no-break space: an empty Text takes no row). */
export const STATUS_BLANK = '\u00a0'

/**
 * A fixed status line: exactly one row that is always there, so writing into it moves nothing. It shows, in this
 * order: the question of a pending two-step button (ConfirmButton; `scope` limits that to confirm keys starting with
 * it), the `status` given ("läuft …", result, error), or a blank of the same height. One line, cut at the end.
 * `PaneBody` draws one under the header for every pane; put another in a card whose own actions report there.
 */
export function StatusLine(
  k: Kit,
  s: {
    key?: string
    status?: StatusInfo | string | null
    scope?: string
    /** Only the questions of these two-step buttons (a card passes its own actions' keys). */
    keys?: readonly string[]
    /** `false`: never a question here (a pane whose cards show their own). */
    question?: false
  } = {},
): RenderElement {
  const { Box, Text } = k
  const pending = k.state.confirm
  const asked = (k.state as UiState).confirmText
  const mine =
    pending !== undefined &&
    s.question !== false &&
    (s.scope === undefined || pending.startsWith(s.scope)) &&
    (s.keys === undefined || s.keys.includes(pending))
  const question = mine && asked ? asked : undefined
  const given = typeof s.status === 'string' ? { text: s.status } : (s.status ?? undefined)
  const info: StatusInfo | undefined = question ? { text: question, tone: 'warn' } : given?.text ? given : undefined
  const tone = info ? (info.tone ?? (info.running ? 'warn' : undefined)) : undefined
  const raw = info ? (sanitize(`${info.running ? '◷ ' : ''}${info.text}`).split('\n')[0] ?? '') : ''
  if (!k.graphical)
    return (
      <Box key={s.key} height={1} flexShrink={0}>
        <Text color={tone ? terminalColor(k.brand, tone) : undefined} dimColor={tone ? undefined : true}>
          {raw ? truncate(raw, k.cols) : STATUS_BLANK}
        </Text>
      </Box>
    )
  return (
    <Box key={s.key} flexDirection="row" minHeight={1} flexShrink={0} minWidth={0}>
      <Text size="footnote" color={tone ? k.t.tones[tone].fg : ink(k, 'muted')} wrap="truncate-end">
        {raw || STATUS_BLANK}
      </Text>
    </Box>
  )
}

/** A problem first: tinted card with what is wrong, why (one sentence) and the button that fixes it. */
export function ProblemCard(
  k: Kit,
  p: {
    key: string
    title: string
    cause: string
    tone?: 'bad' | 'warn'
    icon?: IconName
    action?: Action
    more?: Action[]
  },
): RenderElement {
  const tone = p.tone ?? 'bad'
  const acts: Action[] = [
    ...(p.action ? [{ variant: 'primary' as const, ...p.action }] : []),
    ...(p.more ?? []).map(a => ({ variant: 'link' as const, ...a })),
  ]
  return Card(k, {
    key: p.key,
    tone,
    children: [
      CardTitle(k, { icon: p.icon ?? 'alert', title: k.graphical ? p.title : `✗ ${p.title}`, tone }),
      Sentence(k, p.cause),
      acts.length ? Actions(k, `${p.key}-acts`, acts, acts.length) : null,
    ],
  })
}

/** `warn`: a step that was blocked and later released; drawn yellow with „⚠“ (a number there reads as a second active step). */
export type StepState = 'done' | 'active' | 'todo' | 'failed' | 'warn'

export type Step = { key?: string; title: string; detail?: string; state: StepState; body?: RenderElement | null }

const STEP_TONE: Record<StepState, Tone> = {
  done: 'ok',
  active: 'accent',
  todo: 'neutral',
  failed: 'bad',
  warn: 'warn',
}

const STEP_MARK = 22
/** Width of the rail between two step marks: a share of the mark's column (about 2 px). */
export const STEP_RAIL = '8%'

/** The round step mark: a filled circle with the number (or ✓ ✗) centred in it. */
export function stepMarkSvg(mark: string, fg: string, bg: string): string {
  const r = STEP_MARK / 2
  return svgDocument(
    `<svg viewBox="0 0 ${STEP_MARK} ${STEP_MARK}"><circle cx="${r}" cy="${r}" r="${r}" fill="${bg}"></circle>` +
      `<text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="-apple-system, Segoe UI, sans-serif" font-size="12" font-weight="700" ` +
      `fill="${fg}">${xmlText(mark)}</text></svg>`,
  )
}

/** Steps with a rail: ✓ done, ● (or the number) active, ○ todo, ✗ failed, ⚠ warn; an active step may carry a body card. */
export function Stepper(k: Kit, s: { key?: string; steps: Step[] }): RenderElement {
  const { Box, Text } = k
  const rows = s.steps.map((step, i) => {
    const last = i === s.steps.length - 1
    const mark =
      step.state === 'done'
        ? '✓'
        : step.state === 'failed'
          ? '✗'
          : step.state === 'warn'
            ? '⚠'
            : k.graphical
              ? String(i + 1)
              : step.state === 'active'
                ? '●'
                : '○'
    if (!k.graphical) {
      const color = step.state === 'todo' ? undefined : terminalColor(k.brand, STEP_TONE[step.state])
      return (
        <Box key={step.key} flexDirection="column">
          <Text
            color={color}
            dimColor={step.state === 'todo' ? true : undefined}
            bold={step.state === 'active' ? true : undefined}
          >
            {truncate(`${mark} ${sanitize(step.title)}`, k.cols)}
          </Text>
          {step.detail ? <Text dimColor>{truncate(`│ ${sanitize(step.detail)}`, k.cols)}</Text> : null}
          {step.body ?? null}
          {!last ? <Text dimColor>│</Text> : null}
        </Box>
      )
    }
    const tone = k.t.tones[STEP_TONE[step.state]]
    const fill = step.state === 'active' ? k.t.accent : tone.bg
    const markColor = step.state === 'active' ? k.t.onAccent : tone.fg
    return (
      <Box key={step.key} flexDirection="row" gap={1}>
        <Box flexDirection="column" alignItems="center" width={3}>
          {k.Svg ? (
            <k.Svg source={stepMarkSvg(mark, markColor, fill)} alt={mark} width={STEP_MARK} height={STEP_MARK} />
          ) : (
            <Text weight="bold" color={markColor}>
              {mark}
            </Text>
          )}
          {/* the rail fills the row's whole height (a single „│“ left a hole under a step with a card or two lines) */}
          {!last ? <Box flexGrow={1} width={STEP_RAIL} minHeight={1} backgroundColor={boxPaint(k.t.line)} /> : null}
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} gap={0} paddingBottom={last ? 0 : 1}>
          <Text
            weight={step.state === 'active' ? 'bold' : 'medium'}
            color={step.state === 'todo' ? k.t.faint : k.t.text}
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
    )
  })
  return (
    <Box key={s.key} flexDirection="column">
      {rows}
    </Box>
  )
}

/** How many actions a list row shows on its right (R3); the rest stands under the row behind „Details“. */
export const ROW_ACTIONS = 2
/** How much faster than the title a row's meta shrinks: it yields first, the title is cut only once it is gone. */
export const META_YIELDS = 1000
/** Pixels of a list row's icon; the opened details stand that far in (plus the row's gap). */
const ROW_ICON = 14
/** Cells one level of `indent` moves a row to the right (trees). */
const INDENT = 2

export type ListRowProps = {
  key: string
  /** The title is text, never a button (R3): opening goes through `details`, choosing through an action. */
  title: string
  status?: Status
  icon?: IconName
  tone?: Tone
  /** Pale, beside the title; narrow bodies put it under the title instead of dropping it. */
  meta?: string
  /**
   * Columns in place of `meta` (R3): fixed-width cells after the title (`width` in cells, key `${key}-cell-${i}`), so
   * the same cell of every row of a list starts at the same place. Give every row of the list the same cells (an empty
   * text holds the place). Narrow bodies and the terminal join the texts with " · " into the meta line (unless `meta`
   * is given).
   */
  cells?: { text: string; width: number }[]
  pill?: PillProps
  /** Cells kept for the pill, also in a row without one (key `${key}-pill-slot`): the columns before it stay in line. */
  pillWidth?: number
  /** `end`: the pill stands at the right end of its place (`pillWidth`), where a title pill of the card ends. */
  pillAlign?: 'end'
  /** A column head (graphical): the title and cells dim, no icon, the title where the other rows' titles start. */
  head?: boolean
  /**
   * At most two short actions stand on the right (by rank; ≤ 2 words each). Further ones move under the row, behind
   * „Details“.
   */
  actions?: Action[]
  /**
   * Least width (cells) of the place the actions stand in, kept also by a row without any (key `${key}:slot`): give
   * every row of a list the same, at least as wide as the widest row's buttons, and what stands before it lines up.
   * The row-level form of `Action.slot` (which holds the place of one action).
   */
  actionSlot?: number
  /**
   * What „Details“ unfolds under the row (indented). The text action sits at a fixed place, last on the right, and
   * reads „Schließen“ while open. Give the content as a function when building it is costly.
   */
  details?: Kids | (() => Kids)
  /** The caller keeps the open state itself (e.g. to load on open); without these the kit keeps it by the row key. */
  open?: boolean
  onToggle?: (open: boolean) => void
  /** Tree level: each level moves the row (and its details) one step to the right. */
  indent?: number
  /** A checkable row: a box before the title that toggles (key `${key}-check`); no „Wählen“ button per row. */
  check?: { checked: boolean; onToggle: () => void }
  /**
   * Always under the row, at the title's left edge (where opened details stand): a second line (a job's last log
   * line, its error) or a block the caller opens itself. Every row of a list then starts its second line at one x.
   */
  under?: Kids
}

/**
 * A list row (R3): status icon, title, meta, a pill, at most two actions on the right, then „Details“; on graphical
 * surfaces one line that never wraps (the meta yields, then the title). Error rows get the cross-in-circle. An action changes neither the height nor the width of the row: a two-step action asks in place,
 * a sent prompt shows as a pill. Narrow (graphical) or compact (terminal) bodies stack: title, meta under it, then the
 * actions as one wrapping row. `indent` draws trees, `check` a row that can be ticked.
 */
export function ListRow(k: Kit, r: ListRowProps): RenderElement {
  const { Box, Text, Button } = k
  const cellText = (r.cells ?? [])
    .map(c => sanitize(c.text))
    .filter(Boolean)
    .join(' · ')
  // everything below reads `meta`: the cells as one line where columns are not drawn (terminal, narrow)
  r = r.cells && !r.meta ? { ...r, meta: cellText } : r
  const columns = !!r.cells && k.graphical && !k.narrow
  const tone = r.tone ?? (r.status ? toneOf(r.status) : undefined)
  const icon = r.icon ?? (r.status ? statusIcon(r.status) : undefined)
  const all = r.actions ?? []
  // by rank; what destroys something is the first to leave the row (it stands under it, behind „Details“)
  const sorted = all.every(a => rankOf(a) !== undefined)
  const ranked = sorted ? [...sortByRank(all.filter(a => !a.danger)), ...all.filter(a => a.danger)] : all
  const shown = ranked.slice(0, ROW_ACTIONS)
  const rest = sorted ? sortByRank(ranked.slice(ROW_ACTIONS)) : ranked.slice(ROW_ACTIONS)
  const hasDetails = r.details !== undefined || rest.length > 0
  const detailsKey = `${r.key}-details`
  const open = hasDetails ? (r.open ?? k.isOpen(detailsKey, false)) : false
  const toggle: Action | null = hasDetails
    ? {
        key: detailsKey,
        label: open ? k.s.close : k.s.details,
        variant: 'link',
        // as wide open („Schließen“) as closed („Details“): the pill and the actions before it do not move
        slot: Math.max([...k.s.close].length, [...k.s.details].length) + 1,
        onPress: () => (r.onToggle ? r.onToggle(!open) : k.toggle(detailsKey)),
      }
    : null
  const rowActs = [...shown, ...(toggle ? [toggle] : [])]
  const acts = rowActs.length ? Actions(k, `${r.key}:row`, rowActs, ROW_ACTIONS + 1, { row: true }) : null
  const body = open ? kids(typeof r.details === 'function' ? r.details() : r.details).map(inCard) : []
  const Svg = k.Svg
  // Graphical: the opened part starts at the title's edge (one left edge per row): a blank of the icon's width stands
  // in front of it, in the same row gap. A row without icon has its title at the row's edge, so nothing is indented.
  const blank =
    k.graphical && Svg && icon ? (
      <Svg
        source={svgDocument(
          `<svg width="${ROW_ICON}" height="1" viewBox="0 0 ${ROW_ICON} 1"><rect width="${ROW_ICON}" height="1" fill="none"/></svg>`,
        )}
        alt="indent"
        width={ROW_ICON}
        height={1}
      />
    ) : null
  const fixed = kids(r.under)
  const underKids = [
    ...fixed,
    ...(open ? body : []),
    ...(open && rest.length ? [Actions(k, `${r.key}-rest`, rest, rest.length)] : []),
  ]
  const under = !underKids.length ? null : !k.graphical ? (
    <Box key={`${r.key}-under`} flexDirection="column" gap={0} paddingLeft={INDENT}>
      {underKids}
    </Box>
  ) : (
    <Box key={`${r.key}-under`} flexDirection="row" gap={1} paddingLeft={r.check ? INDENT : 0}>
      {blank}
      <Box flexDirection="column" gap={1} flexGrow={1} flexShrink={1} minWidth={0}>
        {underKids}
      </Box>
    </Box>
  )
  // text marks: `[x]` on the terminal; a desktop Button draws its label, the ballot box with U+FE0E so it stays text
  const box = r.check ? (k.graphical ? (r.check.checked ? '☑\uFE0E' : '☐') : r.check.checked ? '[x]' : '[ ]') : ''
  const check = r.check ? (
    <Button key={`${r.key}-check`} label={k.graphical ? box : undefined} plain onPress={r.check.onToggle}>
      {box}
    </Button>
  ) : null
  // a head row has no icon: a blank of the icon's width keeps its title over the other rows' titles
  const headLead =
    r.head && k.graphical && Svg ? (
      <Svg
        source={svgDocument(
          `<svg width="${ROW_ICON}" height="1" viewBox="0 0 ${ROW_ICON} 1"><rect width="${ROW_ICON}" height="1" fill="none"/></svg>`,
        )}
        alt="indent"
        width={ROW_ICON}
        height={1}
      />
    ) : null
  const pad = Math.max(0, r.indent ?? 0) * INDENT
  const indented = (row: RenderElement) =>
    pad ? (
      <Box key={r.key} flexDirection="column" paddingLeft={pad}>
        {row}
      </Box>
    ) : (
      row
    )
  if (!k.graphical) {
    const g = r.status ? glyphOf(r.status) : undefined
    const mark = g?.char ?? (icon ? TERM_GLYPHS[icon] : undefined)
    const cols = Math.max(8, k.cols - pad - (check ? 4 : 0))
    const meta = r.meta && !k.compact ? `  ${sanitize(r.meta)}` : ''
    const pillLen = r.pill ? [...r.pill.text].length + 3 : 0
    const head = truncate(`${mark ? `${mark} ` : ''}${sanitize(r.title)}`, Math.max(6, cols - pillLen))
    const room = Math.max(0, cols - [...head].length - pillLen)
    const inline = !!meta && room > 3
    const below = r.meta && !inline ? wrapText(sanitize(r.meta), Math.max(4, cols - 2)) : []
    return indented(
      <Box key={pad ? undefined : r.key} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          {check}
          <Text color={tone ? terminalColor(k.brand, tone) : undefined} dimColor={g?.dim}>
            {head}
            {inline ? <Text dimColor>{truncate(meta, room)}</Text> : null}
          </Text>
          {r.pill ? Pill(k, r.pill) : null}
        </Box>
        {below.map(line => (
          <Text dimColor>{`  ${line}`}</Text>
        ))}
        {acts}
        {under}
      </Box>,
    )
  }
  const metaText = r.meta ? sanitize(r.meta) : ''
  // A row with actions is already as high as a framed button (KNOB_ROWS below): that height is its air. Only a row
  // with just a checkbox gets a step above and below (`xs` is less than a line).
  const air: Space = !rowActs.length && r.check ? 'xs' : 0
  return indented(
    <Box key={pad ? undefined : r.key} flexDirection="column" paddingY={air}>
      {/* One line, always: the actions never wrap and never shrink (Actions, `row`); when room is short the meta
          yields first (it shrinks far faster than the title and is cut), then the title is cut. */}
      {/* With actions the line is as high as a framed button, also when it holds only text actions („Details“): rows
          with and without a framed button keep one pitch */}
      <Box
        flexDirection="row"
        alignItems="center"
        gap={1}
        flexWrap="nowrap"
        minWidth={0}
        minHeight={rowActs.length ? KNOB_ROWS : undefined}
      >
        {check}
        {icon ? Icon(k, icon, { tone, color: tone ? undefined : k.t.faint, size: ROW_ICON }) : r.head ? headLead : null}
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size={r.head ? 'caption' : 'footnote'} color={r.head ? k.t.faint : k.t.text} wrap="truncate-end">
            {sanitize(r.title)}
          </Text>
        </Box>
        {columns ? (
          (r.cells ?? []).map((c, i) => (
            <Box key={`${r.key}-cell-${i}`} width={c.width} flexShrink={0}>
              <Text size="caption" color={k.t.faint} wrap="truncate-end">
                {sanitize(c.text) || ' '}
              </Text>
            </Box>
          ))
        ) : metaText && !k.narrow ? (
          <Box flexShrink={META_YIELDS} minWidth={0}>
            <Text size="caption" color={k.t.faint} wrap="truncate-end">
              {metaText}
            </Text>
          </Box>
        ) : null}
        {columns && r.pillWidth ? (
          <Box
            key={`${r.key}-pill-slot`}
            width={r.pillWidth}
            flexShrink={0}
            flexDirection="row"
            justifyContent={r.pillAlign === 'end' ? 'flex-end' : 'flex-start'}
          >
            {r.pill ? Pill(k, r.pill) : null}
          </Box>
        ) : r.pill ? (
          Pill(k, r.pill)
        ) : null}
        {r.actionSlot && !k.narrow ? (
          // the same right-aligned box of a least width as `Action.slot`, here around the whole action place
          <Box
            key={`${r.key}:slot`}
            flexDirection="row"
            justifyContent="flex-end"
            minWidth={r.actionSlot}
            flexShrink={0}
          >
            {acts}
          </Box>
        ) : acts && !k.narrow ? (
          acts
        ) : null}
      </Box>
      {metaText && k.narrow ? (
        <Text size="caption" color={k.t.faint} wrap="wrap">
          {metaText}
        </Text>
      ) : null}
      {acts && k.narrow ? acts : null}
      {under}
    </Box>,
  )
}

/**
 * Label / value rows; `copy` adds a framed copy knob for raw data (paths, URLs, IDs). Graphical: drawn as a card (it is
 * one block of facts); `bare: true` leaves the frame off when it already sits in a Card.
 */
export function KeyValue(
  k: Kit,
  kv: {
    key?: string
    bare?: boolean
    /** `wrap`: a long value (a list of paths) goes below its label and wraps instead of being cut in the middle. */
    rows: { key?: string; label: string; value: string; copy?: boolean; tone?: Tone; wrap?: boolean }[]
  },
): RenderElement {
  const { Box, Text } = k
  const width = Math.min(Math.floor(k.cols / 2), Math.max(0, ...kv.rows.map(r => [...sanitize(r.label)].length)))
  const rows = kv.rows.map((r, i) => {
    const id = r.key ?? `${kv.key ?? 'kv'}-${i}`
    const copy = r.copy ? CopyButton(k, { key: `${id}-copy`, text: r.value, iconOnly: true }) : null
    if (r.wrap && Math.ceil(([...sanitize(r.label)].length + [...sanitize(r.value)].length) * 1.2) + 2 > k.cols) {
      const lines = k.graphical ? [sanitize(r.value)] : wrapWords(sanitize(r.value), Math.max(8, k.cols))
      return (
        <Box key={id} flexDirection="column">
          {k.graphical ? (
            <Text size="footnote" color={k.t.muted}>
              {sanitize(r.label)}
            </Text>
          ) : (
            <Text dimColor>{truncate(sanitize(r.label), k.cols)}</Text>
          )}
          {lines.map((line, j) =>
            k.graphical ? (
              <Text key={`${id}-v${j}`} size="footnote" color={r.tone ? k.t.tones[r.tone].fg : k.t.text} wrap="wrap">
                {line}
              </Text>
            ) : (
              <Text key={`${id}-v${j}`} color={r.tone ? terminalColor(k.brand, r.tone) : undefined}>
                {line}
              </Text>
            ),
          )}
          {copy}
        </Box>
      )
    }
    if (!k.graphical) {
      const label = truncate(sanitize(r.label).padEnd(width), width)
      const room = Math.max(4, k.cols - width - 2 - (copy ? 4 : 0))
      return (
        <Box key={id} flexDirection="row" gap={1}>
          <Text dimColor>{label}</Text>
          <Text color={r.tone ? terminalColor(k.brand, r.tone) : undefined}>{truncate(r.value, room)}</Text>
          {copy}
        </Box>
      )
    }
    return (
      <Box key={id} flexDirection="row" alignItems="center" gap={1}>
        <Box flexShrink={0}>
          <Text size="footnote" color={k.t.muted}>
            {sanitize(r.label)}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="row" justifyContent="flex-end">
          <Text size="footnote" tabular color={r.tone ? k.t.tones[r.tone].fg : k.t.text} wrap="truncate-middle">
            {sanitize(r.value)}
          </Text>
        </Box>
        {copy}
      </Box>
    )
  })
  const bare = (
    <Box key={kv.key} flexDirection="column">
      {rows}
    </Box>
  )
  if (!k.graphical || kv.bare) return bare
  const framed = Card(k, { key: kv.key, children: rows })
  IN_CARD.set(framed as object, bare)
  return framed
}

/** Splits text at spaces into lines of at most `cols` characters (a longer word is cut). Terminal only. */
function wrapWords(text: string, cols: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if ([...next].length <= cols) line = next
    else {
      if (line) out.push(line)
      line = truncate(word, cols)
    }
  }
  if (line) out.push(line)
  return out.length ? out : ['']
}

/**
 * A copy button for raw data; `show` prints the value (mono, cut in the middle) before it. `iconOnly`: graphical, a
 * small framed knob with the copy icon (the label is its click target, as on every framed knob); terminal, `⧉`.
 */
export function CopyButton(
  k: Kit,
  c: { key: string; text: string; label?: string; show?: boolean; iconOnly?: boolean },
): RenderElement {
  const { Box, Text, Button } = k
  const label = c.label ?? k.s.copy
  const press = (e: { surface?: string }) => k.copy(c.text, e?.surface)
  const btn =
    c.iconOnly && k.graphical ? (
      IconButton(k, { key: c.key, icon: 'copy', label, onPress: press as () => void })
    ) : c.iconOnly ? (
      <Button key={c.key} label={label} plain onPress={press}>
        {TERM_GLYPHS.copy ?? label}
      </Button>
    ) : k.graphical ? (
      // label only: before a label stand only the marks with a fixed meaning (↑ ↓ ↗ ▶ ⚠); the icon is the knob's
      <Button key={c.key} label={label} variant="secondary" onPress={press}>
        {label}
      </Button>
    ) : (
      <Button key={c.key} plain onPress={press}>
        {label}
      </Button>
    )
  if (!c.show) return btn
  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      {c.show ? (
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text mono dimColor={k.graphical ? undefined : true} color={ink(k, 'faint')} wrap="truncate-middle">
            {k.graphical ? sanitize(c.text) : truncate(c.text, Math.max(6, k.cols - [...label].length - 4))}
          </Text>
        </Box>
      ) : null}
      {btn}
    </Box>
  )
}

/** Progress bar with a sentence under it ("128 von 412 · noch ca. 2 min"); no `value` draws it as running. */
export function ProgressBlock(
  k: Kit,
  p: { key?: string; label: string; value?: number; max?: number; valueText?: string; sentence?: string; tone?: Tone },
): RenderElement {
  const { Box, Text } = k
  const Progress = k.Progress
  const color = toneColor(k, p.tone ?? 'warn')
  const bar = Progress ? (
    <Progress label={sanitize(p.label) || '…'} value={p.value} max={p.max} valueText={p.valueText} color={color} />
  ) : (
    <Text>{truncate(`${p.label}${p.valueText ? `  ${p.valueText}` : ''}`, k.cols)}</Text>
  )
  return (
    <Box key={p.key} flexDirection="column" gap={k.graphical ? 1 : 0}>
      {bar}
      {p.sentence ? Sentence(k, p.sentence, { faint: true }) : null}
    </Box>
  )
}

// --- v1 components (extended) ---

export type Action = {
  key: string
  label: string
  onPress: () => void
  /** Destructive: two-step via ConfirmButton; a string is the confirm label ("Really delete?"). */
  confirm?: boolean | string
  /** v1 spelling of `variant: 'primary'`. */
  primary?: boolean
  /**
   * An icon. Only the marks with a fixed meaning are drawn in front of the label (R6): ↑ push, ↓ pull/download,
   * ↗ external, ▶ start. Every other icon names the action for callers and draws nothing (no ✓ before a label).
   */
  icon?: IconName
  /**
   * The rank (R1), set on every action: `primary` the one main action of a card, `secondary` what triggers something,
   * `link` what only shows, opens, reloads or folds (a text action). Absent is the v1 look and counts as a mistake in
   * new code: type new lists as `RankedAction[]`.
   */
  variant?: 'primary' | 'secondary' | 'link'
  /**
   * Destroys data (delete, wipe, prune): the label carries a ⚠ in front on every surface (a desktop Button takes no
   * color), the terminal draws it red. Pair it with `confirm` naming the target and the consequence. Never primary,
   * not in its confirm step either.
   */
  danger?: boolean
  /** Opens this address instead of running `onPress`: drawn as the engine's link, „↗ <label>“ (see `openAction`). */
  href?: string
  /** Never goes behind "…": a text action that must stay reachable in one press (e.g. „↗ Öffnen“). */
  keep?: boolean
  /** A prompt this action sent to Claude is not answered yet (`askAction` sets it): shown as a pill, not as the label. */
  sent?: boolean
  /**
   * In a list row (graphical): the least width of this action's place, in cells, so rows whose actions differ in
   * length ("Stage" / "Unstage") keep pill and actions in one column (the engine's Button takes no width).
   */
  slot?: number
  /**
   * With a `confirm` question: the confirming button's word while it asks (e.g. „Löschen“), when the label is long; the
   * question above already names the target. Default: the label.
   */
  confirmWord?: string
}

/** An action with its rank set: what new code passes (the type shows every v1 action at compile time). */
export type RankedAction = Action & { variant: 'primary' | 'secondary' | 'link' }

/** The actions of a card or row by rank: one main action, what else triggers something, then text actions. */
export type ActionGroups = { primary?: Action; secondary?: Action[]; links?: Action[] }

const DANGER_GLYPH = '⚠'

/**
 * Key suffix of the box `Actions` draws its buttons in (`<key>:actions`); a list row's ends with `:row:actions`. Tests
 * find action rows by it (tests/kit-rules.ts).
 */
export const ACTIONS_SUFFIX = ':actions'

/** The marks an action label may carry in front (R6); every other icon draws no glyph on a button. */
const ACTION_GLYPH_ICONS: readonly IconName[] = ['push', 'download', 'external', 'play']

/** `"<mark> <label>"` for the icons with a fixed meaning (↑ ↓ ↗ ▶), else the bare label. */
export function actionLabel(icon: IconName | undefined, label: string): string {
  return icon && ACTION_GLYPH_ICONS.includes(icon) ? glyphLabel(icon, label) : label
}

function isV2(a: Action): boolean {
  return a.icon !== undefined || a.variant !== undefined
}

/** The rank an action is drawn with: destructive is never primary; v1 actions keep `primary` or nothing. */
function rankOf(a: Action): 'primary' | 'secondary' | 'link' | undefined {
  if (a.href) return a.variant ?? 'link'
  if (a.danger) return a.variant === 'link' ? 'link' : 'secondary'
  if (a.variant) return a.variant
  if (a.primary) return 'primary'
  return a.icon !== undefined ? 'secondary' : undefined
}

const RANK_ORDER = { primary: 0, secondary: 1, link: 2 } as const

/** The list of an `ActionGroups`: main action first, then secondary, then text actions, each with its rank set. */
export function rankedActions(g: ActionGroups): RankedAction[] {
  return [
    ...(g.primary
      ? [{ ...g.primary, primary: undefined, variant: g.primary.danger ? 'secondary' : 'primary' } as RankedAction]
      : []),
    ...(g.secondary ?? []).map(a => ({ ...a, primary: undefined, variant: 'secondary' }) as RankedAction),
    ...(g.links ?? []).map(a => ({ ...a, primary: undefined, variant: 'link' }) as RankedAction),
  ]
}

/** Sorts by rank (stable): main action, secondary, text actions. Actions without a rank stay where they are. */
export function sortByRank<T extends Action>(actions: readonly T[]): T[] {
  return actions
    .map((a, i) => ({ a, i, r: RANK_ORDER[rankOf(a) ?? 'secondary'] }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map(x => x.a)
}

/** One line of text, sanitized and cut to the body width (minus `indent`). */
export function Line(
  k: Kit,
  text: unknown,
  style: { color?: Color; dim?: boolean; bold?: boolean; indent?: number } = {},
): RenderElement {
  const { Text } = k
  const pad = ' '.repeat(style.indent ?? 0)
  return (
    <Text color={style.color} dimColor={style.dim} bold={style.bold}>
      {truncate(pad + sanitize(text), k.cols)}
    </Text>
  )
}

/** A status glyph as its own colored Text. */
export function StatusGlyph(k: Kit, status: Status): RenderElement {
  const { Text } = k
  const g = glyphOf(status)
  return (
    <Text color={g.color} dimColor={g.dim}>
      {g.char}
    </Text>
  )
}

/**
 * Two-step button: the first press turns it, in place, into "Really …?" + Cancel; with a `confirmLabel` (a whole
 * question) into the action label + „Abbrechen“ (the terminal: ✕), the question standing in the status line of the
 * card that holds the button (else the pane's).
 *
 * The question does not change the look (R1): with a `variant` the button is drawn as that rank before and while it
 * asks. `danger`: a ⚠ in front of the labels (the terminal draws them red), secondary on graphical surfaces and never
 * primary, not while asking either. Without `variant` and `danger` it is the v1 look: plain text, primary while asking.
 */
export function ConfirmButton(
  k: Kit,
  a: {
    key: string
    label: string
    confirmLabel?: string
    /** The confirming button's word in the long form (with `confirmLabel`); default: the label. */
    confirmWord?: string
    onConfirm: () => void
    danger?: boolean
    variant?: 'primary' | 'secondary' | 'link'
    icon?: IconName
    /** „Abbrechen“ as a framed (secondary) button on graphical surfaces: an `Actions` row that shows only the pair. */
    framedCancel?: boolean
  },
): RenderElement {
  const { Box, Button, Text } = k
  const base = a.variant && a.variant !== 'link' ? actionLabel(a.icon, a.label) : a.label
  const marked = (text: string) => (a.danger ? `${DANGER_GLYPH} ${text}` : text)
  const draw = (text: string) => (a.danger && !k.graphical ? <Text color="red">{text}</Text> : text)
  const asks = a.confirmLabel !== undefined ? marked(a.confirmLabel) : undefined
  // decided on the kit state at press time (unity Runde 3): a desktop button may keep the handler of the step before
  const ask = () => k.pressConfirm(a.key, a.onConfirm, asks)
  // the rank the button keeps: destructive is secondary (plain on the terminal, where red marks it), never primary
  const rank: 'primary' | 'secondary' | undefined = a.danger
    ? k.graphical
      ? 'secondary'
      : a.variant === 'secondary'
        ? 'secondary'
        : undefined
    : a.variant === 'link'
      ? undefined
      : a.variant
  const labelled = a.danger || a.variant !== undefined
  if (!k.isConfirming(a.key))
    return (
      <Button
        key={a.key}
        label={labelled ? marked(base) : undefined}
        plain={rank ? undefined : true}
        variant={rank}
        onPress={ask}
      >
        {draw(marked(base))}
      </Button>
    )
  // A press moves nothing: a short question ("Wirklich löschen?") is the confirming button itself. A longer one
  // (`confirmLabel`) never becomes a new line: the button turns, in place, into two short ones of the same height (the
  // action label and ✕), and the question goes to the fixed StatusLine (PaneBody has one in every pane, a card with
  // `actions` its own).
  const long = a.confirmLabel !== undefined
  const question = marked(long ? (a.confirmWord ?? base) : k.s.really(a.label))
  const v1 = !a.danger && a.variant === undefined
  const askRank = v1 ? 'primary' : rank
  return (
    <Box key={long ? `${a.key}-ask` : undefined} flexDirection="row" gap={1} flexShrink={0}>
      <Button
        key={a.key}
        label={labelled ? question : undefined}
        plain={askRank ? undefined : true}
        variant={askRank}
        onPress={ask}
      >
        {draw(question)}
      </Button>
      {a.framedCancel && k.graphical ? (
        <Button key={`${a.key}-cancel`} label={k.s.cancel} variant="secondary" onPress={() => k.clearConfirm()}>
          {k.s.cancel}
        </Button>
      ) : (
        <Button key={`${a.key}-cancel`} plain onPress={() => k.clearConfirm()}>
          {long && !k.graphical ? '✕' : k.s.cancel}
        </Button>
      )}
    </Box>
  )
}

/**
 * One action button, drawn by its rank (`variant`): the engine's own primary/secondary (the app paints it; a desktop
 * ignores colors on a Button), `link` a plain Button. A two-step action (`confirm`) keeps that look. `href` draws the
 * engine's link „↗ <label>“. Graphical surfaces put the mark of the icon in front of the label where it has a fixed
 * meaning ("↑ Push", see `actionLabel`): the whole native Button is the click target (`label` names it). The terminal
 * keeps `[ label ]`. v1 (no `icon`/`variant`): plain, primary or two-step.
 */
export function ActionButton(k: Kit, a: Action, opts: { framedCancel?: boolean } = {}): RenderElement {
  const { Button, Text } = k
  if (a.href) {
    const label = `${ICON_GLYPHS.external ?? '↗'} ${a.label}`
    const Link = k.Link
    if (Link) return <Link key={a.key} href={a.href} label={label} />
    return (
      <Button key={a.key} label={label} plain onPress={a.onPress}>
        {label}
      </Button>
    )
  }
  if (a.confirm)
    return ConfirmButton(k, {
      key: a.key,
      label: a.label,
      confirmLabel: typeof a.confirm === 'string' ? a.confirm : undefined,
      confirmWord: a.confirmWord,
      onConfirm: a.onPress,
      danger: a.danger,
      variant: isV2(a) || a.primary ? rankOf(a) : undefined,
      icon: a.icon,
      framedCancel: opts.framedCancel,
    })
  if (a.danger) {
    // the ⚠ is the mark (no icon glyph); a desktop Button takes no color, the terminal draws it red
    const label = `${DANGER_GLYPH} ${a.label}`
    return (
      <Button key={a.key} label={label} variant="secondary" onPress={a.onPress}>
        {k.graphical ? label : <Text color="red">{label}</Text>}
      </Button>
    )
  }
  if (!isV2(a))
    return (
      <Button
        key={a.key}
        plain={a.primary ? undefined : true}
        variant={a.primary ? 'primary' : undefined}
        onPress={a.onPress}
      >
        {a.label}
      </Button>
    )
  const variant = a.variant ?? (a.primary ? 'primary' : 'secondary')
  if (variant === 'link') {
    const label = a.icon === 'external' ? actionLabel(a.icon, a.label) : a.label
    return (
      <Button key={a.key} label={label} plain onPress={a.onPress}>
        {label}
      </Button>
    )
  }
  // A desktop draws `label` in place of the children: the mark must be in the label itself.
  const text = k.graphical ? actionLabel(a.icon, a.label) : a.label
  return (
    <Button key={a.key} label={text} variant={variant} onPress={a.onPress}>
      {text}
    </Button>
  )
}

/**
 * An action whose prompt is on its way to Claude, on a graphical surface: the button itself turns quiet (a text
 * action with the same label and key; a press still toasts) behind its pill „geschickt“, so the pair reads as one quiet
 * unit (a desktop Button takes no colour: its label cannot be dimmed). The pair is keyed `${key}-sent`, never breaks
 * apart and is as high as the framed button it replaces (the row does not jump when the button turns sent).
 */
function SentAction(k: Kit, a: Action): RenderElement {
  const { Box } = k
  return (
    <Box key={`${a.key}-sent`} flexDirection="row" alignItems="center" gap={1} flexShrink={0} minHeight={KNOB_ROWS}>
      {Pill(k, { text: k.s.sent, tone: 'info', glyph: false })}
      {ActionButton(k, { ...a, primary: undefined, variant: 'link' })}
    </Box>
  )
}

/** Which actions stay visible when only `max` fit: text actions go behind "…" first, then secondary, never the main one. */
function fitByRank(actions: Action[], max: number): Action[] {
  if (actions.length <= max) return actions
  const hidden = new Set<Action>()
  for (const rank of ['link', undefined, 'secondary'] as const) {
    for (let i = actions.length - 1; i >= 0 && actions.length - hidden.size > max; i--) {
      const a = actions[i] as Action
      if (!hidden.has(a) && !a.keep && rankOf(a) === rank) hidden.add(a)
    }
  }
  return actions.filter(a => !hidden.has(a))
}

/**
 * The one action row of a card or list row (R2): a wrapped row of buttons, at most `max` (3) shown, the rest behind a
 * "…" toggle keyed `${key}-more`. What goes behind "…" first are the text actions, then secondary ones, never the main
 * action.
 *
 * Pass the actions by rank (`{ primary, secondary, links }`): the kit sets each look and the order main action,
 * secondary, text actions. A plain list keeps its order (v1 and callers that sorted themselves).
 *
 * Narrow body: the main action on a row of its own (stretched where the surface lets a Button stretch), the other
 * buttons and links together in one wrapping row below it, so they do not each take a line. An action whose prompt
 * is on its way to Claude (`sent`) keeps its label: graphical, it is drawn as a text action with its pill „geschickt“
 * directly after it (one pill per sent button); the terminal puts one pill at the end of the row. While a two-step
 * action asks (graphical), the row shows only that button and „Abbrechen“.
 */
export function Actions(
  k: Kit,
  key: string,
  actions: Action[] | ActionGroups,
  max = 3,
  opts: { row?: boolean } = {},
): RenderElement | null {
  const { Box, Button } = k
  const list = Array.isArray(actions) ? actions : rankedActions(actions)
  if (!list.length) return null
  const open = k.isMore(key)
  const fitted = list.length > max ? fitByRank(list, max) : list
  const shown = open ? list : fitted
  // "…" only when something really is behind it (kept actions may fill the row past `max`)
  const toggle =
    fitted.length < list.length ? (
      <Button key={`${key}-more`} plain onPress={() => k.toggleMore(key)}>
        {open ? '‹' : '…'}
      </Button>
    ) : null
  const isPrimary = (a: Action) => rankOf(a) === 'primary' && !(k.graphical && a.sent)
  // The terminal keeps one pill „geschickt“ at the end of the row; a graphical surface draws it after each sent button.
  const sent = !k.graphical && list.some(a => a.sent) ? Pill(k, { text: k.s.sent, tone: 'info', glyph: false }) : null
  const drawn = (a: Action) => (k.graphical && a.sent ? SentAction(k, a) : ActionButton(k, a))
  // a list row's action in a place of fixed least width, its button at the right edge of it
  const button = (a: Action) =>
    a.slot && opts.row && k.graphical && !k.narrow ? (
      <Box key={`${a.key}-slot`} flexDirection="row" justifyContent="flex-end" minWidth={a.slot} flexShrink={0}>
        {drawn(a)}
      </Box>
    ) : (
      drawn(a)
    )
  // While a two-step action of this row asks (graphical), the row shows only the question's pair: the confirming
  // button and, directly after it, a framed „Abbrechen“. The other actions come back once it is answered.
  const asking = k.graphical ? list.find(a => a.confirm && k.isConfirming(a.key)) : undefined
  const inRow = opts.row && k.graphical && !k.narrow
  if (asking)
    return (
      <Box
        key={`${key}${ACTIONS_SUFFIX}`}
        flexDirection="row"
        alignItems="center"
        gap={1}
        flexWrap={inRow ? 'nowrap' : 'wrap'}
        flexShrink={inRow ? 0 : undefined}
        {...(inRow ? {} : lineGap(k))}
      >
        {ActionButton(k, asking, { framedCancel: true })}
      </Box>
    )
  // A list row's actions (graphical, not stacked): one line that neither wraps nor shrinks.
  if (inRow)
    return (
      <Box
        key={`${key}${ACTIONS_SUFFIX}`}
        flexDirection="row"
        alignItems="center"
        gap={1}
        flexWrap="nowrap"
        flexShrink={0}
      >
        {shown.map(button)}
        {toggle}
      </Box>
    )
  const lead = shown.filter(isPrimary)
  if (k.narrow && list.some(isV2) && lead.length) {
    const rest = shown.filter(a => !isPrimary(a))
    return (
      <Box key={`${key}${ACTIONS_SUFFIX}`} flexDirection="column" alignItems="stretch" gap={1}>
        {lead.map(button)}
        {rest.length || toggle || sent ? (
          <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap" {...lineGap(k)}>
            {rest.map(button)}
            {toggle}
            {sent}
          </Box>
        ) : null}
      </Box>
    )
  }
  return (
    <Box
      key={`${key}${ACTIONS_SUFFIX}`}
      flexDirection="row"
      alignItems="center"
      gap={1}
      flexWrap="wrap"
      {...lineGap(k)}
    >
      {shown.map(button)}
      {toggle}
      {sent}
    </Box>
  )
}

/** The text action that re-reads a pane's data: always „Neu laden“ (R6), never a pill, never „Aktualisieren“. */
export function reloadAction(k: Kit, a: { key: string; onPress: () => void }): RankedAction {
  return { key: a.key, label: k.s.reload, variant: 'link', onPress: a.onPress }
}

/**
 * The text action that opens something outside the app: always „↗ Öffnen“ (R6). With `href` it is the engine's link
 * (works on every surface, remote ones too); without, `onPress` opens it (a file in the editor, a browser through a
 * process). Replaces loose `Link`s beside or under a row.
 */
export function openAction(
  k: Kit,
  a: { key: string; href?: string; onPress?: () => void; label?: string },
): RankedAction {
  return {
    key: a.key,
    label: a.label ?? k.s.open,
    variant: 'link',
    ...(a.href ? { href: a.href } : { icon: 'external' as const }),
    onPress: a.onPress ?? (() => undefined),
  }
}

export function Header(
  k: Kit,
  hd: {
    title: string
    context?: string
    actions?: Action[]
    onRefresh?: () => void
    refreshing?: boolean
    key?: string
  },
): RenderElement {
  const { Box, Text, Button } = k
  const key = hd.key ?? 'header'
  const title = truncate(hd.title, k.cols)
  const room = k.cols - [...title].length - 2
  // A title cut to the full width leaves no room: drawing "  …" after it would overflow the line.
  const ctx = hd.context && !k.compact && room >= 4 ? truncate(hd.context, room) : ''
  return (
    <Box flexDirection="column">
      <Text bold>
        {title}
        {ctx ? <Text dimColor>{`  ${ctx}`}</Text> : null}
      </Text>
      {((hd.actions?.length ?? 0) > 0 || hd.onRefresh) && (
        <Box flexDirection="row" gap={1} flexWrap="wrap" {...lineGap(k)}>
          {(hd.actions ?? []).map(a => ActionButton(k, a))}
          {hd.onRefresh && (
            <Button key={`${key}-refresh`} plain onPress={hd.onRefresh}>
              {hd.refreshing ? '⟳ …' : '⟳ Refresh'}
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}

/** Section: bold title + dim count; collapsible (▾/▸ button keyed `sec-${key}`) when `collapsible`. */
export function Section(
  k: Kit,
  s: {
    key: string
    title: string
    count?: number | string
    collapsible?: boolean
    defaultOpen?: boolean
    actions?: Action[]
    children: Kid[] | RenderElement | null
  },
): RenderElement {
  const { Box, Text, Button } = k
  const open = s.collapsible ? k.isOpen(s.key, s.defaultOpen ?? true) : true
  const label = truncate(`${s.collapsible ? (open ? '▾ ' : '▸ ') : ''}${s.title}`, k.cols)
  const room = k.cols - [...label].length - 1
  const count = s.count === undefined || s.count === '' || room < 2 ? '' : ` ${truncate(s.count, room)}`
  const head = s.collapsible ? (
    <Button key={`sec-${s.key}`} plain onPress={() => k.toggle(s.key)}>
      {`${label}${count}`}
    </Button>
  ) : (
    <Text bold>
      {label}
      {count ? <Text dimColor>{count}</Text> : null}
    </Text>
  )
  return (
    <Box flexDirection="column">
      {s.actions?.length ? (
        <Box flexDirection="row" gap={1} flexWrap="wrap" {...lineGap(k)}>
          {head}
          {s.actions.map(a => ActionButton(k, a))}
        </Box>
      ) : (
        head
      )}
      {open && kids(s.children)}
    </Box>
  )
}

/** Row: leading glyph + primary, dim secondary (hidden when compact), ≤3 actions + "…" overflow. v1; v2 uses ListRow. */
export function Row(
  k: Kit,
  r: {
    key: string
    status?: Status
    /** Overrides the status glyph (e.g. `[x]`). */
    glyph?: string
    primary: string
    secondary?: string
    color?: Color
    dim?: boolean
    actions?: Action[]
    indent?: number
  },
): RenderElement {
  const { Box, Text } = k
  const g = r.status ? glyphOf(r.status) : undefined
  const mark = r.glyph ?? g?.char
  const pad = ' '.repeat(r.indent ?? 0)
  const head = truncate(`${pad}${mark ? `${mark} ` : ''}${sanitize(r.primary)}`, k.cols)
  return (
    <Box flexDirection="column">
      <Text color={r.color ?? g?.color} dimColor={r.dim ?? g?.dim}>
        {head}
      </Text>
      {r.secondary && !k.compact ? <Text dimColor>{truncate(`${pad}  ${sanitize(r.secondary)}`, k.cols)}</Text> : null}
      {r.actions?.length ? Actions(k, r.key, r.actions) : null}
    </Box>
  )
}

export type EmptyInfo = {
  icon?: IconName
  title: string
  text?: string
  /** A quiet last line of its own (how fresh the data is: „Stand 15:05“). */
  note?: string
  action?: Action
  /** In a card beside other content: no air of its own above and below (the card's padding and gap give it). */
  compact?: boolean
}

/** Characters a line of the empty state's sentence has at most (about 360 px of footnote text). */
export const EMPTY_LINE = 60

/** `text` in as few lines of at most `max` characters as `wrapText` needs, but of even length: no lone last word. */
export function balancedLines(text: string, max: number): string[] {
  const lines = wrapText(text, max)
  if (lines.length < 2) return lines
  // never narrower than the longest word: wrapText would cut it
  const longest = Math.max(...text.split(/\s+/).map(word => [...word].length))
  for (let w = Math.max(longest, Math.ceil([...text].length / lines.length)); w < max; w++) {
    const even = wrapText(text, w)
    if (even.length === lines.length) return even
  }
  return lines
}

/** Empty state. A string: one dim line (v1). An object: calm icon, one sentence what is going on, at most one button. */
export function EmptyState(k: Kit, info: string | EmptyInfo): RenderElement {
  if (typeof info === 'string') return Line(k, info, { dim: true })
  const { Box, Text } = k
  const action = info.action ? ActionButton(k, { variant: 'secondary', ...info.action }) : null
  if (!k.graphical)
    return (
      <Box flexDirection="column">
        <Text bold>{truncate(info.title, k.cols)}</Text>
        {info.text ? Sentence(k, info.text, { faint: true }) : null}
        {info.note ? Sentence(k, info.note, { faint: true }) : null}
        {action}
      </Box>
    )
  return (
    <Box flexDirection="column" alignItems="center" gap={1} paddingY={info.compact ? 0 : 2}>
      {Icon(k, info.icon ?? 'circle', { size: 28, color: k.t.faint })}
      <Text weight="bold" color={k.t.text} wrap="wrap">
        {sanitize(info.title)}
      </Text>
      {/* centred like icon and title: a Text takes no alignment, so the sentence is wrapped here and each line is
          centred by the box */}
      {info.text ? (
        <Box flexDirection="column" alignItems="center" gap={0}>
          {balancedLines(sanitize(info.text), Math.max(12, Math.min(EMPTY_LINE, k.cols - 4))).map(line =>
            Sentence(k, line, { wrap: 'truncate-end' }),
          )}
        </Box>
      ) : null}
      {info.note ? Sentence(k, info.note, { faint: true, wrap: 'truncate-end' }) : null}
      {action}
    </Box>
  )
}

const BAR_WIDTHS = ['72%', '48%', '86%', '60%', '40%']

/**
 * Loading state. A string: one dim line (v1). An object: placeholder cards in the shape that is coming (`shape`: bars
 * per card, default one card of 3) and, after 3 s or so, a sentence saying why it takes long (`text`). No spinner.
 */
export function LoadingState(k: Kit, info: string | { text?: string; shape?: number[] } = k.s.loading): RenderElement {
  if (typeof info === 'string') return Line(k, info, { dim: true })
  const { Box, Text } = k
  if (!k.graphical) return Line(k, info.text ?? k.s.loading, { dim: true })
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
  )
  return (
    <Box flexDirection="column" gap={1}>
      {cards}
      {info.text ? (
        <Text size="footnote" color={k.t.faint}>
          {sanitize(info.text)}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * Error state. v1 (no `title`): red one-liner + Details toggle (`${key}-details`) + Retry (`${key}-retry`). v2 (with
 * `title`): a bad-toned card saying what did not work and what still runs, one helping button (`action`), Retry as a
 * link and the raw details only on press.
 */
export function ErrorState(
  k: Kit,
  err: {
    key: string
    message: string
    details?: string
    onRetry?: () => void
    /** The word of the retry action when it only re-reads data: pass `k.s.reload` (one word per meaning, R6). */
    retryLabel?: string
    title?: string
    action?: Action
  },
): RenderElement {
  const { Box, Text, Button } = k
  const lines = sanitize(err.message).split('\n')
  const first = lines[0] || k.s.wrong
  const details = [err.details ? sanitize(err.details) : '', ...lines.slice(1)].filter(Boolean).join('\n')
  const shown = k.hasDetails(err.key)
  const detailLines = shown
    ? details
        .split('\n')
        .flatMap(l => (l ? wrapText(l, k.cols) : [' ']))
        .slice(0, Math.max(3, k.rows - 6))
        .map(l => (
          <Text
            dimColor={k.graphical && err.title !== undefined ? undefined : true}
            color={err.title !== undefined ? ink(k, 'faint') : undefined}
          >
            {truncate(l || ' ', k.cols)}
          </Text>
        ))
    : []
  if (err.title !== undefined) {
    const acts: Action[] = [
      ...(err.action ? [{ variant: 'primary' as const, ...err.action }] : []),
      ...(err.onRetry
        ? [
            {
              key: `${err.key}-retry`,
              label: err.retryLabel ?? k.s.retry,
              onPress: err.onRetry,
              variant: 'link' as const,
            },
          ]
        : []),
      ...(details
        ? [
            {
              key: `${err.key}-details`,
              label: shown ? k.s.hideDetails : k.s.details,
              onPress: () => k.toggleDetails(err.key),
              variant: 'link' as const,
            },
          ]
        : []),
    ]
    const framed = Card(k, {
      key: err.key,
      tone: 'bad',
      children: [
        CardTitle(k, { icon: 'xCircle', title: k.graphical ? err.title : `✗ ${err.title}`, tone: 'bad' }),
        Sentence(k, first),
        // the raw details stand above the action row: the action row stays the card's last line (R2)
        ...detailLines,
        acts.length ? Actions(k, `${err.key}-acts`, acts, acts.length) : null,
      ],
    })
    // In a card (R2: no card in a card, one action row): one red line with what failed, its helpers as text actions
    // beside it, the raw details under it on press.
    IN_CARD.set(
      framed as object,
      <Box key={err.key} flexDirection="column">
        <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap" {...lineGap(k)}>
          <Box flexShrink={1} minWidth={0}>
            {Sentence(k, `✗ ${sentence(err.title)} ${first}`, { tone: 'bad' })}
          </Box>
          {acts.map(a => (k.graphical && a.sent ? SentAction(k, a) : ActionButton(k, { ...a, variant: 'link' })))}
        </Box>
        {detailLines}
      </Box>,
    )
    return framed
  }
  return (
    <Box flexDirection="column">
      <Text color="red">{truncate(`✗ ${first}`, k.cols)}</Text>
      {(details || err.onRetry) && (
        <Box flexDirection="row" gap={1}>
          {details ? (
            <Button key={`${err.key}-details`} plain onPress={() => k.toggleDetails(err.key)}>
              {shown ? k.s.hideDetails : k.s.details}
            </Button>
          ) : null}
          {err.onRetry ? (
            <Button key={`${err.key}-retry`} plain onPress={err.onRetry}>
              {err.retryLabel ?? k.s.retry}
            </Button>
          ) : null}
        </Box>
      )}
      {detailLines}
    </Box>
  )
}

/**
 * Long output: newest lines at the bottom, bounded to the body rows; "Show more" (`${key}-more`) widens it.
 * `collapsed` (v2): only the last non-empty line and a "Log" button (same key) until pressed.
 */
export function LogBox(
  k: Kit,
  b: {
    key: string
    title?: string
    lines: readonly string[]
    rows?: number
    onClose?: () => void
    collapsed?: boolean
    /** Colors a line (a diff's added and removed lines, an error line); without it every line is dim. */
    tone?: (line: string) => Tone | undefined
    /** Fixed-width lines (a diff, a table): columns stay under each other. */
    mono?: boolean
  },
): RenderElement {
  const { Box, Text, Button } = k
  const base = b.rows ?? Math.max(4, Math.floor(k.rows / 2) - 2)
  const more = k.isLogMore(b.key)
  const all = b.lines.flatMap(l => sanitize(l).split('\n'))
  if (b.collapsed && !more) {
    const last = [...all].reverse().find(l => l.trim()) ?? ''
    // Graphical: the link's text in the line's own size and color (a label would be drawn at button size instead).
    const btn = k.graphical ? (
      <Button key={`${b.key}-more`} plain onPress={() => k.toggleLogMore(b.key)}>
        <Text size="footnote" color={k.t.link}>
          {k.s.log}
        </Text>
      </Button>
    ) : (
      ActionButton(k, {
        key: `${b.key}-more`,
        label: k.s.log,
        icon: 'log',
        variant: 'link',
        onPress: () => k.toggleLogMore(b.key),
      })
    )
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text dimColor={k.graphical ? undefined : true} color={ink(k, 'faint')} size="footnote" wrap="truncate-end">
            {k.graphical ? last || ' ' : truncate(last || ' ', Math.max(4, k.cols - [...k.s.log].length - 3))}
          </Text>
        </Box>
        {btn}
      </Box>
    )
  }
  const room = more ? base * 4 : base
  const shown = all.slice(-room)
  const hidden = all.length - shown.length
  return (
    <Box flexDirection="column">
      {(b.title || b.onClose) && (
        <Box flexDirection="row" gap={1}>
          {b.title ? <Text bold>{truncate(b.title, Math.max(1, k.cols - 4))}</Text> : null}
          {b.onClose ? (
            // graphical: a labelled close („Schließen“), a bare ✕ says nothing there; the terminal keeps the short ✕
            <Button key={`${b.key}-close`} label={k.graphical ? k.s.close : undefined} plain onPress={b.onClose}>
              {k.graphical ? k.s.close : '✕'}
            </Button>
          ) : null}
        </Box>
      )}
      {(hidden > 0 || more) && (
        <Button key={`${b.key}-more`} plain onPress={() => k.toggleLogMore(b.key)}>
          {more ? (b.collapsed ? k.s.hideLog : k.s.showLess) : k.s.showMore(hidden)}
        </Button>
      )}
      {shown.map(l => {
        const tone = b.tone?.(l)
        return tone ? (
          <Text mono={b.mono ? true : undefined} color={toneColor(k, tone)}>
            {truncate(l || ' ', k.cols)}
          </Text>
        ) : (
          <Text mono={b.mono ? true : undefined} dimColor>
            {truncate(l || ' ', k.cols)}
          </Text>
        )
      })}
    </Box>
  )
}

/** Desktop tab width in body columns: per character, the button's padding, and the reserve the last tab may take. */
const TAB_CHAR = 0.9
const TAB_PAD = 1.5
const TAB_RESERVE = 1

export type TabItem<T extends string> = {
  id: T
  label: string
  badge?: string
  /** v2 marker (switches to the one-row strip); tabs draw no glyph since Kit v3.2, text only. */
  icon?: IconName
  /** v2: a count after the label ("Review · 2"). */
  count?: number | string
}

/**
 * Tab bar: one Button per tab keyed `${keyPrefix ?? 'tab-'}${id}`, the active one primary; wraps on narrow bodies (v1).
 * v2 (any `icon` or `maxVisible`): one row of native Buttons, the active one `variant: 'primary'`, the rest plain, each
 * "<label> · <count>" (no glyph), in a fixed order. Only what does not fit the body width (estimated, `maxVisible` an
 * upper bound) sits behind a "More ▾" tab (`${prefix}more`, primary while the active tab is in it) whose menu lists
 * the rest as a framed, indented submenu (same keys) and closes after a choice. The strip wraps rather than clips.
 * When a tab itself has the id `more`, the overflow button is keyed `${prefix}overflow` instead.
 */
export function Tabs<T extends string>(
  k: Kit,
  t: {
    tabs: TabItem<T>[]
    /** The active tab; `undefined` marks none (another view, e.g. a header button's, covers the body). */
    active: T | undefined
    onSelect: (id: T) => void
    keyPrefix?: string
    maxVisible?: number
    moreLabel?: string
  },
): RenderElement {
  const { Box, Button } = k
  const prefix = t.keyPrefix ?? 'tab-'
  const text = (tab: TabItem<T>) =>
    `${tab.label}${tab.count !== undefined && tab.count !== '' ? ` · ${tab.count}` : ''}${tab.badge ? ` ${tab.badge}` : ''}`
  const v2 = t.maxVisible !== undefined || t.tabs.some(tab => tab.icon)
  if (!v2)
    return (
      <Box flexDirection="row" gap={1} flexWrap="wrap" {...lineGap(k)}>
        {t.tabs.map(tab => (
          <Button
            key={`${prefix}${tab.id}`}
            plain={tab.id === t.active ? undefined : true}
            variant={tab.id === t.active ? 'primary' : undefined}
            onPress={() => t.onSelect(tab.id)}
          >
            {text(tab)}
          </Button>
        ))}
      </Box>
    )
  // The strip pages like the band over the prompt: everything that fits stays in one row; otherwise the row shows one
  // page of tabs, "+N" at its end goes to the next page (N tabs further on) and "‹" at its start goes back. The page
  // holding the active tab is shown until the person pages; choosing a tab drops the paging again.
  // Width estimate in body columns (`k.cols` is the measured width of the pane body). Terminal: exact, "[ label ]" is
  // the label + 4 cells. Desktop: proportional text is narrower than a cell (about 0.9 of one per character) and a
  // plain button pads about 1.5 cells; measured on the Hub strip, where "label + 2" hid a tab that had room. 1 gap.
  // `maxVisible` caps a page.
  const width = (label: string) => (k.graphical ? [...label].length * TAB_CHAR + TAB_PAD : [...label].length + 4)
  const max = Math.max(1, Math.min(t.maxVisible ?? t.tabs.length, t.tabs.length))
  const total = t.tabs.reduce((w, tab) => w + width(text(tab)) + 1, -1)
  const pages: TabItem<T>[][] = []
  if (t.tabs.length <= max && total <= k.cols) pages.push(t.tabs)
  else {
    let start = 0
    while (start < t.tabs.length) {
      const back = start > 0 ? width('‹') + 1 : 0
      let used = back
      let n = 0
      for (let i = start; i < t.tabs.length; i++) {
        const tab = t.tabs[i] as TabItem<T>
        const w = width(text(tab)) + (n ? 1 : 0)
        const left = t.tabs.length - i - 1
        const fwd = left ? width(`+${left}`) + 1 : 0
        // Never "+1" for a last tab that fits, or misses by no more than the small reserve: it stands there itself
        // (the room of the "+1" button was kept free for it). The strip wraps rather than clips if the estimate is off.
        const lastFits = left === 0 && used + w <= k.cols + (k.graphical ? TAB_RESERVE : 0)
        if (n >= max || (n > 0 && used + w + fwd > k.cols && !lastFits)) break
        used += w
        n++
      }
      pages.push(t.tabs.slice(start, start + Math.max(1, n)))
      start += Math.max(1, n)
    }
  }
  const pageKey = `${prefix}page`
  const activePage = Math.max(
    0,
    pages.findIndex(p => p.some(tab => tab.id === t.active)),
  )
  const chosen = k.pageOf?.(pageKey)
  const page = Math.min(pages.length - 1, Math.max(0, chosen ?? activePage))
  const shown = pages[page] ?? t.tabs
  const after = pages.slice(page + 1).reduce((n, p) => n + p.length, 0)
  // a tab of its own with id "more" (ds-flutter's „Mehr“ tab) keeps its key; the paging button then takes another
  const moreKey = t.tabs.some(tab => tab.id === 'more') ? `${prefix}overflow` : `${prefix}more`
  const one = (tab: TabItem<T>) => {
    const on = tab.id === t.active
    const press = () => {
      if (chosen !== undefined) k.setPage?.(pageKey, undefined)
      t.onSelect(tab.id)
    }
    return (
      <Button
        key={`${prefix}${tab.id}`}
        label={k.graphical ? text(tab) : undefined}
        plain={on ? undefined : true}
        variant={on ? 'primary' : undefined}
        onPress={press}
      >
        {text(tab)}
      </Button>
    )
  }
  const nav = (key: string, label: string, to: number) => (
    <Button key={key} label={k.graphical ? label : undefined} plain onPress={() => k.setPage?.(pageKey, to)}>
      {label}
    </Button>
  )
  // Wraps rather than clips: every tab stays reachable even when the estimate is off.
  return (
    <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap" {...lineGap(k)}>
      {page > 0 ? nav(`${prefix}prev`, '‹', page - 1) : null}
      {shown.map(tab => one(tab))}
      {after > 0 ? nav(moreKey, `+${after}`, page + 1) : null}
    </Box>
  )
}

// --- forms, filters, switches (R1, R4, R9) ---

/** The widest label column of a form, in cells: longer labels are cut, so the fields keep their room. */
const LABEL_MAX = 16
/** The least width of a field beside its label (R4: 12 characters). */
const FIELD_MIN = 12
/** The most characters a `Select` shows of one value; longer ones are cut in the middle (R4). */
export const SELECT_MAX = 48
/** The most options the engine takes in one `Select`. */
export const SELECT_OPTIONS = 64
/** What fits a one-line field on a desktop (it has a fixed width there, whatever box it sits in). */
export const FIELD_ONE_LINE = 24

/** Cuts a long value in the middle (`feature/NXPLUG-4…-booking`), keeping its start and its end. */
export function truncateMiddle(text: unknown, width: number): string {
  const line = sanitize(text).split('\n')[0] ?? ''
  const chars = [...line]
  const w = Math.max(3, Math.floor(width))
  if (chars.length <= w) return line
  const head = Math.ceil((w - 1) / 2)
  const tail = w - 1 - head
  return `${chars.slice(0, head).join('')}…${tail ? chars.slice(-tail).join('') : ''}`
}

/**
 * What is being typed into a kit field, by the field's key. Typing must not reach the pane's state on every key: a
 * write there redraws the whole pane and hands the `Input` a new `value` each time, and its frame flickers. So the
 * keystrokes land here (no redraw) and reach the caller's `onInput` once typing pauses (`FIELD_FLUSH_MS`) or on Enter.
 * `base` is the caller's value when typing began: when the caller draws another one (a prefill, a reset), the draft
 * is dropped.
 */
const FIELD_DRAFTS = new Map<string, { text: string; seq: number; base: string }>()
/** How long typing must pause before a field's `onInput` runs. */
export const FIELD_FLUSH_MS = 600
/** The same for a search field that filters while typing. */
export const SEARCH_FLUSH_MS = 250

/**
 * The text of a kit field right now: what is being typed (also within the pause before `onInput` ran), else
 * `fallback` (the stored value). A button beside a field reads the field through this, so a press right after typing
 * does not act on the text of a moment ago.
 */
export function fieldText(key: string, fallback = ''): string {
  return FIELD_DRAFTS.get(key)?.text ?? fallback
}

/** Forgets what was typed into a field (after its form was sent or closed). */
export function clearFieldDraft(key: string): void {
  FIELD_DRAFTS.delete(key)
}

/** The `value`, `onInput` and `onSubmit` of an `Input` that keeps its draft in the kit (see `FIELD_DRAFTS`). */
function draftInput(
  k: Kit,
  f: { key: string; value?: string; onInput?: (v: string) => void; onSubmit: (v: string) => void },
  flushMs: number,
): { value: string | undefined; onInput: (v: string) => void; onSubmit: (v: string) => void } {
  const given = f.value ?? ''
  const d = FIELD_DRAFTS.get(f.key)
  // caught up (the caller stores what was typed) or overruled (the caller drew another value): the draft ends
  if (d && (d.text === given || d.base !== given)) FIELD_DRAFTS.delete(f.key)
  const live = FIELD_DRAFTS.get(f.key)
  return {
    value: live ? live.text : f.value,
    onInput: v => {
      const seq = (FIELD_DRAFTS.get(f.key)?.seq ?? 0) + 1
      FIELD_DRAFTS.set(f.key, { text: v, seq, base: FIELD_DRAFTS.get(f.key)?.base ?? given })
      const flush = () => {
        if (FIELD_DRAFTS.get(f.key)?.seq === seq) f.onInput?.(v)
      }
      if (!f.onInput) return
      if (k.later) k.later(flushMs, flush)
      else flush()
    },
    onSubmit: v => {
      FIELD_DRAFTS.delete(f.key)
      f.onSubmit(v)
    },
  }
}

/**
 * One form row (R4, R9): label | control, the control growing with at least 12 characters; narrow bodies put the label
 * over the control. `labelWidth` (cells) lines several rows up in one grid (`Form` sets it).
 */
function FormRow(
  k: Kit,
  r: { key: string; label?: string; labelWidth?: number; control: RenderElement; grow?: boolean; tall?: boolean },
): RenderElement {
  const { Box, Text } = k
  const label = r.label ? sanitize(r.label) : ''
  const width = Math.min(LABEL_MAX, r.labelWidth ?? [...label].length)
  const labelEl = label ? (
    k.graphical ? (
      <Text size="footnote" color={k.t.muted} wrap="truncate-end">
        {label}
      </Text>
    ) : (
      <Text dimColor>{k.narrow ? truncate(label, k.cols) : truncate(label, width).padEnd(width)}</Text>
    )
  ) : null
  // a column that stretches its child: the field takes the whole width it is given, never its own small default
  if (k.narrow || !labelEl)
    return (
      <Box key={r.key} flexDirection="column" alignItems="stretch" gap={0} flexGrow={1} minWidth={0}>
        {labelEl}
        {r.control}
      </Box>
    )
  return (
    // A tall control (a field of several lines): the label stands at the field's first line, where the field's own
    // button is, not at its middle. `xs` is the air a label has above it in a one-line row.
    <Box key={r.key} flexDirection="row" alignItems={r.tall ? 'flex-start' : 'center'} gap={1}>
      <Box width={width + 1} flexShrink={0} paddingTop={r.tall && k.graphical ? 'xs' : undefined}>
        {labelEl}
      </Box>
      <Box
        flexGrow={r.grow === false ? 0 : 1}
        flexShrink={1}
        minWidth={FIELD_MIN}
        flexDirection="column"
        alignItems={r.grow === false ? 'flex-end' : 'stretch'}
      >
        {r.control}
      </Box>
    </Box>
  )
}

export type FieldProps = {
  /** Key of the `Input` (what `ui.input` addresses); the row is keyed `${key}-row`. */
  key: string
  /** Names the thing (a noun), never the deed and never an instruction. */
  label?: string
  /** The value the field changes: a field that edits something shows it (R4). */
  value?: string
  /** An example that fits the field (a real value), not an instruction on which key to press. */
  placeholder?: string
  /**
   * The deed, one verb: the engine draws it as the field's own button. Only where the button does something typing
   * alone does not (create, commit, save, send). A field that only holds a form's value leaves it out: no button.
   */
  submitLabel?: string
  /** Lines of the field; from 2 it holds several lines. */
  rows?: number
  onSubmit: (value: string) => void
  /**
   * Runs with the text once typing pauses (`FIELD_FLUSH_MS`), not on every key: the kit keeps the draft meanwhile, so
   * storing it redraws the pane once and the field does not flicker. Read the text of the moment with `fieldText`.
   */
  onInput?: (value: string) => void
  /** The focus ring starts in this field when the pane takes the keyboard (a form that just opened). */
  autoFocus?: true
  labelWidth?: number
}

/**
 * A form row with one input (R4): label | field | button. One input per row; two forms never share a row. Narrow: the
 * label over the field. A field of two or more rows takes the width of its row; a one-line field is small (see
 * `FIELD_ONE_LINE`), so a longer example or text makes it two rows by itself. What is
 * typed stays in the kit until typing pauses, so the field does not flicker. Without an `Input` on the surface
 * nothing is drawn.
 */
export function Field(k: Kit, f: FieldProps): RenderElement | null {
  const Input = k.Input
  if (!Input) return null
  const draft = draftInput(k, f, FIELD_FLUSH_MS)
  // A one-line field has a fixed, small width on a desktop (about 20 characters; no box makes it wider), a field of
  // two or more rows takes the whole row. So a field whose example or text does not fit one line gets two rows: no
  // mod can build a cut-off mini field by accident.
  const longest = Math.max([...(f.placeholder ?? '')].length, [...(draft.value ?? '')].length)
  const rows = f.rows ?? (longest > FIELD_ONE_LINE ? 2 : undefined)
  return FormRow(k, {
    key: `${f.key}-row`,
    label: f.label,
    labelWidth: f.labelWidth,
    tall: (rows ?? 1) > 1,
    control: (
      <Input
        key={f.key}
        placeholder={f.placeholder}
        value={draft.value}
        {...(f.submitLabel ? { submitLabel: f.submitLabel } : {})}
        rows={rows}
        autoFocus={f.autoFocus}
        onInput={draft.onInput}
        onSubmit={draft.onSubmit}
      />
    ),
  })
}

export type SelectRowProps = {
  /** Key of the `Select`; the row is keyed `${key}-row`. */
  key: string
  label?: string
  options: readonly { value: string; label: string }[]
  value?: string
  onSelect: (value: string) => void
  /** The most characters shown of one option (`SELECT_MAX`); longer ones are cut in the middle. */
  maxWidth?: number
  labelWidth?: number
}

/**
 * A form row with one select (R4): label | select. The select never grows past `maxWidth`: long values (branch names,
 * project names) are cut in the middle, so the row cannot run over.
 */
export function SelectRow(k: Kit, s: SelectRowProps): RenderElement | null {
  const Select = k.Select
  if (!Select) return null
  const max = Math.max(8, Math.min(s.maxWidth ?? SELECT_MAX, k.cols - 4))
  // The engine refuses a Select with no option or more than 64 and then drops the whole pane (seen live with a repo
  // of many branches): show the first ones and always the chosen one.
  const chosen = s.options.find(o => o.value === s.value)
  const head = s.options.slice(0, SELECT_OPTIONS)
  const list = chosen && !head.includes(chosen) ? [...head.slice(0, SELECT_OPTIONS - 1), chosen] : head
  if (!list.length) return null
  const options = list.map(o => ({ value: o.value, label: truncateMiddle(o.label, max) }))
  return FormRow(k, {
    key: `${s.key}-row`,
    label: s.label,
    labelWidth: s.labelWidth,
    control: <Select key={s.key} options={options} value={s.value} onSelect={s.onSelect} />,
  })
}

export type FormRowSpec =
  | { key?: string; label: string; value: string; tone?: Tone; copy?: boolean }
  | ({ label: string } & Omit<SelectRowProps, 'label' | 'labelWidth'> & { kind: 'select' })
  | ({ label: string } & Omit<FieldProps, 'label' | 'labelWidth'> & { kind: 'field' })
  | { kind: 'toggle'; key: string; label: string; on: boolean; onToggle: (on: boolean) => void; hint?: string }

/**
 * Facts and inputs of one thing as rows in one grid (R5): fixed values, selects and fields share the label column, so a
 * card reads as one block instead of boxes and stacks. No frame: it sits in a card.
 */
export function Form(
  k: Kit,
  f: { key: string; rows: (FormRowSpec | null | false | undefined)[]; labelWidth?: number },
): RenderElement {
  const { Box, Text } = k
  const rows = f.rows.filter(Boolean) as FormRowSpec[]
  // one label width for several forms of a pane: the caller passes it, else it is the longest label of this form
  const labelWidth = f.labelWidth ?? Math.min(LABEL_MAX, Math.max(0, ...rows.map(r => [...sanitize(r.label)].length)))
  // rows with a control (a select, a field) need air between them; plain value rows stay close like a table
  const spaced = k.graphical && rows.some(r => 'kind' in r)
  return (
    <Box key={f.key} flexDirection="column" gap={spaced ? 'sm' : 0}>
      {rows.map((r, i) => {
        if ('kind' in r && r.kind === 'select') return SelectRow(k, { ...r, labelWidth })
        if ('kind' in r && r.kind === 'field') return Field(k, { ...r, labelWidth })
        if ('kind' in r && r.kind === 'toggle') return Toggle(k, { ...r, labelWidth })
        const v = r as { key?: string; label: string; value: string; tone?: Tone; copy?: boolean }
        const id = v.key ?? `${f.key}-${i}`
        const room = Math.max(4, k.cols - labelWidth - 2 - (v.copy ? 4 : 0))
        return FormRow(k, {
          key: id,
          label: v.label,
          labelWidth,
          control: (
            <Box flexDirection="row" alignItems="center" gap={1} flexGrow={1} flexShrink={1} minWidth={0}>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                {k.graphical ? (
                  <Text size="footnote" color={v.tone ? k.t.tones[v.tone].fg : k.t.text} wrap="wrap">
                    {sanitize(v.value)}
                  </Text>
                ) : (
                  <Text color={v.tone ? terminalColor(k.brand, v.tone) : undefined}>
                    {k.narrow ? wrapText(v.value, k.cols).join('\n') : truncate(v.value, room)}
                  </Text>
                )}
              </Box>
              {v.copy ? CopyButton(k, { key: `${id}-copy`, text: v.value, iconOnly: true }) : null}
            </Box>
          ),
        })
      })}
    </Box>
  )
}

/**
 * A search field (R4): no label, the placeholder an example value. It filters while typing and then has no button (a
 * button there would do nothing typing does not); with `live: false` it filters on submit only and carries the button
 * `k.s.search`. Put it in the `filter` place of the card whose list it filters.
 */
export function SearchField(
  k: Kit,
  s: { key: string; value?: string; placeholder?: string; onSearch: (query: string) => void; live?: boolean },
): RenderElement | null {
  const Input = k.Input
  if (!Input) return null
  // typing filters after a short pause, not on every key (each filter step redraws the list and the field)
  const draft = draftInput(
    k,
    { key: s.key, value: s.value, onInput: s.live === false ? undefined : s.onSearch, onSubmit: s.onSearch },
    SEARCH_FLUSH_MS,
  )
  const { Box } = k
  return (
    <Box key={`${s.key}-row`} flexDirection="column" alignItems="stretch" minWidth={0}>
      <Input
        key={s.key}
        placeholder={s.placeholder}
        value={draft.value}
        {...(s.live === false ? { submitLabel: k.s.search } : {})}
        onInput={draft.onInput}
        onSubmit={draft.onSubmit}
      />
    </Box>
  )
}

export type SegmentOption<T extends string> = { id: T; label: string; count?: number | string }

/**
 * A switch between views of one list (R1), each option with an optional count. The chosen one is a quiet grey pill, the
 * others text: it never uses `primary`, which stays the card's main action. Buttons are keyed `${key}-${id}`; pressing
 * the chosen one does nothing. Put it in the `filter` place of a card.
 */
export function Segment<T extends string>(
  k: Kit,
  s: {
    key: string
    options: readonly SegmentOption<T>[]
    active: T | undefined
    onSelect: (id: T) => void
    /**
     * A visible track under all options (graphical): a sunken well (the theme's `well`), no frame, so it reads as one
     * control and never as a small card, and may stand inside a card. Sub-tabs and a card's filter use it alike (one
     * look for one kind of control). Without it: the chosen one a quiet grey pill, the others text.
     */
    track?: boolean
  },
): RenderElement {
  const { Box, Button } = k
  const track =
    s.track && k.graphical
      ? { backgroundColor: boxPaint(k.t.well), paddingX: 'xs' as Space, alignSelf: 'flex-start' as const }
      : {}
  return (
    <Box key={s.key} flexDirection="row" alignItems="center" gap={1} flexWrap="wrap" {...lineGap(k)} {...track}>
      {s.options.map(o => {
        const on = o.id === s.active
        const label = `${sanitize(o.label)}${o.count !== undefined && o.count !== '' ? ` · ${o.count}` : ''}`
        return (
          <Button
            key={`${s.key}-${o.id}`}
            label={label}
            plain={on ? undefined : true}
            variant={on ? 'secondary' : undefined}
            onPress={() => {
              if (!on) s.onSelect(o.id)
            }}
          >
            {label}
          </Button>
        )
      })}
    </Box>
  )
}

/**
 * A setting (R1): its name, its state as a pill directly after the name (`k.s.on` / `k.s.off`), then the text action
 * keyed `key` that names the deed („Ausschalten“ when on, „Einschalten“ when off), then what it does (`hint`, pale).
 * Never an action button with the state in its label. With a `labelWidth` (a row of a `Form`, or beside `Field` /
 * `SelectRow` rows) the name is the row's label and the pill sits in the value column. The terminal keeps the list
 * row: name, hint, pill, action.
 */
export function Toggle(
  k: Kit,
  t: { key: string; label: string; on: boolean; onToggle: (on: boolean) => void; hint?: string; labelWidth?: number },
): RenderElement {
  const { Box, Text } = k
  const pill: PillProps = { text: t.on ? k.s.on : k.s.off, tone: t.on ? 'ok' : 'neutral', glyph: false }
  const action: Action = {
    key: t.key,
    label: t.on ? k.s.turnOff : k.s.turnOn,
    variant: 'link',
    onPress: () => t.onToggle(!t.on),
  }
  if (!k.graphical) return ListRow(k, { key: `${t.key}-row`, title: t.label, meta: t.hint, pill, actions: [action] })
  const hint = t.hint ? (
    <Box flexShrink={META_YIELDS} minWidth={0}>
      <Text size="caption" color={k.t.faint} wrap={k.narrow ? 'wrap' : 'truncate-end'}>
        {sanitize(t.hint)}
      </Text>
    </Box>
  ) : null
  const value = (
    <Box flexDirection="row" alignItems="center" gap={1} flexWrap={k.narrow ? 'wrap' : 'nowrap'} minWidth={0}>
      {Pill(k, pill)}
      {ActionButton(k, action)}
      {hint}
    </Box>
  )
  if (t.labelWidth !== undefined && !k.narrow)
    return FormRow(k, { key: `${t.key}-row`, label: t.label, labelWidth: t.labelWidth, control: value })
  return (
    <Box
      key={`${t.key}-row`}
      flexDirection="row"
      alignItems="center"
      gap={1}
      flexWrap={k.narrow ? 'wrap' : 'nowrap'}
      minWidth={0}
      paddingY="xs"
    >
      <Box flexShrink={1} minWidth={0}>
        <Text size="footnote" color={k.t.text} wrap="truncate-end">
          {sanitize(t.label)}
        </Text>
      </Box>
      {Pill(k, pill)}
      {ActionButton(k, action)}
      {hint}
    </Box>
  )
}

// --- foreign status words (R6, R10) ---

/** A status another tool reported, in the pane's words: the text to show and the tone it reads as. */
export type Translated = { text: string; tone: Tone }

/** Exact words (lower case) of CI checks, test runners, Nx generators, Docker and Compose. */
const FOREIGN_STATUS: Record<string, Translated> = {
  // tests and CI checks
  pass: { text: 'grün', tone: 'ok' },
  passed: { text: 'grün', tone: 'ok' },
  success: { text: 'grün', tone: 'ok' },
  successful: { text: 'grün', tone: 'ok' },
  completed: { text: 'fertig', tone: 'ok' },
  fail: { text: 'rot', tone: 'bad' },
  failed: { text: 'rot', tone: 'bad' },
  failure: { text: 'rot', tone: 'bad' },
  error: { text: 'Fehler', tone: 'bad' },
  timed_out: { text: 'Zeit abgelaufen', tone: 'bad' },
  action_required: { text: 'wartet auf dich', tone: 'warn' },
  pending: { text: 'wartet', tone: 'warn' },
  queued: { text: 'wartet', tone: 'warn' },
  waiting: { text: 'wartet', tone: 'warn' },
  in_progress: { text: 'läuft', tone: 'warn' },
  running: { text: 'läuft', tone: 'warn' },
  skipped: { text: 'übersprungen', tone: 'neutral' },
  skipping: { text: 'übersprungen', tone: 'neutral' },
  neutral: { text: 'neutral', tone: 'neutral' },
  cancelled: { text: 'abgebrochen', tone: 'neutral' },
  canceled: { text: 'abgebrochen', tone: 'neutral' },
  stale: { text: 'veraltet', tone: 'neutral' },
  none: { text: 'keine', tone: 'neutral' },
  // file changes of an Nx generator
  create: { text: 'neu', tone: 'ok' },
  update: { text: 'geändert', tone: 'warn' },
  delete: { text: 'gelöscht', tone: 'bad' },
  rename: { text: 'umbenannt', tone: 'warn' },
  // Docker container states
  created: { text: 'angelegt', tone: 'neutral' },
  restarting: { text: 'startet neu', tone: 'warn' },
  removing: { text: 'wird entfernt', tone: 'warn' },
  paused: { text: 'pausiert', tone: 'neutral' },
  exited: { text: 'beendet', tone: 'neutral' },
  dead: { text: 'abgestürzt', tone: 'bad' },
  healthy: { text: 'gesund', tone: 'ok' },
  unhealthy: { text: 'nicht gesund', tone: 'bad' },
  starting: { text: 'startet', tone: 'warn' },
  // reviews
  approved: { text: 'freigegeben', tone: 'ok' },
  changes_requested: { text: 'Änderungen gewünscht', tone: 'warn' },
  review_required: { text: 'wartet auf Review', tone: 'warn' },
  draft: { text: 'Entwurf', tone: 'neutral' },
  merged: { text: 'gemergt', tone: 'ok' },
  closed: { text: 'geschlossen', tone: 'neutral' },
  open: { text: 'offen', tone: 'neutral' },
}

const DURATION_UNIT: [RegExp, string, string][] = [
  [/^seconds?$/, 's', 's'],
  [/^minutes?$/, 'min', 'min'],
  [/^hours?$/, 'h', 'h'],
  [/^days?$/, 'Tag', 'Tagen'],
  [/^weeks?$/, 'Woche', 'Wochen'],
  [/^months?$/, 'Monat', 'Monaten'],
  [/^years?$/, 'Jahr', 'Jahren'],
]

/** Docker's "3 hours", "About an hour", "Less than a second" as "3 h", "1 h", "1 s". */
function germanDuration(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (/^less than a second$/.test(t)) return '1 s'
  const m = /^(?:about\s+)?(an?|\d+)\s+([a-z]+)$/.exec(t)
  if (!m) return raw.trim()
  const n = m[1] === 'a' || m[1] === 'an' ? 1 : Number(m[1])
  const unit = DURATION_UNIT.find(([re]) => re.test(m[2] ?? ''))
  if (!unit) return raw.trim()
  return `${n} ${n === 1 ? unit[1] : unit[2]}`
}

/**
 * A status word of another tool in the pane's language (R6: no English in status and result texts; R10: no raw
 * foreign status): `passed`/`failed`, CI conclusions, `CREATE`/`UPDATE`/`DELETE` of an Nx generator, Docker's
 * `Up 3 hours (healthy)` / `Exited (1) 2 days ago` and Compose's `running(2)` / `exited(3)`. An unknown word comes
 * back cleaned, tone `neutral`, so nothing is lost.
 */
export function translateStatus(raw: unknown): Translated {
  const text = (sanitize(raw).split('\n')[0] ?? '').trim()
  const low = text.toLowerCase()
  const exact = FOREIGN_STATUS[low.replace(/[\s-]+/g, '_')]
  if (exact) return exact
  // Docker: "Up 3 hours", "Up About an hour (healthy)", "Up 2 minutes (Paused)"
  const up = /^up\s+(.+?)(?:\s+\(([^)]+)\))?$/.exec(low)
  if (up) {
    const extra = up[2] ? FOREIGN_STATUS[up[2].replace(/^health:\s*/, '')] : undefined
    return {
      text: `läuft seit ${germanDuration(up[1] ?? '')}${extra ? ` · ${extra.text}` : ''}`,
      tone: extra && extra.tone !== 'ok' ? extra.tone : 'ok',
    }
  }
  // Compose: "running(2)", "exited(3)", "running(1), exited(2)"
  if (/^[a-z_]+\(\d+\)(,\s*[a-z_]+\(\d+\))*$/.test(low)) {
    const parts = low.split(/,\s*/).map(p => {
      const m = /^([a-z_]+)\((\d+)\)$/.exec(p)
      const word = FOREIGN_STATUS[m?.[1] ?? '']
      return { n: m?.[2] ?? '', word: word ?? { text: m?.[1] ?? p, tone: 'neutral' as Tone } }
    })
    const tone = parts.some(p => p.word.tone === 'bad')
      ? 'bad'
      : parts.every(p => p.word.tone === 'ok' || p.word === FOREIGN_STATUS.running)
        ? 'ok'
        : 'neutral'
    return { text: parts.map(p => `${p.n} ${p.word.text}`).join(' · '), tone }
  }
  // Docker: "Exited (1) 2 days ago", "Restarting (1) 14 seconds ago", "Created"
  const ended = /^(exited|restarting|dead|removing|paused)\s*(?:\((\d+)\))?\s*(?:(.+?)\s+ago)?$/.exec(low)
  if (ended) {
    const base = FOREIGN_STATUS[ended[1] ?? ''] as Translated
    const code = ended[2] !== undefined && ended[2] !== '0' ? ` (Code ${ended[2]})` : ''
    const ago = ended[3] ? ` vor ${germanDuration(ended[3])}` : ''
    return { text: `${base.text}${code}${ago}`, tone: code && ended[1] === 'exited' ? 'bad' : base.tone }
  }
  return { text, tone: 'neutral' }
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
// v3 (ds-flutter Runde 2): an aborted main-loop turn drops the queued tasks and the one it carried (the engine
// discards queued plugin prompts on an interrupt) and toasts that; a task that only waits behind a running answer
// reads „◷ Wartet auf Claude“ instead of „✓ An Claude geschickt“.
//
// Copy into another kit copy (one block, no other kit change except the two `asked` lines in `kit()`/`Kit`):
// - this section; change the plugin name of `askedAtom` (string literal);
// - types/index.d.ts: `AskedEntry` (with `probe`, `turnId`, phase `done`), `AskedState` and
//   `asked: ShapedState<AskedState>` in PluginState;
// - Kit: field `asked: AskedState`, read in `kit()` (`asked: await read($, askedAtom)`) so a render redraws;
// - hooks: `on('turn.start')` → `askTurnStart($, e)`, `on('turn.complete')` → `askTurnComplete($, e)`, each after
//   `await next(e)` (see features/register.tsx). Without them the lock ends after `ASK_TIMEOUT_MS` only.

const EMPTY_ASKED: AskedState = { busy: false, sent: {} }
// On copy into another plugin: change the plugin name (it must stay a string literal).
const askedAtom = atom({ plugin: 'unity', key: 'asked' } as const, EMPTY_ASKED, { shape: 'asked-2' })

/** Fallback end of the lock when no turn carrying the prompt comes (a reload, a host without turn events). */
export const ASK_TIMEOUT_MS = 15 * 60_000
/** How long an answered task offers „Nochmal schicken“ before the button is back to normal. */
export const ASK_DONE_MS = 30 * 60_000
/** Characters of a prompt's start that find it in a turn's text (whitespace folded). */
const PROBE_CHARS = 160

/** German texts of the ask-Claude buttons and toasts. */
export const ASK_TEXT = {
  sent: 'An Claude geschickt.',
  queued: ' – kommt nach der laufenden Antwort.',
  again: 'Schon an Claude geschickt – kommt mit der Antwort darauf.',
  label: 'An Claude geschickt',
  resend: 'Nochmal schicken',
  waiting: 'Wartet auf Claude',
  dropped: 'Abgebrochen – nicht bei Claude angekommen. Der Knopf ist wieder frei.',
  failed: 'Konnte nicht an Claude schicken.',
  ask: 'Finde die Ursache und schlag eine Lösung vor; ändere noch nichts ohne Rückfrage.',
} as const

/** Ends `text` with exactly one sentence mark: a `.` unless it already ends with `.`, `!`, `?`, `:` or `…`. */
export function sentence(text: string): string {
  const t = text.trim()
  return !t || /[.!?:…]$/.test(t) ? t : `${t}.`
}

/** The lock key of a task: the button key, else the prompt text itself. */
export function askKey(text: string, key?: string): string {
  return key ?? `text:${text}`
}

/** Folds whitespace so a prompt is found in a turn's text however the engine wrapped it. */
function fold(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The probe that finds a prompt in a turn's text: its folded start. */
export function askProbe(text: string): string {
  return fold(text).slice(0, PROBE_CHARS)
}

/** The toast of a sent prompt; `busy` adds that it comes after the running answer. */
export function askToast(base: string, busy: boolean): string {
  return busy ? `${base.trim().replace(/[.!]+$/, '')}${ASK_TEXT.queued}` : base
}

/** Whether a task is locked (sent, Claude's answer to it not ended yet). For render: pass `k.asked`. */
export function isAsked(asked: AskedState, key: string): boolean {
  const e = asked.sent[key]
  return e !== undefined && e.phase !== 'done'
}

/** Whether Claude already answered this task (its button then offers „Nochmal schicken“). */
export function isAnswered(asked: AskedState, key: string): boolean {
  return asked.sent[key]?.phase === 'done'
}

export type AskOptions = {
  /** The prompt, or a producer run after the lock is taken (e.g. take a screenshot first); `undefined` sends nothing. */
  text: string | (() => Promise<string | undefined>)
  /** Lock key (the button key); default: the text. */
  key?: string
  /** Toast when sent (default „An Claude geschickt.“); „ – kommt nach der laufenden Antwort.“ is added when busy. */
  toast?: string
}

export type AskResult = 'sent' | 'queued' | 'again' | 'skipped' | 'failed'

/** Drops answered tasks older than `ASK_DONE_MS`. */
function pruneAsked(sent: AskedState['sent'], now: number): AskedState['sent'] {
  const out: AskedState['sent'] = {}
  for (const [k, v] of Object.entries(sent)) if (v.phase !== 'done' || now - v.at < ASK_DONE_MS) out[k] = v
  return out
}

/**
 * Sends a prompt to Claude once: toasts, takes the lock in the `asked` atom (never from a render hook: call it from
 * `onPress`, a command or a tool), and keeps it until the turn carrying this prompt ended (or `ASK_TIMEOUT_MS`).
 * An answered task is sent again on a new press (its button says „Nochmal schicken“).
 */
export async function askClaude($: EngineInterface, opts: AskOptions): Promise<AskResult> {
  const key = askKey(typeof opts.text === 'string' ? opts.text : '', opts.key)
  const at = await $.clock.now()
  let dup = false
  let busy = false
  await update($, askedAtom, s => {
    const sent = pruneAsked(s.sent, at)
    dup = sent[key] !== undefined && sent[key]?.phase !== 'done'
    busy = s.busy
    return dup ? { ...s, sent } : { ...s, sent: { ...sent, [key]: { at, phase: 'queued' as const } } }
  })
  if (dup) {
    $.ui.toast(ASK_TEXT.again)
    return 'again'
  }
  const text = typeof opts.text === 'string' ? opts.text : await opts.text().catch(() => undefined)
  if (!text) {
    await releaseAsk($, key, at)
    return 'skipped'
  }
  const probe = askProbe(text)
  await update($, askedAtom, s =>
    s.sent[key]?.at === at ? { ...s, sent: { ...s.sent, [key]: { ...s.sent[key]!, probe } } } : s,
  )
  $.ui.toast(askToast(opts.toast ?? ASK_TEXT.sent, busy))
  $.clock.after(ASK_TIMEOUT_MS, () => void releaseAsk($, key, at))
  try {
    await $.prompt.submit({ text })
  } catch {
    await releaseAsk($, key, at)
    $.ui.toast(ASK_TEXT.failed)
    return 'failed'
  }
  return busy ? 'queued' : 'sent'
}

/** Drops the lock of `key` when it is still the one taken at `at` and not answered yet. */
async function releaseAsk($: EngineInterface, key: string, at: number): Promise<void> {
  await update($, askedAtom, s => {
    const e = s.sent[key]
    if (e?.at !== at || e.phase === 'done') return s
    const sent = { ...s.sent }
    delete sent[key]
    return { ...s, sent }
  })
}

/**
 * `turn.start` of the main loop (call after `await next(e)`): Claude is busy; each waiting task whose probe is in
 * this turn's text is now being answered, bound to this turn. Tasks not in the text keep waiting.
 */
export async function askTurnStart(
  $: EngineInterface,
  e: { agentId?: string; text?: string; turnId?: string },
): Promise<void> {
  if (e.agentId !== undefined) return
  const now = await $.clock.now()
  const text = fold(e.text ?? '')
  const bound: string[] = []
  await update($, askedAtom, s => {
    const sent = pruneAsked(s.sent, now)
    for (const [k, v] of Object.entries(sent))
      if (v.phase === 'queued' && v.probe && text && text.includes(v.probe)) {
        sent[k] = { ...v, phase: 'running', turnId: e.turnId }
        bound.push(k)
      }
    return { busy: true, sent }
  })
  if (bound.length) $.ui.log(`ask: turn ${e.turnId ?? '?'} carries ${bound.join(', ')}`, { to: 'debug' })
}

/** Whether a `turn.complete` is an interrupt (the person stopped the turn). */
export function isAbortedTurn(e: { isAborted?: boolean; reason?: string }): boolean {
  return e.isAborted === true || e.reason === 'aborted'
}

/**
 * `turn.complete` of the main loop (call after `await next(e)`): the tasks this turn carried are answered. An aborted
 * turn answers nothing: the queued tasks and the one it carried are dropped (never arrived), their buttons are free.
 */
export async function askTurnComplete(
  $: EngineInterface,
  e: { agentId?: string; turnId?: string; isAborted?: boolean; reason?: string },
): Promise<void> {
  if (e.agentId !== undefined) return
  const now = await $.clock.now()
  const aborted = isAbortedTurn(e)
  let dropped: string[] = []
  await update($, askedAtom, (s: AskedState): AskedState => {
    dropped = []
    const sent: AskedState['sent'] = {}
    for (const [k, v] of Object.entries(s.sent)) {
      const carried = v.phase === 'running' && v.turnId === e.turnId
      if (aborted && (carried || v.phase === 'queued')) dropped.push(k)
      else sent[k] = carried ? { at: now, phase: 'done' } : v
    }
    return { busy: false, sent }
  })
  if (dropped.length) {
    $.ui.log(`ask: turn ${e.turnId ?? '?'} aborted, released ${dropped.join(', ')}`, { to: 'debug' })
    $.ui.toast(ASK_TEXT.dropped)
  }
}

/**
 * An `Action` that asks Claude. Its label and key stay the same in every state: while the prompt is on its way
 * (`sent`), `Actions` and `ListRow` draw the button quiet (a text action) with a pill „geschickt“ directly after it
 * (the terminal: one pill at the end of the row) and a press only toasts; once Claude answered, a press sends it
 * again. Keep the label short
 * (at most two words, the same in every mod: „An Claude“, „Beheben“).
 */
export function askAction(
  $: EngineInterface,
  k: Kit,
  a: { key: string; label: string; icon?: IconName; variant?: Action['variant'] } & Omit<AskOptions, 'key'>,
): RankedAction {
  const press = (): void => void askClaude($, { text: a.text, key: a.key, toast: a.toast })
  return {
    key: a.key,
    label: a.label,
    icon: a.icon ?? 'claude',
    variant: a.variant ?? 'secondary',
    onPress: press,
    ...(isAsked(k.asked, a.key) ? { sent: true } : {}),
  }
}

/**
 * The status of a prompt that is on its way to Claude, for the status line of the card it was sent from (a form
 * whose field sends on Enter has no button that could show it): „An Claude geschickt“ while locked, else nothing.
 * Every send goes through `askClaude` with a fixed `key`: a second press or Enter then only toasts.
 */
export function askStatus(k: Kit, key: string): StatusInfo | undefined {
  return isAsked(k.asked, key) ? { text: ASK_TEXT.label, running: true } : undefined
}

/** The pill of a prompt that is on its way to Claude („geschickt“), for a row or title that shows it itself. */
export function askPill(k: Kit, key: string): PillProps | undefined {
  return isAsked(k.asked, key) ? { text: k.s.sent, tone: 'info', glyph: false } : undefined
}

/**
 * The prompt for a failed run: what failed (one sentence), the last `lines` (20) output lines without control
 * characters, the path of the full output, an optional hint (a tool to read more), then the ask for the cause and a
 * proposal — not a fix. No doubled sentence marks („. .“).
 */
export function failurePrompt(f: {
  what: string
  tail?: readonly string[]
  outputPath?: string
  hint?: string
  ask?: string
  lines?: number
}): string {
  const tail = (f.tail ?? [])
    .map(l => sanitize(l).trimEnd())
    .filter(l => l.trim() !== '')
    .slice(-(f.lines ?? 20))
    .map(l => (l.length > 300 ? `${l.slice(0, 299)}…` : l))
  return [
    sentence(f.what),
    ...(tail.length
      ? ['', `Letzte ${tail.length === 1 ? 'Ausgabezeile' : `${tail.length} Ausgabezeilen`}:`, '```', ...tail, '```']
      : []),
    ...(f.outputPath ? [`Volle Ausgabe: ${f.outputPath}`] : []),
    ...(f.hint ? [sentence(f.hint)] : []),
    '',
    f.ask ?? ASK_TEXT.ask,
  ].join('\n')
}

// --- launcher strip above the prompt (Band v4: two fixed lines, both left-aligned) ---
// Keep this section identical in every copy of the kit and in ds-usage-line's hooks/register.tsx (see README "Band").

/** Key prefix that marks a plugin's band row as a launcher row (`launch:<plugin>@<version>`), so a merger can find it. */
export const LAUNCH_PREFIX = 'launch:'
/** The band layout this copy draws. A row keyed `…@<n>` with n above it hands the merge to a newer copy. */
export const BAND_VERSION = 4
/** The plugin whose launcher row is the meter line (line 2): found by its key `launch:ds-usage-line@<n>`, any version. */
export const METER_PLUGIN = 'ds-usage-line'
/** The root key of a plugin's launcher row. */
export const launchKey = (plugin: string): string => `${LAUNCH_PREFIX}${plugin}@${BAND_VERSION}`

/**
 * Root props of a starter row (`LauncherRow`, line 1): one line that shrinks and clips, its status cut with "…". The
 * merger may not set these on its own boxes (the engine refuses `minWidth`/`overflow` on a Box holding another
 * plugin's row), so every row brings them.
 */
export const LAUNCH_ROW = {
  flexDirection: 'row',
  flexWrap: 'nowrap',
  alignItems: 'center',
  flexShrink: 1,
  minWidth: 0,
  overflow: 'hidden',
} as const
/**
 * Root props of the meter row (ds-usage-line, line 2): one line, left-aligned, as wide as its content, never wraps.
 * Its key (`launch:ds-usage-line@<n>`) marks it as the meter line (`isTrailing`), not its props. It fits itself to
 * `bodyColumns` (drops "bis …", then shortens its bars), so nothing on line 1 changes it.
 */
export const LAUNCH_METERS = {
  flexDirection: 'row',
  flexWrap: 'nowrap',
  alignItems: 'center',
  justifyContent: 'flex-start',
  flexShrink: 0,
} as const
/** Space between the starters on line 1, inside a row and between rows alike: even gaps. */
export const starterGap = (graphical: boolean): number | 'md' => (graphical ? 'md' : 2)

export type LauncherChipProps = {
  key: string
  /** Unused since Kit v3.2 (launcher chips carry no glyph: "Solutions", not "▦ Solutions"); kept for callers. */
  icon?: IconName
  label: string
  /**
   * A short state after the chip ("Gerät fehlt", "Tests laufen", "Call 15:30", "Runde 2"), a few words; the first thing
   * cut with "…" when line 1 gets tight. Band v4: only drawn with a `tone` that says it matters (see `tone`).
   */
  status?: string
  /**
   * Whether and how the status stands. Band v4 rule: a quiet state shows no text, so each starter decides here.
   * `warn`/`bad`: needs the person, drawn in color. `ok`/`info`: something really runs or waits ("Tests laufen",
   * "App startet", "Tisch läuft", "Entwurf bereit"), drawn quiet. `neutral` or none: calm ("Editor bereit",
   * "verbunden", "läuft nicht"), no text at all, only the name.
   */
  tone?: Tone
  /** The chip that matters now: `variant: 'primary'` (at most one per row). */
  primary?: boolean
  onPress: () => void
}

/** Whether a status tone is drawn in color: only what needs the person (warn, bad); the rest stays quiet. */
const loud = (tone?: Tone): tone is 'warn' | 'bad' => tone === 'warn' || tone === 'bad'
/** Whether a chip's status stands at all (Band v4): only with a tone that is not calm (`neutral`/none show no text). */
export const showsStatus = (c: { status?: string; tone?: Tone }): boolean =>
  !!c.status && (c.tone === 'warn' || c.tone === 'bad' || c.tone === 'ok' || c.tone === 'info')

/**
 * One starter chip of line 1: a native Button with the bare name (pressable as a whole, no glyph) and, when it
 * matters (`showsStatus`), its status close after it ("Flutter · Gerät fehlt"). The button never shrinks; the status
 * is cut with "…". The terminal draws `[ label ]` and the status dim.
 */
export function LauncherChip(k: Kit, c: LauncherChipProps): RenderElement {
  const { Box, Text, Button } = k
  const btn = (
    <Button
      key={c.key}
      label={c.label}
      variant={c.primary ? 'primary' : undefined}
      plain={c.primary ? undefined : true}
      onPress={c.onPress}
    >
      {c.label}
    </Button>
  )
  if (!c.status || !showsStatus(c)) return btn
  const tone = loud(c.tone) ? c.tone : undefined
  const status = k.graphical ? (
    <Text size="footnote" color={tone ? k.t.tones[tone].fg : k.t.faint} wrap="truncate-end">
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
  )
  return (
    <Box
      key={`${c.key}-chip`}
      flexDirection="row"
      flexWrap="nowrap"
      alignItems="center"
      gap={k.graphical ? 'xs' : 1}
      flexShrink={1}
      minWidth={0}
      overflow="hidden"
    >
      <Box key={`${c.key}-btn`} flexShrink={0}>
        {btn}
      </Box>
      {status}
    </Box>
  )
}

/**
 * A plugin's launcher row for its `AbovePrompt` hook: chips in one line that shrinks and clips (`LAUNCH_ROW`), keyed
 * `launch:<plugin>@4` so `mergeLauncherRows` (any installed plugin's) puts it on line 1 with every other starter.
 */
export function LauncherRow(k: Kit, r: { plugin: string; chips: Kids }): RenderElement {
  const { Box } = k
  return (
    <Box key={launchKey(r.plugin)} {...LAUNCH_ROW} gap={starterGap(k.graphical)}>
      {kids(r.chips)}
    </Box>
  )
}

type BandRow = { plugin: string; tree: RenderElement }
type BandNode = { type?: unknown; props?: Record<string, unknown>; children?: unknown; press?: unknown }
/** A Button in a settled tree: its handler sits in `press` once drawn, in `props.onPress` before. */
const isPressable = (n: BandNode): boolean =>
  n.type === 'Button' || n.press !== undefined || typeof n.props?.onPress === 'function'
const rootProps = (row: BandRow) => (row.tree as { props?: { key?: unknown; justifyContent?: unknown } }).props

/** Whether a band row is a launcher row (its root Box keyed `launch:…`). */
export function isLauncherRow(row: BandRow): boolean {
  const key = rootProps(row)?.key
  return typeof key === 'string' && key.startsWith(LAUNCH_PREFIX)
}

/**
 * Whether a launcher row is the meter line (line 2): its root key is `launch:ds-usage-line@<n>` (v2, v3 and v4 alike).
 * Not its alignment: since v4 the meter line is left-aligned like the starters.
 */
export function isTrailing(row: BandRow): boolean {
  const key = rootProps(row)?.key
  return typeof key === 'string' && key.startsWith(`${LAUNCH_PREFIX}${METER_PLUGIN}@`)
}

/** The band version a launcher row was drawn for: the `@<n>` of its key, 1 for a row keyed before v2. */
export function bandVersion(row: BandRow): number {
  const m = /@(\d+)$/.exec(String(rootProps(row)?.key ?? ''))
  return m ? Number(m[1]) : 1
}

const nodeKids = (n: BandNode): unknown[] => {
  const c = n.children ?? n.props?.children
  return Array.isArray(c) ? c.flat(8) : c === undefined || c === null || c === false ? [] : [c]
}
const plainText = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number'
    ? String(n)
    : n && typeof n === 'object'
      ? nodeKids(n as BandNode)
          .map(plainText)
          .join('')
      : ''

/** The names of a starter row's buttons (their `label`), in order. */
export function starterLabels(row: BandRow): string[] {
  const out: string[] = []
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    const p = (n as BandNode).props ?? {}
    if (isPressable(n as BandNode)) {
      out.push(String(p.label ?? plainText(n)))
      return
    }
    for (const c of nodeKids(n as BandNode)) walk(c)
  }
  walk(row.tree)
  return out
}

/** Cells a status keeps at least before its row moves into "+N": "Gerät…" (and the "· " before it). */
const STATUS_MIN = 8
/**
 * The fewest cells a starter row takes on line 1 (pure): every button whole (`[ label ]`, 4 for its frame), every
 * status cut to `STATUS_MIN`, the row's gaps. An estimate from the tree: the row itself still shrinks and clips.
 */
export function starterMinWidth(row: BandRow): number {
  let cells = 0
  let parts = 0
  const walk = (n: unknown): void => {
    if (typeof n === 'string' || typeof n === 'number') {
      cells += Math.min([...String(n)].length, STATUS_MIN) + 1
      parts++
      return
    }
    if (!n || typeof n !== 'object') return
    const p = (n as BandNode).props ?? {}
    if (isPressable(n as BandNode)) {
      cells += [...String(p.label ?? plainText(n))].length + 4
      parts++
      return
    }
    for (const c of nodeKids(n as BandNode)) walk(c)
  }
  walk(row.tree)
  return cells + Math.max(0, parts - 1) * 2
}

/**
 * Which starters stand on line 1 and which go into "+N" (pure): all while their least widths fit `columns`, else the
 * last ones move into "+N" until the rest and the "+N" chip fit; one starter always stays.
 */
export function fitStarters<T extends BandRow>(starters: readonly T[], columns: number): { shown: T[]; hidden: T[] } {
  const gap = 2
  const need = (rows: readonly T[]) =>
    rows.reduce((sum, r) => sum + starterMinWidth(r), 0) + Math.max(0, rows.length - 1) * gap
  const shown = [...starters]
  const hidden: T[] = []
  const more = () => (hidden.length ? gap + `+${hidden.length}`.length + 2 : 0)
  while (shown.length > 1 && need(shown) + more() > columns) hidden.unshift(shown.pop()!)
  return { shown, hidden }
}

/** Cells the "‹" chip takes on a later page (`[ ‹ ]` and the gap after it). */
const BACK_CELLS = 7

/**
 * Line 1 in pages (pure): page 1 is what `fitStarters` keeps, each later page takes the next starters that fit beside
 * a "‹" (and a "+N" while more follow). One page when all fit; every page holds at least one starter.
 */
export function starterPages<T extends BandRow>(starters: readonly T[], columns: number): T[][] {
  const pages: T[][] = []
  let rest = [...starters]
  while (rest.length) {
    const { shown, hidden } = fitStarters(rest, pages.length ? columns - BACK_CELLS : columns)
    pages.push(shown)
    rest = hidden
  }
  return pages
}

/**
 * The page of line 1 the person turned to with "+N" / "‹". Kept in this module (the copy whose merger draws the band
 * holds it; a render hook may not write `$.state`), back to the first page as soon as all starters fit again.
 */
let bandPage = 0

/** Turns line 1 to `page` and asks for a redraw of the band. */
function turnBandPage($: EngineInterface, page: number): void {
  bandPage = Math.max(0, page)
  try {
    $.ui.invalidate('ui.render' as never)
  } catch {
    // drawn anew with the next frame
  }
}

/** The fine rule between the lines on graphical surfaces: a 1-px hairline wider than any slot, clipped to it. */
const HAIRLINE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1" viewBox="0 0 4000 1" preserveAspectRatio="none">' +
  '<style>rect{fill:rgba(0,0,0,.12)}@media (prefers-color-scheme: dark){rect{fill:rgba(255,255,255,.14)}}</style>' +
  '<rect width="4000" height="1"/></svg>'

/**
 * The `AbovePromptList` hook that lays the band out in **two fixed lines**, both left-aligned:
 *
 * 1. **Starters** of every mod, in their order, one line that never wraps: each row shrinks and clips by itself
 *    (`LAUNCH_ROW`), statuses go first with "…"; what does not fit at all moves behind a quiet "+N": a press turns
 *    line 1 to those starters (with "‹" to turn back). No hover card: no popups in the band.
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
  e: RenderInput<'AbovePromptList'>,
  next: (e: RenderInput<'AbovePromptList'>) => Promise<unknown>,
): Promise<unknown> {
  const rows = e.props.rows
  const found = rows.filter(isLauncherRow)
  if (found.length < 2) return next(e)
  if (found.some(row => bandVersion(row) > BAND_VERSION)) return next(e)
  const columns = Number(e.props.bodyColumns) || 80
  const pages = starterPages(
    found.filter(row => !isTrailing(row)),
    columns,
  )
  // all fit again: the next overflow starts on page 1
  if (pages.length <= 1) bandPage = 0
  const page = Math.min(bandPage, Math.max(0, pages.length - 1))
  const shown = pages[page] ?? []
  const after = pages.slice(page + 1).reduce((n, p) => n + p.length, 0)
  const meterRows = found.filter(isTrailing)
  const others = rows.filter(row => !isLauncherRow(row))
  const only = async (subset: readonly BandRow[]) =>
    (await next({ ...e, props: { ...e.props, rows: subset } })) as RenderElement
  const starters: RenderElement[] = []
  for (const row of shown) starters.push(await only([row]))
  const meters: RenderElement[] = []
  for (const row of meterRows) meters.push(await only([row]))
  const rest = others.length ? await only(others) : null
  const { Box, Text, Svg, Button } = $.ui.resolve(e) as unknown as Els
  const graphical = String((e as { surface?: string }).surface ?? 'terminal') !== 'terminal'
  // "+N" turns line 1 to the starters that did not fit, "‹" back: same height, nothing wraps, line 2 stays. Quiet
  // plain buttons, no hover card (it would cover the prompt).
  const pager = (key: string, label: string, to: number) => (
    <Button key={key} label={label} plain onPress={() => turnBandPage($, to)}>
      {label}
    </Button>
  )
  const back = page > 0 ? pager('launch-back', '‹', page - 1) : null
  const more = after ? pager('launch-more', `+${after}`, page + 1) : null
  // Only flex props on boxes that hold other plugins' rows: the engine refuses `minWidth`/`overflow` there.
  const line1 = starters.length ? (
    <Box key="launch-strip" flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={starterGap(graphical)}>
      {back}
      {starters}
      {more}
    </Box>
  ) : null
  // A hairline with inner margin: an Svg clipped to its slot on graphical surfaces (a Text of '─' is wider there than
  // the slot and ends in "…"), a dim line two cells short of the width in the terminal.
  const rule =
    line1 && meters.length ? (
      <Box key="launch-rule" flexDirection="row" paddingX={graphical ? 'sm' : 1} paddingY={graphical ? 'xs' : 0}>
        {graphical && Svg ? (
          <Svg source={HAIRLINE} alt="" height={1} />
        ) : (
          <Text dimColor>{'─'.repeat(Math.max(1, columns - 2))}</Text>
        )}
      </Box>
    ) : null
  // A column that sizes the meter row to its content: line 2 stands left and never stretches (older right-aligned
  // usage rows too). Only flex props: it holds another plugin's row.
  const line2 = meters.length ? (
    <Box key="launch-meters" flexDirection="column" alignItems="flex-start">
      {meters}
    </Box>
  ) : null
  return (
    <Box key="launch-band" flexDirection="column">
      {line1}
      {rule}
      {line2}
      {rest}
    </Box>
  )
}
