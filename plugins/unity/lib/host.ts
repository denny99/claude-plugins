/**
 * The Host: everything the plugin needs from outside (processes, files, HTTP, timers, env, OS), built from `$`.
 * Adapted from ds-solutions-flow's lib/host.ts, made cross-platform:
 *
 * - the OS comes from `$.session.info().platform` (`macos` | `windows` | `wsl` | `linux` | `unknown`);
 * - env is read by literal names only (`HOME`, `USERPROFILE`, `LOCALAPPDATA`, `APPDATA`, `ProgramFiles`, `PATH`, `Path`);
 * - PATH is split/joined with `;` on Windows, `:` elsewhere;
 * - no POSIX-only commands (`rm`, `mkdir`, `kill`) in shared code: the plugin never needs to delete or make folders
 *   (the bridge writes its own files under `Temp/ClaudeBridge`), and processes are stopped through `TaskStop`.
 *
 * All paths are normalized to `/` (see path.ts).
 */
import type { EngineInterface } from 'claude-code'

import { norm } from './path'

export type Platform = 'macos' | 'windows' | 'wsl' | 'linux' | 'unknown'

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export type Runner = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string>; log?: (line: string) => void },
) => Promise<CommandResult>

export interface HostFs {
  read(path: string): Promise<string>
  write(path: string, text: string): Promise<void>
  /** Ranged text read (`offset`/`length` in bytes). */
  readRange(path: string, offset: number, length: number): Promise<string>
  /** The file's bytes, base64. */
  readBase64(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  list(path: string): Promise<{ name: string; kind: 'file' | 'dir' | 'other' }[]>
  /** Size and mtime, or undefined when missing. */
  stat(path: string): Promise<{ size: number; mtimeMs: number } | undefined>
}

export interface HostResponse {
  status: number
  ok: boolean
  text: string
}

export interface HostHttp {
  fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<HostResponse>
}

export interface HostEnv {
  platform: Platform
  /** `$HOME` (macOS/Linux) or `%USERPROFILE%` (Windows), `/`-normalized. */
  home: string
  /** `%LOCALAPPDATA%` (Windows only). */
  localAppData?: string
  /** `%APPDATA%` (Windows only). */
  appData?: string
  /** `%ProgramFiles%` (Windows only; default `C:/Program Files`). */
  programFiles?: string
  /** The augmented PATH every command runs with. */
  path: string
}

export interface Host extends HostEnv {
  run: Runner
  fs: HostFs
  http: HostHttp
  after(ms: number, fn: () => void): { cancel(): void }
  now(): Promise<number>
}

/** PATH delimiter of a platform. */
export function pathDelimiter(platform: Platform): string {
  return platform === 'windows' ? ';' : ':'
}

/**
 * PATH with the usual tool locations prepended on macOS (a Dock-started app inherits a minimal PATH). Windows and
 * Linux keep theirs as is.
 */
export function augmentedPath(platform: Platform, home: string, current: string): string {
  const d = pathDelimiter(platform)
  const extras =
    platform === 'macos' ? ['/opt/homebrew/bin', '/usr/local/bin', `${home}/.volta/bin`, '/usr/bin', '/bin'] : []
  const seen = new Set<string>()
  return [...extras, ...current.split(d)].filter(p => p && !seen.has(p) && seen.add(p)).join(d)
}

/** The process API the runner needs: `$.process.spawn`'s shape. */
export type SpawnFn = EngineInterface['process']['spawn']

/** A {@link Runner} on `$.process.spawn`; never rejects (127 not startable, 1 on signal). */
export function createRunner(spawn: SpawnFn, envPath: string, defaultLog?: (line: string) => void): Runner {
  return async (cmd, args, opts): Promise<CommandResult> => {
    const log = opts.log ?? defaultLog
    let stdout = ''
    let stderr = ''
    let buffer = ''
    try {
      const child = spawn({ argv: [cmd, ...args], cwd: opts.cwd, env: { PATH: envPath, ...opts.env } })
      const it = child[Symbol.asyncIterator]()
      for (;;) {
        const next = await it.next()
        if (next.done) {
          if (buffer) log?.(buffer)
          const end = next.value as { code: number | null } | undefined
          return { code: end?.code ?? 1, stdout, stderr }
        }
        const { stream, text } = next.value
        if (stream === 'stdout') stdout += text
        else stderr += text
        buffer += text
        const parts = buffer.split(/\r?\n/)
        buffer = parts.pop() ?? ''
        for (const line of parts) log?.(line)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log?.(msg)
      return { code: 127, stdout, stderr: stderr + msg }
    }
  }
}

let cachedEnv: HostEnv | undefined

/** Reads the OS and the env values once per module load. */
export async function readHostEnv($: EngineInterface): Promise<HostEnv> {
  if (cachedEnv) return cachedEnv
  let platform: Platform = 'unknown'
  try {
    platform = (await $.session.info()).platform ?? 'unknown'
  } catch {
    platform = 'unknown'
  }
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
  if (platform === 'unknown') platform = /^[A-Za-z]:[\\/]/.test(home) ? 'windows' : 'macos'
  const current = (await $.env.get('PATH')) ?? (await $.env.get('Path')) ?? ''
  const env: HostEnv = { platform, home: norm(home), path: augmentedPath(platform, home, current) }
  if (platform === 'windows') {
    const local = await $.env.get('LOCALAPPDATA')
    const roaming = await $.env.get('APPDATA')
    const pf = await $.env.get('ProgramFiles')
    env.localAppData = norm(local ?? `${home}/AppData/Local`)
    env.appData = norm(roaming ?? `${home}/AppData/Roaming`)
    env.programFiles = norm(pf ?? 'C:/Program Files')
  }
  cachedEnv = env
  return env
}

/** Test hook: forget the cached env (each test sets its own OS). */
export function resetHostEnv(): void {
  cachedEnv = undefined
}

/** Builds the Host from `$` (use the `$` of the hook you are in). */
export async function createHost($: EngineInterface, defaultLog?: (line: string) => void): Promise<Host> {
  const env = await readHostEnv($)
  const run = createRunner(request => $.process.spawn(request), env.path, defaultLog)
  return {
    ...env,
    run,
    fs: {
      read: async p => (await $.fs.read(p)) as string,
      write: (p, text) => $.fs.write(p, text),
      readRange: async (p, offset, length) => (await $.fs.read(p, { offset, length })) as string,
      readBase64: async p => ((await $.fs.read(p, { as: 'bytes' })) as unknown as { base64: string }).base64,
      exists: p => $.fs.exists(p),
      list: async p => (await $.fs.list(p)).map(e => ({ name: e.name, kind: e.kind })),
      stat: async p => {
        try {
          const s = await $.fs.stat(p)
          return { size: s.size, mtimeMs: s.mtimeMs }
        } catch {
          return undefined
        }
      },
    },
    http: {
      fetch: async (url, init) => {
        const res = await $.http.fetch(url, init)
        return { status: res.status, ok: res.ok, text: res.text }
      },
    },
    after: (ms, fn) => $.clock.after(ms, fn),
    now: () => $.clock.now(),
  }
}
