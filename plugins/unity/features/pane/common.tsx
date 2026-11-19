/** Helpers the pane's tabs share (no tab imports here, so tabs and the shell never import each other). */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { ModelConsoleEntry, UnityModel, UnityTab } from '../../types'
import { BRIDGE_VERSION } from '../../lib/bridge'
import { batchAllowed } from '../../lib/unity'
import { askAction, askClaude, Card, type Action, type Kit } from '../../lib/ui'
import { batchTarget, bridgeOutdatedTitle, cancelTests, patchModel, unlockBridgePackage, type Options } from '../state'

/** Elements the kit does not wrap. */
export type Extra = {
  Input: (p: Record<string, unknown>) => RenderElement
  Select: (p: Record<string, unknown>) => RenderElement
  Link: (p: Record<string, unknown>) => RenderElement
}

export const BRIDGE_GIT_URL =
  'https://github.com/denny99/claude-plugins.git?path=/plugins/unity/bridge/com.denny99.claude-bridge'
/** The git tag of the bridge version this plugin ships (set it when releasing the plugin). */
export const BRIDGE_TAG = `unity-bridge-v${BRIDGE_VERSION}`
/** Install address pinned to {@link BRIDGE_TAG}: Unity locks a git package to one commit, a tag names it. */
export const BRIDGE_GIT_URL_TAGGED = `${BRIDGE_GIT_URL}#${BRIDGE_TAG}`
export const BRIDGE_README =
  'https://github.com/denny99/claude-plugins/tree/main/plugins/unity/bridge/com.denny99.claude-bridge'

/** What a „Reparieren“ prompt asks for, in the pane's language. */
export const FIX_ASK = {
  compile: 'Behebe diesen Unity-Kompilierfehler',
  test: 'Repariere diesen fehlschlagenden Unity-Test',
  console: 'Kläre diese Meldung aus der Unity-Konsole und behebe die Ursache',
} as const

/** The prompt text: `<ask>:\n\n<detail>`. */
export function fixPrompt(ask: string, detail: string): string {
  return `${ask}:\n\n${detail}`
}

/** Hands a problem to Claude as a prompt (once per `key` until Claude answered it; kit „ask Claude“). */
export async function fixWithClaude($: EngineInterface, ask: string, detail: string, key?: string): Promise<void> {
  await askClaude($, { text: fixPrompt(ask, detail), key })
}

/** A „Reparieren“ button: locked (pill „geschickt“) until Claude answered this prompt. */
export function fixAction($: EngineInterface, k: Kit, key: string, ask: string, detail: string): Action {
  return askAction($, k, { key, label: 'Reparieren', icon: 'claude', text: fixPrompt(ask, detail) })
}

/**
 * A button handler: marks the pane busy, toasts the first line of the result, keeps a thrown error in the model (the
 * pane's status line shows it until the next press).
 */
export function run($: EngineInterface, label: string, work: () => Promise<string | undefined | void>): () => void {
  return () =>
    void (async () => {
      await patchModel($, { busy: label, error: undefined })
      try {
        const text = await work()
        if (text) void $.ui.toast(text.split('\n')[0] ?? text)
      } catch (e) {
        await patchModel($, { error: e instanceof Error ? e.message : String(e) })
      } finally {
        await patchModel($, { busy: undefined })
      }
    })()
}

export function selectTab($: EngineInterface, tab: UnityTab): () => void {
  return () => void patchModel($, { tab })
}

export function msg(r: { ok: boolean; error?: string }, okText: string): string {
  return r.ok ? okText : `Fehlgeschlagen: ${r.error ?? ''}`
}

/** German decimal: 8.14 → "8,1". */
export function dec(n: number, digits = 1): string {
  return (Number.isFinite(n) ? n : 0).toFixed(digits).replace('.', ',')
}

/**
 * Wall-clock length of a test run in seconds: finishedAt − startedAt (ms) when both are known, else the sum of the
 * test durations (which leaves out setup, domain reloads and Play-mode entry, so it can say "0 s" for a 12 s run).
 */
export function runSeconds(t: {
  startedAt?: number
  finishedAt?: number
  results: { duration?: number }[]
}): number | undefined {
  if (t.startedAt && t.finishedAt && t.finishedAt >= t.startedAt) return (t.finishedAt - t.startedAt) / 1000
  const sum = t.results.reduce((s, r) => s + (r.duration ?? 0), 0)
  return sum > 0 ? sum : undefined
}

/** "12 s", "1,4 s", "0,2 s", "2 min 5 s". */
export function runLength(secs: number): string {
  if (secs >= 60) {
    const s = Math.round(secs)
    return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`
  }
  return secs >= 10 ? `${Math.round(secs)} s` : `${dec(secs, secs < 0.05 ? 2 : 1)} s`
}

/** German thousands: 1204 → "1.204". */
export function thousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** "vor 12 s", "vor 4 min", "vor 2 h", "vor 3 Tagen". */
export function ago(now: number, at: number | undefined): string {
  if (!at) return ''
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return `vor ${s} s`
  if (s < 3600) return `vor ${Math.round(s / 60)} min`
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`
  const d = Math.round(s / 86400)
  return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`
}

const two = (n: number) => String(n).padStart(2, '0')

/** "14:32" in local time. */
export function clockTime(at: number): string {
  const d = new Date(at)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/** "18.11.2026" in local time. */
export function localDay(at: number): string {
  const d = new Date(at)
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** "18.11.2026 14:32" in local time. */
export function localDateTime(at: number): string {
  return `${localDay(at)} ${clockTime(at)}`
}

/** "202611181432" in local time, for names a human reads (worktrees). */
export function localStamp(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}${two(d.getHours())}${two(d.getMinutes())}`
}

/** Where batch runs go and whether they may, as one sentence. */
export function targetSentence(m: UnityModel): { text: string; ok: boolean } {
  const target = batchTarget(m)
  const allowed = batchAllowed({ lock: target.lock, bridgeUp: target.bridgeUp })
  const where = target.worktree ? `Worktree ${target.worktree}` : 'Hauptprojekt'
  const editor = m.bridge.up
    ? 'Editor offen — Hintergrund-Läufe gehen nur im Worktree'
    : m.lock === 'held'
      ? 'Editor offen, aber nicht verbunden — Hintergrund-Läufe nur im Worktree'
      : m.lock === 'stale'
        ? 'alte Sperrdatei'
        : 'kein Editor offen'
  const runs = target.worktree ? (allowed.ok ? 'Tests laufen im Hintergrund' : 'Hintergrund-Läufe gesperrt') : editor
  return { text: `${where} · ${runs}`, ok: allowed.ok || m.bridge.up }
}

/** Regex-escapes a full test name for an exact filter. */
export function exactFilter(names: string[]): string {
  return names.map(n => `^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).join(';')
}

/** "Bridge aktualisieren": frees the bridge's lock entry (two-step; writes only on the second press). */
export function bridgeUpdateAction($: EngineInterface, options: Options, primary = true): Action {
  return {
    key: 'bridge-update',
    label: 'Bridge aktualisieren',
    icon: 'download',
    variant: primary ? 'primary' : 'secondary',
    confirm: 'Sperre in packages-lock.json lösen?',
    onPress: run($, 'bridge update', () => unlockBridgePackage($, options)),
  }
}

/** The way out of an old bridge: what is installed and needed (title), the button, the address for the manual way. */
export function bridgeUpdateCard($: EngineInterface, k: Kit, m: UnityModel, options: Options): RenderElement {
  return Card(k, {
    key: 'bridge-outdated',
    tone: 'warn',
    title: { icon: 'download', title: bridgeOutdatedTitle(m), tone: 'warn' },
    hint: 'Unity aktualisiert Git-Pakete nicht von selbst: erst ohne die Sperre in Packages/packages-lock.json lädt der Editor die neue Bridge.',
    actions: [
      bridgeUpdateAction($, options),
      // copying is a text action (R1): it triggers nothing, the address is for adding the package by hand
      {
        key: 'copy-bridge-url-update',
        label: 'Adresse kopieren',
        variant: 'link',
        // the button hands its surface along, so the toast shows where the press was
        onPress: ((e?: { surface?: string }) => k.copy(BRIDGE_GIT_URL_TAGGED, e?.surface)) as () => void,
      },
    ],
  })
}

/**
 * A running run's progress: "12 von 80 · 1:05". The count only with a plausible total (> 0 and not below what is done;
 * older bridges reported the whole suite, newer ones 0 when they cannot count), else "12 Tests fertig".
 */
export function testsProgress(t: NonNullable<UnityModel['tests']>, now: number): string {
  const done = t.results.length
  const parts: string[] = []
  if (t.total && t.total > 0 && t.total >= done) parts.push(`${done} von ${t.total}`)
  else if (done) parts.push(`${done} ${done === 1 ? 'Test' : 'Tests'} fertig`)
  if (t.startedAt && now >= t.startedAt) {
    const s = Math.floor((now - t.startedAt) / 1000)
    parts.push(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
  }
  return parts.join(' · ')
}

/** „Stoppen“ for the running test run (two-step). */
export function stopTestsAction($: EngineInterface, options: Options): Action {
  return {
    key: 'tests-stop',
    label: 'Stoppen',
    icon: 'stop',
    variant: 'secondary',
    confirm: 'Testlauf wirklich stoppen?',
    onPress: run($, 'stop tests', () => cancelTests($, options)),
  }
}

/** Where an entry comes from: the first script path in message or stack, and the package when it is one. */
export function consoleOrigin(
  c: Pick<ModelConsoleEntry, 'message' | 'stack'>,
): { file: string; pkg?: string } | undefined {
  const text = `${c.message}\n${c.stack ?? ''}`
  const hit = /((?:\.\/)?(?:Assets|Packages|Library\/PackageCache)\/[^\s():]+?\.cs)(?::(\d+)|\((\d+),\d+\))?/.exec(text)
  if (!hit) return undefined
  const path = hit[1] ?? ''
  const line = hit[2] ?? hit[3]
  const pkg = /PackageCache\/([^@/]+)/.exec(path)?.[1] ?? /^(?:\.\/)?Packages\/([^/]+)/.exec(path)?.[1]
  const file = `${path.split('/').pop() ?? path}${line ? `:${line}` : ''}`
  return pkg ? { file, pkg } : { file }
}

/**
 * The prompt of "An Claude geben" for console entries. Entries from our own code ask for a fix; entries from a package
 * (HDRP, Input System …) say where they come from (package, file:line) and ask to judge whether our code triggers
 * them, without changing the package — the panel itself says "nicht aus deinem Spiel-Code". A mixed choice gets two
 * clearly separated parts.
 */
export function consolePrompt(groups: { entry: Pick<ModelConsoleEntry, 'type' | 'message' | 'stack'>; count: number }[]): string {
  const text = (g: (typeof groups)[number]): string =>
    `${g.count > 1 ? `[×${g.count}] ` : ''}${`${g.entry.message}\n${g.entry.stack ?? ''}`.trim()}`
  const word = (gs: typeof groups): string =>
    gs.every(g => g.entry.type === 'Warning')
      ? gs.length === 1
        ? 'Warnung'
        : 'Warnungen'
      : gs.some(g => g.entry.type === 'Warning')
        ? 'Meldungen'
        : 'Fehler'
  const own = groups.filter(g => !consoleOrigin(g.entry)?.pkg)
  const pkg = groups.filter(g => !!consoleOrigin(g.entry)?.pkg)
  const parts: string[] = []
  if (own.length)
    parts.push(
      fixPrompt(
        own.length === 1 && !pkg.length
          ? `${FIX_ASK.console} (${own[0]!.entry.type})`
          : `${FIX_ASK.console} (${own.length} ${word(own)} aus unserem Code)`,
        own
          .map(g => {
            const o = consoleOrigin(g.entry)
            return `${o ? `Herkunft: ${o.file}\n` : ''}${text(g)}`
          })
          .join('\n\n'),
      ),
    )
  if (pkg.length) {
    const names = [...new Set(pkg.map(g => consoleOrigin(g.entry)!.pkg!))]
    const w = word(pkg)
    const one = pkg.length === 1
    parts.push(
      fixPrompt(
        `${one ? w : `${pkg.length} ${w}`} aus ${names.length === 1 ? `Paket ${names[0]}` : `den Paketen ${names.join(', ')}`} ` +
          `(nicht aus unserem Spiel-Code): ordne ein, ob unser Code ${one ? (w === 'Warnung' ? 'sie' : 'ihn') : 'sie'} auslöst. ` +
          'Das Paket selbst nicht ändern – liegt die Ursache dort, sag mir das und was wir auf unserer Seite tun können',
        pkg
          .map(g => {
            const o = consoleOrigin(g.entry)!
            return `Herkunft: Paket ${o.pkg} · ${o.file}\n${text(g)}`
          })
          .join('\n\n'),
      ),
    )
  }
  return parts.join('\n\n---\n\n')
}

/** Same type and message collapsed into one entry (the latest), counted — like Unity's Collapse. */
export function collapseConsole(entries: ModelConsoleEntry[]): { entry: ModelConsoleEntry; count: number }[] {
  const groups = new Map<string, { entry: ModelConsoleEntry; count: number }>()
  for (const c of entries) {
    const key = `${c.type}|${c.message}`
    const g = groups.get(key)
    groups.delete(key) // re-insert: the group moves to the time of its latest entry
    groups.set(key, { entry: c, count: (g?.count ?? 0) + 1 })
  }
  return [...groups.values()]
}
