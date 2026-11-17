/**
 * `/unity-init`: drafts `.claude/unity.json` from what the repo already says, for the person to review. Never writes.
 * Sources: the Unity project folder, `docs/code-map.md`-style filters, wrapper commands in CLAUDE.md/README.md
 * code blocks (`node tools/…`, `./tools/…`, `python tools/…`), a worktree folder, packages-lock.json.
 */
import type { HostFs } from '../lib/host'
import { join, relative } from '../lib/path'
import { filtersFromDoc, type ProjectConfig, type UnityProject } from '../lib/unity'

/** Wrapper commands from fenced code blocks: one custom job per distinct `<runner> tools/<script> <sub>`. */
export function jobsFromDocs(markdown: string): { name: string; command: string }[] {
  const out = new Map<string, string>()
  let inCode = false
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode
      continue
    }
    if (!inCode) continue
    const cmd = line.replace(/\s+#.*$/, '').trim()
    const m = /^(?:[A-Z_]+=\S+\s+)*(node|python3?|bash|sh|\.\/)\s*(\S*tools\/\S+)((?:\s+[a-z][\w-]*)?)/.exec(cmd)
    if (!m) continue
    const script = (m[2] ?? '').split('/').pop() ?? ''
    const sub = (m[3] ?? '').trim()
    const name = sub || script.replace(/\.\w+$/, '')
    if (!out.has(name) && !/[<>]/.test(cmd)) out.set(name, cmd)
  }
  return [...out].map(([name, command]) => ({ name, command }))
}

export async function draftConfig(
  sessionRoot: string,
  project: UnityProject,
  fs: Pick<HostFs, 'read' | 'exists'>,
): Promise<ProjectConfig> {
  const cfg: ProjectConfig = {}
  const rel = relative(sessionRoot, project.root)
  if (rel && rel !== project.root) cfg.projectDir = rel
  const read = async (p: string): Promise<string | undefined> => {
    try {
      return (await fs.exists(p)) ? await fs.read(p) : undefined
    } catch {
      return undefined
    }
  }
  const map = await read(join(sessionRoot, 'docs', 'code-map.md'))
  if (map) {
    const areas = filtersFromDoc(map)
    if (areas.length) cfg.areas = Object.fromEntries(areas.map(a => [a.name, a.filter]))
  }
  const jobs: { name: string; command: string }[] = []
  for (const doc of ['CLAUDE.md', 'README.md']) {
    const text = await read(join(sessionRoot, doc))
    if (text) for (const j of jobsFromDocs(text)) if (!jobs.some(x => x.name === j.name)) jobs.push(j)
  }
  if (jobs.length) cfg.customJobs = jobs.slice(0, 20)
  for (const d of ['.worktrees', 'worktrees'])
    if (await fs.exists(join(sessionRoot, d))) {
      cfg.worktreeDir = d
      break
    }
  if (await fs.exists(join(project.root, 'Packages', 'packages-lock.json')))
    cfg.restoreBeforeCommit = [relative(sessionRoot, join(project.root, 'Packages', 'packages-lock.json'))]
  cfg.playRestart = { '*.cs': 'restart' }
  cfg.refreshWhilePlaying = false
  cfg.watchdogMinutes = 30
  return cfg
}

/** The draft as JSON in the config file's shape (areas under `tests`). */
export function draftJson(cfg: ProjectConfig): string {
  const { areas, ...rest } = cfg
  return JSON.stringify({ ...rest, ...(areas ? { tests: { areas } } : {}), editorEnv: cfg.editorEnv ?? {} }, null, 2)
}
