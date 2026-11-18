/**
 * Bash guards as `tool.check` verdicts (never tool.call/tool.run on Bash: that would disable run_in_background).
 * A deny carries an instructive reason the model reads, so it can run the corrected command right away:
 * - restoreBeforeCommit: `git commit` while a listed file (e.g. Packages/packages-lock.json) is modified, or when the
 *   same line writes it first (`echo x >> lock && git commit`, sed -i, npm i, …),
 * - .meta guard: mv/rm (git, cmd, PowerShell too) of an asset under Assets/ without its `.meta`.
 * Both fail open: anything unexpected lets the command through.
 */
import type { EngineInterface } from 'claude-code'

import {
  commitReason,
  lockDiffEntries,
  gitCommits,
  metaFindings,
  metaReason,
  parsePorcelain,
  writeCommitReason,
  writesBeforeCommit,
  type MetaFinding,
} from '../lib/command'
import { createHost } from '../lib/host'
import { isAbsolute, join, relative } from '../lib/path'
import { configOf, ensureModel, type Options } from './state'

function resolveIn(base: string, p: string): string {
  return isAbsolute(p) ? p : join(base, p)
}

/** The deny reason for a `git commit` while restore-before-commit files are modified. */
export async function commitGuardReason(
  $: EngineInterface,
  options: Options,
  command: string,
): Promise<string | undefined> {
  const commits = gitCommits(command)
  if (!commits.length) return undefined
  const m = await ensureModel($, options)
  const files = configOf(m).restoreBeforeCommit ?? []
  const sessionRoot = m.sessionRoot ?? (await $.session.root())
  if (!files.length || !sessionRoot) return undefined
  const host = await createHost($)
  const projectDir = m.project ? relative(sessionRoot, m.project.root) : ''
  const inProject = projectDir && m.project && projectDir !== m.project.root ? projectDir : ''
  const written = writeCommitReason(
    writesBeforeCommit(command, [...files, ...(inProject ? files.map(f => `${inProject}/${f}`) : [])]),
  )
  if (written) return written
  for (const c of commits) {
    const cwd = c.dir ? resolveIn(sessionRoot, c.dir) : sessionRoot
    const top = await host.run('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { cwd, log: () => undefined })
    if (top.code !== 0) continue
    const root = top.stdout.trim()
    const specs = files.flatMap(f => [`:(top)${f}`, ...(inProject ? [`:(top)${inProject}/${f}`] : [])])
    const st = await host.run('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no', '--', ...specs], {
      cwd: root,
      log: () => undefined,
    })
    if (st.code !== 0) continue
    // A bridge update shows up as a changed lock entry: only the bridge entry → fine to commit; mixed → keep that hunk.
    const modified: { staged: boolean; path: string }[] = []
    const mixed: string[] = []
    for (const x of parsePorcelain(st.stdout)) {
      if (/(^|\/)packages-lock\.json$/.test(x.path)) {
        const d = await host.run('git', ['-C', root, 'diff', '-U60', 'HEAD', '--', `:(top)${x.path}`], {
          cwd: root,
          log: () => undefined,
        })
        const e = d.code === 0 ? lockDiffEntries(d.stdout) : { bridge: false, other: true }
        if (e.bridge && !e.other) continue
        if (e.bridge) mixed.push(x.path)
      }
      modified.push(x)
    }
    const reason = commitReason(modified, root === sessionRoot ? undefined : root, mixed)
    if (reason) return reason
  }
  return undefined
}

/** The deny reason for moving/deleting assets without their `.meta` (only metas that exist on disk count). */
export async function metaGuardReason($: EngineInterface, command: string): Promise<string | undefined> {
  const found = metaFindings(command)
  if (!found.length) return undefined
  const sessionRoot = await $.session.root()
  const host = await createHost($)
  const kept: MetaFinding[] = []
  for (const f of found) {
    const base = f.op.segment.cd ? resolveIn(sessionRoot, f.op.segment.cd) : sessionRoot
    const missing: string[] = []
    for (const src of f.missing)
      if (await host.fs.exists(`${resolveIn(base, src.replace(/\\/g, '/').replace(/\/+$/, ''))}.meta`))
        missing.push(src)
    if (missing.length) kept.push({ op: f.op, missing })
  }
  return metaReason(command, kept)
}

export async function bashVerdictReason(
  $: EngineInterface,
  options: Options,
  command: string,
): Promise<string | undefined> {
  if (options.metaGuard !== false) {
    const meta = await metaGuardReason($, command)
    if (meta) return meta
  }
  if (options.commitGuard !== false) return commitGuardReason($, options, command)
  return undefined
}
