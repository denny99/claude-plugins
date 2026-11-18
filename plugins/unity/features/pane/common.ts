/** Helpers the pane's tabs share (no tab imports here, so tabs and the shell never import each other). */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel, UnityTab } from '../../types'
import { batchAllowed } from '../../lib/unity'
import { batchTarget, patchModel } from '../state'

/** Elements the kit does not wrap. */
export type Extra = {
  Input: (p: Record<string, unknown>) => RenderElement
  Select: (p: Record<string, unknown>) => RenderElement
  Link: (p: Record<string, unknown>) => RenderElement
}

export const BRIDGE_GIT_URL =
  'https://github.com/denny99/claude-plugins.git?path=/plugins/unity/bridge/com.denny99.claude-bridge'
export const BRIDGE_README =
  'https://github.com/denny99/claude-plugins/tree/main/plugins/unity/bridge/com.denny99.claude-bridge'

/** Hands a problem to Claude as a prompt. */
export async function fixWithClaude($: EngineInterface, what: string, detail: string): Promise<void> {
  await $.prompt.submit({ text: `Fix this Unity ${what}:\n\n${detail}` })
}

/** A button handler: marks the pane busy, toasts the first line of the result, keeps a thrown error in the model. */
export function run($: EngineInterface, label: string, work: () => Promise<string | undefined | void>): () => void {
  return () =>
    void (async () => {
      await patchModel($, { busy: label })
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

/** "14:32" in local time. */
export function clockTime(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Where batch runs go and whether they may, as one sentence. */
export function targetSentence(m: UnityModel): { text: string; ok: boolean } {
  const target = batchTarget(m)
  const allowed = batchAllowed({ lock: target.lock, bridgeUp: target.bridgeUp })
  const where = target.worktree ? `Worktree ${target.worktree}` : 'Hauptprojekt'
  const editor = m.bridge.up
    ? 'Editor hält das Projekt'
    : m.lock === 'held'
      ? 'Editor offen ohne Bridge'
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
