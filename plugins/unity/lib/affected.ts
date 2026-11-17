/**
 * Narrow-test picker: which test areas the changed files touch. An area is covered by its `paths` (from
 * `.claude/unity.json` `tests.paths` or backticked paths in its code-map section); without paths, a path segment that
 * names the area (or the last part of its filter) counts.
 */
import { norm } from './path'
import { matchesGlob, type TestFilterPreset } from './unity'

/** `git diff --name-only HEAD` + `git ls-files --others --exclude-standard` → one sorted list. */
export function changedFiles(diff: string, untracked: string): string[] {
  const all = `${diff}\n${untracked}`
    .split(/\r?\n/)
    .map(l => norm(l.trim()))
    .filter(Boolean)
  return [...new Set(all)].sort()
}

const GENERIC = new Set(['assets', 'scripts', 'tests', 'test', 'editor', 'runtime', 'packages', 'src', 'unity'])

/** Lower-case words that name an area: its name and the last part of each `;`-separated filter. */
function areaWords(p: TestFilterPreset): string[] {
  const words = [p.name.toLowerCase().replace(/[^a-z0-9]/g, '')]
  for (const f of p.filter.split(';')) {
    const last = f
      .replace(/\\\./g, '.')
      .replace(/[$^()|\\]/g, '')
      .split('.')
      .filter(Boolean)
      .pop()
    if (last) words.push(last.toLowerCase())
  }
  return words.filter(w => w && !GENERIC.has(w))
}

function covers(p: TestFilterPreset, file: string, projectRel: string): boolean {
  const paths = [file, projectRel]
  if (p.paths?.length)
    return p.paths.some(g =>
      paths.some(f => matchesGlob(f, g) || f.startsWith(g.replace(/\/?\*\*?$/, '').replace(/\/?$/, '/'))),
    )
  const segs = projectRel.split('/').map(s => s.replace(/\.[^.]*$/, '').toLowerCase())
  return areaWords(p).some(w => segs.includes(w))
}

/** Files that can change test outcomes: inside the Unity project, not .meta. */
export function relevant(file: string, projectRel: string): boolean {
  return /^(Assets|Packages)\//.test(projectRel) && !/\.meta$/i.test(file)
}

export interface Affected {
  areas: { name: string; filter: string; files: string[] }[]
  /** Relevant files no area covers. */
  uncovered: string[]
  /** Changed files outside the Unity project (ignored). */
  ignored: number
}

/**
 * Maps changed files (session-root relative) to areas. `projectDir` is the Unity project relative to the session
 * root ('' when it is the root).
 */
export function affectedAreas(files: string[], presets: TestFilterPreset[], projectDir: string): Affected {
  const prefix = projectDir ? `${norm(projectDir).replace(/\/$/, '')}/` : ''
  const areas = new Map<string, { name: string; filter: string; files: string[] }>()
  const uncovered: string[] = []
  let ignored = 0
  for (const f of files) {
    const rel = prefix && f.startsWith(prefix) ? f.slice(prefix.length) : prefix ? '' : f
    if (!rel || !relevant(f, rel)) {
      ignored++
      continue
    }
    const hits = presets.filter(p => covers(p, f, rel))
    if (!hits.length) uncovered.push(f)
    for (const p of hits) {
      const a = areas.get(p.name) ?? { name: p.name, filter: p.filter, files: [] }
      a.files.push(f)
      areas.set(p.name, a)
    }
  }
  return { areas: [...areas.values()], uncovered, ignored }
}

/** The text for the model / the pane. */
export function affectedText(a: Affected, landings?: { count: number; every: number }): string {
  const lines: string[] = []
  if (!a.areas.length && !a.uncovered.length) lines.push('No changed files in the Unity project: nothing to test.')
  for (const x of a.areas)
    lines.push(`${x.name} (${x.files.length} file${x.files.length > 1 ? 's' : ''}): ${x.files.slice(0, 5).join(', ')}`)
  if (a.uncovered.length)
    lines.push(
      `No area covers ${a.uncovered.length} changed file(s): ${a.uncovered.slice(0, 5).join(', ')}${a.uncovered.length > 5 ? ', …' : ''} — run the full suite to be sure.`,
    )
  const reminder = landingsReminder(landings)
  if (reminder) lines.push(reminder)
  return lines.join('\n')
}

/** The reminder once `count` landings passed since the last full run. */
export function landingsReminder(l: { count: number; every: number } | undefined): string | undefined {
  if (!l || l.count < l.every) return undefined
  return `${l.count} commits landed since the last full test suite (reminder every ${l.every}): run the full suite (unity_run_tests without a filter) before the next landing.`
}
