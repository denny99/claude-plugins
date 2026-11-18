/**
 * Review data, pure (no `$`): where a project keeps its review files (`.claude/unity.json` → `review`), the question
 * list, the append-only answer log, ideas and the running work. The plugin stays generic: every path comes from the
 * project's config; without a `review` block the tab explains how to set one up.
 */

export type ReviewConfig = {
  /** Question list (JSON `{ items: [...] }`), relative to the repo root. */
  questions?: string
  /** Answer log (JSON lines, appended, never rewritten). */
  answers?: string
  /** Folder for answer screenshots. */
  shots?: string
  /** Ideas (Markdown, one `### ` heading per idea). */
  ideas?: string
  /** Status files of running work: globs with `*` per path segment. */
  running?: string[]
  /** Queue file (Markdown); the list under `## Next` is shown. */
  queue?: string
  /** Where "Problem melden" keeps its reports and pictures (default `.claude/unity-review`). */
  reports?: string
}

export type QuestionKind = 'anschauen' | 'entscheiden' | 'bild'

export type Question = {
  id: string
  kind: QuestionKind
  title: string
  text: string
  spot?: unknown
  options: string[]
  image?: string
}

export type Verdict = 'passt' | 'passt-nicht' | 'kommentar'

export type Answer = {
  id: string
  verdict: Verdict
  choice: string | null
  comment: string
  spot: unknown
  version: string | null
  commit: string | null
  time: string
  screenshot: string | null
}

export type Idea = { id: string; title: string; text: string }

export type Report = {
  id: string
  kind: string
  note: string
  spot: unknown
  screenshot: string | null
  marks?: unknown
  perf?: string
  time: string
  sent: boolean
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

/** The `review` block of `.claude/unity.json` (unknown keys ignored). */
export function reviewConfig(unityJson: string | undefined): ReviewConfig | undefined {
  if (!unityJson) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(unityJson)
  } catch {
    return undefined
  }
  const r = (raw as { review?: unknown } | null)?.review
  if (!r || typeof r !== 'object') return undefined
  const o = r as Record<string, unknown>
  const running = Array.isArray(o.running)
    ? o.running.filter((x): x is string => !!str(x))
    : str(o.running)
      ? [String(o.running)]
      : undefined
  return {
    questions: str(o.questions),
    answers: str(o.answers),
    shots: str(o.shots),
    ideas: str(o.ideas),
    running,
    queue: str(o.queue),
    reports: str(o.reports),
  }
}

const KINDS: QuestionKind[] = ['anschauen', 'entscheiden', 'bild']

/** Items of the question file; broken entries are skipped. */
export function parseQuestions(text: string | undefined): Question[] {
  if (!text) return []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return []
  }
  const items = Array.isArray(raw) ? raw : (raw as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  const out: Question[] = []
  for (const it of items) {
    const o = it as Record<string, unknown>
    const id = str(o?.id)
    if (!id) continue
    const kind = KINDS.includes(o.kind as QuestionKind) ? (o.kind as QuestionKind) : 'anschauen'
    out.push({
      id,
      kind,
      title: str(o.title) ?? id,
      text: typeof o.text === 'string' ? o.text : '',
      ...(o.spot && typeof o.spot === 'object' ? { spot: o.spot } : {}),
      options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [],
      ...(str(o.image) ? { image: String(o.image) } : {}),
    })
  }
  return out
}

/** Every parseable line of the answer log, in file order. */
export function parseAnswers(text: string | undefined): Answer[] {
  if (!text) return []
  const out: Answer[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const o = JSON.parse(line) as Answer
      if (o && typeof o.id === 'string') out.push(o)
    } catch {
      // a torn line is skipped, never repaired (the log is append-only)
    }
  }
  return out
}

/** The newest answer per id. */
export function latestAnswers(answers: Answer[]): Map<string, Answer> {
  const m = new Map<string, Answer>()
  for (const a of answers) m.set(a.id, a)
  return m
}

/** Maps an option text to the verdict word the log uses ("passt nicht" → passt-nicht). */
export function verdictOf(choice: string | undefined, comment: string): Verdict {
  const c = (choice ?? '').trim().toLowerCase()
  if (c === 'passt') return 'passt'
  if (c === 'passt nicht' || c === 'passt-nicht' || c === 'nochmal') return 'passt-nicht'
  return comment.trim() || choice ? 'kommentar' : 'passt'
}

/** `yyyy-MM-ddTHH:mm:ss+hh:mm` in the given offset (minutes east of UTC, like -Date#getTimezoneOffset). */
export function isoLocal(ms: number, offsetMin: number): string {
  const d = new Date(ms + offsetMin * 60000)
  const p = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const sign = offsetMin >= 0 ? '+' : '-'
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:` +
    `${p(d.getUTCSeconds())}${sign}${p(Math.trunc(offsetMin / 60))}:${p(offsetMin % 60)}`
  )
}

/** `yyyyMMdd-HHmmss` for file names. */
export function stamp(ms: number, offsetMin: number): string {
  return isoLocal(ms, offsetMin).slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
}

/** One answer as its log line (key order as the game writes it). */
export function answerLine(a: Answer): string {
  return JSON.stringify({
    id: a.id,
    verdict: a.verdict,
    choice: a.choice,
    comment: a.comment,
    spot: a.spot ?? null,
    version: a.version,
    commit: a.commit,
    time: a.time,
    screenshot: a.screenshot,
  })
}

/** Appends lines to a log text, keeping what was there byte for byte. */
export function appendLines(existing: string | undefined, lines: string[]): string {
  const base = existing ?? ''
  const sep = base && !base.endsWith('\n') ? '\n' : ''
  return `${base}${sep}${lines.map(l => `${l}\n`).join('')}`
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'eintrag'
  )
}

/** One idea per `### ` heading; its text is what follows up to the next heading. */
export function parseIdeas(md: string | undefined): Idea[] {
  if (!md) return []
  const out: Idea[] = []
  let cur: Idea | undefined
  for (const line of md.split('\n')) {
    const h = /^###\s+(.+?)\s*$/.exec(line)
    if (h) {
      cur = { id: `idee:${slug(h[1] ?? '')}`, title: h[1] ?? '', text: '' }
      out.push(cur)
    } else if (/^#{1,2}\s/.test(line)) cur = undefined
    else if (cur) cur.text = `${cur.text}${cur.text ? '\n' : ''}${line}`.trimStart()
  }
  for (const i of out) i.text = i.text.trim()
  return out
}

/** The list items under the given heading (`## Next`) of a Markdown file. */
export function sectionItems(md: string | undefined, heading = 'Next'): string[] {
  if (!md) return []
  const out: string[] = []
  let inside = false
  for (const line of md.split('\n')) {
    const h = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (h) {
      inside = (h[2] ?? '').toLowerCase() === heading.toLowerCase()
      continue
    }
    const item = /^\s*(?:[-*+]|\d+\.)\s+(.+)$/.exec(line)
    if (inside && item) out.push((item[1] ?? '').trim())
  }
  return out
}

/** The first meaningful line of a status file (skips blank lines and Markdown rules). */
export function statusLine(text: string | undefined): string {
  for (const l of (text ?? '').split('\n')) {
    const t = l.replace(/^#+\s*/, '').trim()
    if (t && !/^[-=*_]{3,}$/.test(t)) return t
  }
  return ''
}

/** Width and height from a PNG's IHDR (base64), else undefined. */
export function pngSize(base64: string): { width: number; height: number } | undefined {
  try {
    const head = atob(base64.slice(0, 44))
    if (!head.startsWith('\x89PNG')) return undefined
    const u32 = (o: number) =>
      ((head.charCodeAt(o) << 24) |
        (head.charCodeAt(o + 1) << 16) |
        (head.charCodeAt(o + 2) << 8) |
        head.charCodeAt(o + 3)) >>>
      0
    const width = u32(16)
    const height = u32(20)
    return width && height ? { width, height } : undefined
  } catch {
    return undefined
  }
}

/** Matches one path segment against a pattern with `*`. */
export function segmentMatch(pattern: string, name: string): boolean {
  const re = new RegExp(
    `^${pattern
      .split('*')
      .map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  )
  return re.test(name)
}

/**
 * What `goto` gets for a spot: the spot object as JSON text (the bridge reads its `line` first, so a large seed that
 * lost precision in JS still lands right); a bare line is wrapped as `{"line": …}`.
 */
export function spotText(spot: unknown): string | undefined {
  if (spot === null || spot === undefined) return undefined
  if (typeof spot === 'string') return spot.trim() ? JSON.stringify({ line: spot.trim() }) : undefined
  return typeof spot === 'object' ? JSON.stringify(spot) : undefined
}

/** Short facts of a captured spot for the report card ("412 / 1088 · Birkenwald", "Herbst · Regen"). */
export function spotFacts(spot: unknown): string[] {
  if (!spot || typeof spot !== 'object') return []
  const s = spot as Record<string, unknown>
  const out: string[] = []
  const num = (v: unknown) => (typeof v === 'number' ? Math.round(v) : undefined)
  const place = (s.place as { name?: string } | null)?.name
  if (num(s.x) !== undefined && num(s.z) !== undefined)
    out.push(`${num(s.x)} / ${num(s.z)}${place ? ` · ${place}` : ''}`)
  if (typeof s.clock === 'string') out.push(s.clock)
  const sw = [s.season, s.weather].filter((x): x is string => typeof x === 'string')
  if (sw.length) out.push(sw.join(' · '))
  if (s.seed !== undefined && s.seed !== null) out.push(`Seed ${String(s.seed)}`)
  return out
}
