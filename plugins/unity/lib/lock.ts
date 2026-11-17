/**
 * Is Temp/UnityLockfile held by a running editor? Existence alone lies after a crash.
 * - macOS/Linux: `lsof -t <file>` (exit 0 + a pid → held, exit 1 → nobody has it open).
 * - Windows: PowerShell tries to open the file exclusively; a sharing violation means an editor holds it.
 * A probe that cannot run (no lsof/PowerShell) counts as held: never start a second editor on a guess.
 */
import type { Host } from './host'
import { lockfilePath, type LockState } from './unity'

export async function lockState(host: Pick<Host, 'fs' | 'run' | 'platform'>, project: string): Promise<LockState> {
  const file = lockfilePath(project)
  if (!(await host.fs.exists(file))) return 'free'
  if (host.platform === 'windows') {
    const native = file.replace(/\//g, '\\').replace(/'/g, "''")
    const script = `try { $f=[IO.File]::Open('${native}','Open','ReadWrite','None'); $f.Close(); 'free' } catch { 'held' }`
    const r = await host.run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      cwd: project,
      log: () => undefined,
    })
    if (r.code !== 0) return 'held'
    return r.stdout.trim() === 'free' ? 'stale' : 'held'
  }
  const r = await host.run('lsof', ['-t', file], { cwd: project, log: () => undefined })
  if (r.code === 0 && r.stdout.trim()) return 'held'
  if (r.code === 1) return 'stale'
  return 'held'
}
