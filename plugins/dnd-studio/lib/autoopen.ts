/**
 * Auto-open: exactly one panel opens by itself per folder, by a fixed ranking every mod checks on its own
 * (MODS-BRIEF "Automatisch öffnen"):
 *
 * 1. ds-ct — a ticket branch (`feature/<KEY>-…`) in a deltastone repo → the /ct panel.
 * 2. unity — a Unity project (`ProjectSettings/ProjectVersion.txt` at the root or under `unity/`).
 * 3. dnd-studio — never at session start.
 * 4. ds-solutions-flow — a deltastone repo (origin github.com/deltastone/*, or an Nx workspace with @deltastone
 *    packages) when 1 does not apply → the hub.
 * 5. ds-flutter — only without a hub (no deltastone repo) in a Flutter project; inside the hub it is a "More" entry.
 * 6. ds-nx-release — never.
 *
 * Pure detection over a small file reader (no processes: branch and origin come from `.git` files, worktrees
 * included), so every mod can copy this file as is. `HostFs` from lib/host.ts fits `AutoOpenFs`.
 */

/** The file access the detection needs; paths are absolute. `read` and `list` may throw for a missing path. */
export interface AutoOpenFs {
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  list(path: string): Promise<{ name: string; kind: 'file' | 'dir' | 'other' }[]>
}

/** The mods that take part in the ranking. */
export type AutoOpenPlugin = 'ds-ct' | 'unity' | 'dnd-studio' | 'ds-solutions-flow' | 'ds-flutter' | 'ds-nx-release'

/** What a folder is, as the ranking needs it. */
export type AutoOpenFacts = {
  /** The checked-out branch is a ticket branch and the repo is a deltastone repo. */
  ticketBranch: boolean
  unityProject: boolean
  deltastoneRepo: boolean
  /** Flutter apps, relative to the root (`.` for the root itself). */
  flutterApps: string[]
}

function join(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`
}

function resolve(base: string, path: string): string {
  if (path.startsWith('/')) return path
  const parts = base.split('/')
  for (const seg of path.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/') || '/'
}

async function readOr(fs: AutoOpenFs, path: string): Promise<string | undefined> {
  try {
    return await fs.read(path)
  } catch {
    return undefined
  }
}

/** `feature/<KEY>-<n>…` with an upper-case project key (`feature/SCDEKV-214-member-number`). */
export function isTicketBranchName(branch: string | undefined): boolean {
  return /^feature\/[A-Z][A-Z0-9]*-\d+(?:[-_/.]|$)/.test(branch ?? '')
}

/** An origin URL on github.com/deltastone/* (https or ssh). */
export function isDeltastoneRemote(url: string | undefined): boolean {
  return /github\.com[:/]deltastone\/[^/\s]+/i.test(url ?? '')
}

/** The git dir and the common dir (a worktree's `.git` is a file pointing into the main repo). */
export async function gitDirs(
  fs: AutoOpenFs,
  root: string,
): Promise<{ gitDir: string; commonDir: string } | undefined> {
  const dotGit = join(root, '.git')
  let gitDir: string | undefined
  if (await fs.exists(join(dotGit, 'HEAD'))) gitDir = dotGit
  else {
    const pointer = /^gitdir:\s*(.+)$/m.exec((await readOr(fs, dotGit)) ?? '')?.[1]?.trim()
    if (pointer) gitDir = resolve(root, pointer)
  }
  if (!gitDir) return undefined
  const common = (await readOr(fs, join(gitDir, 'commondir')))?.trim()
  return { gitDir, commonDir: common ? resolve(gitDir, common) : gitDir }
}

/** The checked-out branch name, undefined when detached or no repo. */
export async function currentBranch(fs: AutoOpenFs, root: string): Promise<string | undefined> {
  const dirs = await gitDirs(fs, root)
  if (!dirs) return undefined
  return /^ref:\s*refs\/heads\/(.+)$/m.exec((await readOr(fs, join(dirs.gitDir, 'HEAD'))) ?? '')?.[1]?.trim()
}

/** The `origin` remote URL from the repo's config. */
export async function originUrl(fs: AutoOpenFs, root: string): Promise<string | undefined> {
  const dirs = await gitDirs(fs, root)
  if (!dirs) return undefined
  const config = (await readOr(fs, join(dirs.commonDir, 'config'))) ?? ''
  let inOrigin = false
  for (const line of config.split('\n')) {
    const section = /^\s*\[(.+)\]\s*$/.exec(line)?.[1]
    if (section !== undefined) inOrigin = /^remote\s+"origin"$/.test(section.trim())
    else if (inOrigin) {
      const url = /^\s*url\s*=\s*(.+)$/.exec(line)?.[1]?.trim()
      if (url) return url
    }
  }
  return undefined
}

/** A deltastone repo: origin on github.com/deltastone/*, or an Nx workspace with @deltastone packages. */
export async function isDeltastoneRepo(fs: AutoOpenFs, root: string): Promise<boolean> {
  if (isDeltastoneRemote(await originUrl(fs, root))) return true
  if (!(await fs.exists(join(root, 'nx.json')))) return false
  const pkg = (await readOr(fs, join(root, 'package.json'))) ?? ''
  try {
    const json = JSON.parse(pkg) as Record<string, Record<string, string> | undefined>
    const deps = { ...json.dependencies, ...json.devDependencies, ...json.peerDependencies }
    return Object.keys(deps).some(name => name.startsWith('@deltastone/'))
  } catch {
    return /"@deltastone\//.test(pkg)
  }
}

/** The checked-out branch is a ticket branch in a deltastone repo. */
export async function isTicketBranch(fs: AutoOpenFs, root: string): Promise<boolean> {
  return isTicketBranchName(await currentBranch(fs, root)) && (await isDeltastoneRepo(fs, root))
}

/** A Unity project at the root or under `unity/`. */
export async function isUnityProject(fs: AutoOpenFs, root: string): Promise<boolean> {
  for (const dir of [root, join(root, 'unity')])
    if (await fs.exists(join(dir, 'ProjectSettings/ProjectVersion.txt'))) return true
  return false
}

/** A pubspec that depends on the Flutter SDK. */
async function isFlutterApp(fs: AutoOpenFs, dir: string): Promise<boolean> {
  const pubspec = await readOr(fs, join(dir, 'pubspec.yaml'))
  return !!pubspec && /^\s+flutter:\s*\n\s+sdk:\s*flutter/m.test(pubspec)
}

/** Flutter apps at the root, under `apps/*` and under `packages/*`, relative to the root (`.` for the root). */
export async function flutterApps(fs: AutoOpenFs, root: string): Promise<string[]> {
  const found: string[] = []
  if (await isFlutterApp(fs, root)) found.push('.')
  for (const group of ['apps', 'packages']) {
    let entries: { name: string; kind: string }[] = []
    try {
      entries = await fs.list(join(root, group))
    } catch {
      continue
    }
    for (const entry of entries.filter(x => x.kind === 'dir').sort((a, b) => a.name.localeCompare(b.name)))
      if (await isFlutterApp(fs, join(join(root, group), entry.name))) found.push(`${group}/${entry.name}`)
  }
  return found
}

/** Every fact the ranking needs, for one folder. */
export async function autoOpenFacts(fs: AutoOpenFs, root: string): Promise<AutoOpenFacts> {
  const [deltastoneRepo, branch, unityProject, apps] = await Promise.all([
    isDeltastoneRepo(fs, root),
    currentBranch(fs, root),
    isUnityProject(fs, root),
    flutterApps(fs, root),
  ])
  return { ticketBranch: deltastoneRepo && isTicketBranchName(branch), unityProject, deltastoneRepo, flutterApps: apps }
}

/**
 * Whether `plugin` opens its panel at session start in a folder with `facts` (the ranking above). `autoOpen: false`
 * (the mod's userConfig) always says no.
 */
export function decideAutoOpen(
  plugin: AutoOpenPlugin,
  facts: AutoOpenFacts,
  opts: { autoOpen?: boolean } = {},
): boolean {
  if (opts.autoOpen === false) return false
  switch (plugin) {
    case 'ds-ct':
      return facts.ticketBranch
    case 'unity':
      return facts.unityProject && !facts.ticketBranch
    case 'ds-solutions-flow':
      return facts.deltastoneRepo && !facts.ticketBranch && !facts.unityProject
    case 'ds-flutter':
      return facts.flutterApps.length > 0 && !facts.deltastoneRepo && !facts.ticketBranch && !facts.unityProject
    default:
      return false
  }
}
