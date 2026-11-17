/**
 * A git worktree as a safe place for batch runs while someone plays in the main checkout: `git worktree add`, then a
 * copy-on-write copy of Library/ (a cold import of a big project takes long) as a background shell.
 */
import type { Platform } from './host'
import { join, relative } from './path'
import { shJoin, shQuote } from './shell'

export const WORKTREE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/** Where a worktree named `name` goes (`worktreeDir` from .claude/unity.json, relative to the session root). */
export function worktreePaths(
  sessionRoot: string,
  projectRoot: string,
  worktreeDir: string | undefined,
  name: string,
): { path: string; projectRoot: string; library: { from: string; to: string } } {
  const base = join(sessionRoot, worktreeDir || '.worktrees')
  const path = join(base, name)
  const rel = relative(sessionRoot, projectRoot)
  const wtProject = rel && rel !== projectRoot ? join(path, rel) : path
  return {
    path,
    projectRoot: wtProject,
    library: { from: join(projectRoot, 'Library'), to: join(wtProject, 'Library') },
  }
}

/** argv of `git worktree add` (a new branch named like the folder, from HEAD). */
export function worktreeAddArgs(sessionRoot: string, path: string): string[] {
  return ['-C', sessionRoot, 'worktree', 'add', path]
}

/**
 * argv of the Library copy per OS: macOS clones on APFS (`cp -c`), Linux reflinks where the FS can
 * (`--reflink=auto`, a plain copy elsewhere), Windows has no CoW copy tool → robocopy.
 */
export function libraryCopyArgs(platform: Platform, from: string, to: string): string[] {
  if (platform === 'windows')
    return ['robocopy', from.replace(/\//g, '\\'), to.replace(/\//g, '\\'), '/E', '/NFL', '/NDL']
  if (platform === 'macos') return ['cp', '-c', '-R', from, to]
  return ['cp', '--reflink=auto', '-R', from, to]
}

/**
 * The shell line for the background Bash (bash on macOS/Linux, Git Bash on Windows). robocopy: `/E` would be turned
 * into a path by MSYS (so no argument conversion), and exit codes below 8 mean success.
 */
export function libraryCopyLine(platform: Platform, from: string, to: string): string {
  const argv = libraryCopyArgs(platform, from, to)
  if (platform === 'windows')
    return `MSYS2_ARG_CONV_EXCL='*' ${argv.map(shQuote).join(' ')}; __rc=$?; [ "$__rc" -lt 8 ]`
  return shJoin(argv)
}
