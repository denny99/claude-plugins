/**
 * Review state and file IO (`$` side): the review atom, the project's review files read through the host, answers
 * appended to the log, captures written straight to where an answer or report keeps its picture.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { ReviewUiState } from '../../types'
import { createHost } from '../../lib/host'
import { join } from '../../lib/path'
import * as play from '../../lib/play'
import { playSend, type Options } from '../state'
import {
  answerLine,
  appendLines,
  isoLocal,
  parseAnswers,
  parseIdeas,
  parseQuestions,
  reviewConfig,
  sectionItems,
  segmentMatch,
  stamp,
  statusLine,
  type Answer,
  type Idea,
  type Question,
  type Report,
  type ReviewConfig,
} from './data'

export const EMPTY_REVIEW: ReviewUiState = { sub: 'look', drafts: {}, attachShot: true }
export const reviewAtom = atom({ plugin: 'unity', key: 'review' } as const, EMPTY_REVIEW, { shape: 'unity-review-1' })

export function readReview($: EngineInterface): Promise<ReviewUiState> {
  return read($, reviewAtom)
}

export async function patchReview(
  $: EngineInterface,
  patch: Partial<ReviewUiState> | ((s: ReviewUiState) => Partial<ReviewUiState>),
): Promise<void> {
  await update($, reviewAtom, s => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
}

export const DEFAULT_REPORTS = '.claude/unity-review'

export type ReviewData = {
  root: string
  cfg?: ReviewConfig
  questions: Question[]
  answers: Map<string, Answer>
  ideas: Idea[]
  running: { name: string; line: string }[]
  queue: string[]
  reports: Report[]
}

async function readText($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    return (await $.fs.exists(path)) ? String(await $.fs.read(path)) : undefined
  } catch {
    return undefined
  }
}

const abs = (root: string, p: string) => (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) ? p : join(root, p))

export async function reviewRoot($: EngineInterface): Promise<{ root: string; cfg?: ReviewConfig }> {
  const root = await $.session.root()
  return { root, cfg: reviewConfig(await readText($, join(root, '.claude', 'unity.json'))) }
}

/** Expands a glob with `*` per segment (relative to root) through fs.list. */
async function expand($: EngineInterface, root: string, pattern: string): Promise<string[]> {
  let paths = [root]
  for (const seg of pattern.split('/').filter(Boolean)) {
    if (!seg.includes('*')) {
      paths = paths.map(p => join(p, seg))
      continue
    }
    const next: string[] = []
    for (const p of paths) {
      try {
        for (const ent of await $.fs.list(p)) if (segmentMatch(seg, ent.name)) next.push(join(p, ent.name))
      } catch {
        // missing folder: nothing there
      }
    }
    paths = next
  }
  const out: string[] = []
  for (const p of paths) if (await $.fs.exists(p).catch(() => false)) out.push(p)
  return out
}

export function reportsDir(root: string, cfg?: ReviewConfig): string {
  return abs(root, cfg?.reports ?? DEFAULT_REPORTS)
}

export function parseReports(text: string | undefined): Report[] {
  const out: Report[] = []
  for (const line of (text ?? '').split('\n')) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line) as Report
      if (r && typeof r.id === 'string') out.push(r)
    } catch {
      // skipped
    }
  }
  return out
}

/** Everything the tab shows, read fresh (the files are small; the coordinator edits them between renders). */
export async function loadReview($: EngineInterface): Promise<ReviewData> {
  const { root, cfg } = await reviewRoot($)
  const data: ReviewData = {
    root,
    cfg,
    questions: [],
    answers: new Map(),
    ideas: [],
    running: [],
    queue: [],
    reports: [],
  }
  data.reports = parseReports(await readText($, join(reportsDir(root, cfg), 'reports.jsonl')))
  if (!cfg) return data
  if (cfg.questions) data.questions = parseQuestions(await readText($, abs(root, cfg.questions)))
  if (cfg.answers) {
    const m = new Map<string, Answer>()
    for (const a of parseAnswers(await readText($, abs(root, cfg.answers)))) m.set(a.id, a)
    data.answers = m
  }
  if (cfg.ideas) data.ideas = parseIdeas(await readText($, abs(root, cfg.ideas)))
  for (const g of cfg.running ?? [])
    for (const p of await expand($, root, g)) {
      const rel = p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p
      data.running.push({ name: rel, line: statusLine(await readText($, p)) })
    }
  if (cfg.queue) data.queue = sectionItems(await readText($, abs(root, cfg.queue)))
  return data
}

/** Open questions (no answer yet): the tab badge. */
export async function openCount($: EngineInterface): Promise<number> {
  const d = await loadReview($)
  return d.questions.filter(q => !d.answers.has(q.id)).length + d.reports.filter(r => !r.sent).length
}

async function offsetMin(): Promise<number> {
  return -new Date().getTimezoneOffset()
}

export async function nowStamp($: EngineInterface): Promise<{ iso: string; file: string; ms: number }> {
  const host = await createHost($)
  const ms = await host.now()
  const off = await offsetMin()
  return { iso: isoLocal(ms, off), file: stamp(ms, off), ms }
}

/** The checked-out commit (12 chars) read from `.git` without a process; null when unknown. */
export async function headCommit($: EngineInterface, root: string): Promise<string | null> {
  let gitDir = join(root, '.git')
  const dotGit = await readText($, gitDir)
  if (dotGit?.startsWith('gitdir:')) gitDir = abs(root, dotGit.slice(7).trim())
  const head = (await readText($, join(gitDir, 'HEAD')))?.trim()
  if (!head) return null
  if (!head.startsWith('ref:')) return head.slice(0, 12)
  const ref = head.slice(4).trim()
  const direct = (await readText($, join(gitDir, ref)))?.trim()
  if (direct) return direct.slice(0, 12)
  const common = (await readText($, join(gitDir, 'commondir')))?.trim()
  const base = common ? abs(gitDir, common) : gitDir
  const loose = (await readText($, join(base, ref)))?.trim()
  if (loose) return loose.slice(0, 12)
  const packed = await readText($, join(base, 'packed-refs'))
  const hit = packed?.split('\n').find(l => l.endsWith(` ${ref}`))
  return hit ? hit.slice(0, 12) : null
}

/** The game's bundleVersion from ProjectSettings, null when unknown. */
export async function gameVersion($: EngineInterface, root: string): Promise<string | null> {
  for (const dir of ['', 'unity']) {
    const t = await readText($, join(root, dir, 'ProjectSettings', 'ProjectSettings.asset'))
    const m = t && /bundleVersion:\s*(\S+)/.exec(t)
    if (m) return m[1] ?? null
  }
  return null
}

/** Appends one answer to the configured log. Throws without a configured log. */
export async function appendAnswer(
  $: EngineInterface,
  a: Omit<Answer, 'time' | 'version' | 'commit'> & { time?: string },
): Promise<Answer> {
  const { root, cfg } = await reviewRoot($)
  if (!cfg?.answers) throw new Error('Kein Antwort-Log in .claude/unity.json (review.answers).')
  const path = abs(root, cfg.answers)
  const full: Answer = {
    ...a,
    time: a.time ?? (await nowStamp($)).iso,
    version: await gameVersion($, root),
    commit: await headCommit($, root),
  }
  await $.fs.write(path, appendLines(await readText($, path), [answerLine(full)]))
  return full
}

/**
 * The default report folder sits inside the repo: a `.gitignore` with `*` keeps screenshots and reports out of
 * `git status` (written once; a configured `review.reports` folder is left alone).
 */
export async function ensureReportsIgnored($: EngineInterface, root: string, cfg?: ReviewConfig): Promise<void> {
  if (cfg?.reports && cfg.reports !== DEFAULT_REPORTS) return
  const file = join(reportsDir(root, cfg), '.gitignore')
  try {
    if (!(await $.fs.exists(file)))
      await $.fs.write(file, '# Unity-Panel: Meldungen und Screenshots, nicht einchecken\n*\n')
  } catch {
    // best effort: the report itself still works
  }
}

export async function appendReport($: EngineInterface, r: Report): Promise<void> {
  const { root, cfg } = await reviewRoot($)
  const path = join(reportsDir(root, cfg), 'reports.jsonl')
  await $.fs.write(path, appendLines(await readText($, path), [JSON.stringify(r)]))
}

/** Rewrites the report list (only the plugin's own file; used to mark a report as sent). */
export async function markReportSent($: EngineInterface, id: string): Promise<void> {
  const { root, cfg } = await reviewRoot($)
  const path = join(reportsDir(root, cfg), 'reports.jsonl')
  const list = parseReports(await readText($, path)).map(r => (r.id === id ? { ...r, sent: true } : r))
  await $.fs.write(
    path,
    appendLines(
      '',
      list.map(r => JSON.stringify(r)),
    ),
  )
}

/** Capture to a given file (bridge writes the PNG there); returns the result or a play error. */
export async function captureTo(
  $: EngineInterface,
  options: Options,
  path: string,
  size?: { width: number; height: number },
): Promise<play.CaptureResult | play.PlayError> {
  return play.capture(playSend($, options), { path, ...size })
}

/** base64 of a file, undefined when unreadable. */
export async function readBase64($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    return ((await $.fs.read(path, { as: 'bytes' })) as unknown as { base64: string }).base64
  } catch {
    return undefined
  }
}

export { abs as resolvePath }
