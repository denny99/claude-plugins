/**
 * Shared UI kit (UX.md): one visual language for every pane and hub tab. Copy this file into sibling plugins as is.
 *
 * Components are plain functions taking the kit `k` first (not JSX components): `Row(k, {...})`. Build `k` once per
 * render with `const k = await kit($, e)`; it carries the surface's element constructors, the body size and the kit's
 * own small state (two-step confirms, collapsed sections, overflow menus, error details, log expansion), so a render
 * hook never threads `$` into the components (the validator only lets `$` cross into function declarations).
 *
 * Glyphs: ✓ green ok · ✗ red failed · ● yellow running/pending · ○ dim idle · ↑ yellow update available ·
 * ⚠ yellow warning (lint/tsc warnings only).
 */
import { atom, read, update } from 'claude-code'
import type { RenderInput, EngineInterface, RenderElement } from 'claude-code'

import type { UiKitState } from '../types'

const EMPTY_UI: UiKitState = { toggled: [], more: [], details: [], logMore: [] }
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

type Els = {
  Box: (props: Record<string, unknown>) => RenderElement
  Text: (props: Record<string, unknown>) => RenderElement
  Button: (props: Record<string, unknown>) => RenderElement
}

export type Kit = Els & {
  /** Columns of the pane body (`e.props.bodyColumns`, else the viewport's). */
  cols: number
  /** Rows of the pane body (`e.props.scroll.bodyRows`, else the viewport's). */
  rows: number
  /** Narrow or mobile: one column, secondary text hidden. */
  compact: boolean
  surface: string
  state: UiKitState
  isOpen: (key: string, defaultOpen?: boolean) => boolean
  toggle: (key: string) => void
  isMore: (key: string) => boolean
  toggleMore: (key: string) => void
  isConfirming: (key: string) => boolean
  askConfirm: (key: string) => void
  clearConfirm: () => void
  hasDetails: (key: string) => boolean
  toggleDetails: (key: string) => void
  isLogMore: (key: string) => boolean
  toggleLogMore: (key: string) => void
}

function flip(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter(k => k !== key) : [...list, key]
}

/** Patches the kit state (exported for tests and for actions that reset a confirm). */
export async function patchUi(
  $: EngineInterface,
  patch: Partial<UiKitState> | ((s: UiKitState) => Partial<UiKitState>),
): Promise<void> {
  await update($, uiAtom, s => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
}

/** Builds the kit for one render: elements, body size and kit state (subscribes the drawing to it). */
export async function kit($: EngineInterface, e: RenderInput<'Pane'>): Promise<Kit> {
  const els = $.ui.resolve(e) as unknown as Els
  const state = await read($, uiAtom)
  const props = (e as { props?: { bodyColumns?: number; scroll?: { bodyRows?: number } } }).props ?? {}
  const viewport = (e as { viewport?: { columns?: number; rows?: number } }).viewport
  const cols = Math.max(20, props.bodyColumns ?? viewport?.columns ?? 80)
  const rows = Math.max(8, props.scroll?.bodyRows ?? viewport?.rows ?? 30)
  const surface = String((e as { surface?: string }).surface ?? 'terminal')
  return {
    Box: els.Box,
    Text: els.Text,
    Button: els.Button,
    cols,
    rows,
    compact: surface === 'mobile' || cols < 60,
    surface,
    state,
    isOpen: (key, defaultOpen = true) => (state.toggled.includes(key) ? !defaultOpen : defaultOpen),
    toggle: key => void patchUi($, s => ({ toggled: flip(s.toggled, key) })),
    isMore: key => state.more.includes(key),
    toggleMore: key => void patchUi($, s => ({ more: flip(s.more, key) })),
    isConfirming: key => state.confirm === key,
    askConfirm: key => void patchUi($, { confirm: key }),
    clearConfirm: () => void patchUi($, { confirm: undefined }),
    hasDetails: key => state.details.includes(key),
    toggleDetails: key => void patchUi($, s => ({ details: flip(s.details, key) })),
    isLogMore: key => state.logMore.includes(key),
    toggleLogMore: key => void patchUi($, s => ({ logMore: flip(s.logMore, key) })),
  }
}

// --- components ---

export type Action = {
  key: string
  label: string
  onPress: () => void
  /** Destructive: two-step via ConfirmButton; a string is the confirm label ("Really delete?"). */
  confirm?: boolean | string
  primary?: boolean
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

/** Two-step destructive button: first press turns it into "Really …?" + Cancel. */
export function ConfirmButton(
  k: Kit,
  a: { key: string; label: string; confirmLabel?: string; onConfirm: () => void },
): RenderElement {
  const { Box, Button } = k
  if (!k.isConfirming(a.key))
    return (
      <Button key={a.key} plain onPress={() => k.askConfirm(a.key)}>
        {a.label}
      </Button>
    )
  return (
    <Box flexDirection="row" gap={1}>
      <Button
        key={a.key}
        variant="primary"
        onPress={() => {
          k.clearConfirm()
          a.onConfirm()
        }}
      >
        {a.confirmLabel ?? `Really ${a.label.toLowerCase()}?`}
      </Button>
      <Button key={`${a.key}-cancel`} plain onPress={() => k.clearConfirm()}>
        Cancel
      </Button>
    </Box>
  )
}

/** One action button (plain, or two-step when `confirm`). */
export function ActionButton(k: Kit, a: Action): RenderElement {
  const { Button } = k
  if (a.confirm)
    return ConfirmButton(k, {
      key: a.key,
      label: a.label,
      confirmLabel: typeof a.confirm === 'string' ? a.confirm : undefined,
      onConfirm: a.onPress,
    })
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
}

/** A wrapped row of buttons: at most `max` (3) shown, the rest behind a "…" toggle keyed `${key}-more`. */
export function Actions(k: Kit, key: string, actions: Action[], max = 3): RenderElement | null {
  const { Box, Button } = k
  if (!actions.length) return null
  const open = k.isMore(key)
  const shown = actions.length > max && !open ? actions.slice(0, max) : actions
  return (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      {shown.map(a => ActionButton(k, a))}
      {actions.length > max && (
        <Button key={`${key}-more`} plain onPress={() => k.toggleMore(key)}>
          {open ? '‹' : '…'}
        </Button>
      )}
    </Box>
  )
}

/** Header row: title, dim context (repo · branch), actions right with Refresh ⟳ last. */
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
  // The context only fits beside a title that leaves room for it ("  " + a few chars); else the line overflows.
  const room = k.cols - [...title].length - 2
  const ctx = hd.context && !k.compact && room >= 4 ? truncate(hd.context, room) : ''
  return (
    <Box flexDirection="column">
      <Text bold>
        {title}
        {ctx ? <Text dimColor>{`  ${ctx}`}</Text> : null}
      </Text>
      {((hd.actions?.length ?? 0) > 0 || hd.onRefresh) && (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
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
    children: (RenderElement | null | false | undefined)[] | RenderElement | null
  },
): RenderElement {
  const { Box, Text, Button } = k
  const open = s.collapsible ? k.isOpen(s.key, s.defaultOpen ?? true) : true
  const count = s.count === undefined || s.count === '' ? '' : ` ${s.count}`
  const label = truncate(`${s.collapsible ? (open ? '▾ ' : '▸ ') : ''}${s.title}`, k.cols)
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
  const kids = (Array.isArray(s.children) ? s.children : [s.children]).filter(Boolean) as RenderElement[]
  return (
    <Box flexDirection="column">
      {s.actions?.length ? (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {head}
          {s.actions.map(a => ActionButton(k, a))}
        </Box>
      ) : (
        head
      )}
      {open && kids}
    </Box>
  )
}

/** Row: leading glyph + primary, dim secondary (hidden when compact), ≤3 actions + "…" overflow. */
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

/** Empty state: one dim line. */
export function EmptyState(k: Kit, text: string): RenderElement {
  return Line(k, text, { dim: true })
}

/** Loading state: one dim line. */
export function LoadingState(k: Kit, text = 'Loading…'): RenderElement {
  return Line(k, text, { dim: true })
}

/** Error state: red one-liner + Details toggle (`${key}-details`) + Retry (`${key}-retry`); no stack in the main view. */
export function ErrorState(
  k: Kit,
  err: { key: string; message: string; details?: string; onRetry?: () => void },
): RenderElement {
  const { Box, Text, Button } = k
  const lines = sanitize(err.message).split('\n')
  const first = lines[0] || 'Something went wrong.'
  const details = [err.details ? sanitize(err.details) : '', ...lines.slice(1)].filter(Boolean).join('\n')
  const shown = k.hasDetails(err.key)
  return (
    <Box flexDirection="column">
      <Text color="red">{truncate(`✗ ${first}`, k.cols)}</Text>
      {(details || err.onRetry) && (
        <Box flexDirection="row" gap={1}>
          {details ? (
            <Button key={`${err.key}-details`} plain onPress={() => k.toggleDetails(err.key)}>
              {shown ? 'Hide details' : 'Details'}
            </Button>
          ) : null}
          {err.onRetry ? (
            <Button key={`${err.key}-retry`} plain onPress={err.onRetry}>
              Retry
            </Button>
          ) : null}
        </Box>
      )}
      {shown &&
        details
          .split('\n')
          .slice(0, Math.max(3, k.rows - 6))
          .map(l => <Text dimColor>{truncate(l || ' ', k.cols)}</Text>)}
    </Box>
  )
}

/** Long output: newest lines at the bottom, bounded to the body rows; "Show more" (`${key}-more`) widens it. */
export function LogBox(
  k: Kit,
  b: { key: string; title?: string; lines: readonly string[]; rows?: number; onClose?: () => void },
): RenderElement {
  const { Box, Text, Button } = k
  const base = b.rows ?? Math.max(4, Math.floor(k.rows / 2) - 2)
  const more = k.isLogMore(b.key)
  const room = more ? base * 4 : base
  const all = b.lines.flatMap(l => sanitize(l).split('\n'))
  const shown = all.slice(-room)
  const hidden = all.length - shown.length
  return (
    <Box flexDirection="column">
      {(b.title || b.onClose) && (
        <Box flexDirection="row" gap={1}>
          {b.title ? <Text bold>{truncate(b.title, Math.max(1, k.cols - 4))}</Text> : null}
          {b.onClose ? (
            <Button key={`${b.key}-close`} plain onPress={b.onClose}>
              ✕
            </Button>
          ) : null}
        </Box>
      )}
      {(hidden > 0 || more) && (
        <Button key={`${b.key}-more`} plain onPress={() => k.toggleLogMore(b.key)}>
          {more ? 'Show less' : `Show more (${hidden} earlier)`}
        </Button>
      )}
      {shown.map(l => (
        <Text dimColor>{truncate(l || ' ', k.cols)}</Text>
      ))}
    </Box>
  )
}

/** Tab bar: one Button per tab keyed `tab-${id}`, the active one primary; wraps on narrow bodies. */
export function Tabs<T extends string>(
  k: Kit,
  t: { tabs: { id: T; label: string; badge?: string }[]; active: T; onSelect: (id: T) => void },
): RenderElement {
  const { Box, Button } = k
  return (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      {t.tabs.map(tab => (
        <Button
          key={`tab-${tab.id}`}
          plain={tab.id === t.active ? undefined : true}
          variant={tab.id === t.active ? 'primary' : undefined}
          onPress={() => t.onSelect(tab.id)}
        >
          {`${tab.label}${tab.badge ? ` ${tab.badge}` : ''}`}
        </Button>
      ))}
    </Box>
  )
}
