/**
 * Reading a Bash command line well enough for two guards (best effort, never a full shell parser):
 * - `git commit` while a "restore before commit" file is modified,
 * - moving/deleting a Unity asset under Assets/ without its `.meta`.
 * Pure: the hook supplies what it read from git and the disk.
 */
import { shQuote } from './shell'

export interface Segment {
  /** The words, quotes removed. */
  words: string[]
  /** Where this segment sits in the original line (to splice a corrected one in). */
  start: number
  end: number
  /** The directory of the last `cd <dir>` earlier in the same line, if any. */
  cd?: string
}

const OPS = ['&&', '||', ';', '|', '&', '\n']

/**
 * Splits a command line into simple commands at `&&`, `||`, `;`, `|`, `&` and newlines; quotes respected. Heredoc
 * bodies (`<<EOF` … `EOF`) are skipped: they are text, not commands.
 */
export function splitCommand(line: string): Segment[] {
  const out: Segment[] = []
  const heredocs: { delim: string; strip: boolean }[] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  let start = 0
  let cd: string | undefined
  const endWord = () => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }
  const endSegment = (end: number) => {
    endWord()
    if (words.length) {
      out.push({ words, start, end, ...(cd ? { cd } : {}) })
      if (/^(cd|pushd|Set-Location)$/i.test(words[0] ?? '') && words[1]) cd = words[1]
    }
    words = []
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? ''
    if (line.startsWith('<<', i) && !line.startsWith('<<<', i)) {
      const m = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z0-9_.-]+))/.exec(line.slice(i))
      if (m) {
        endWord()
        heredocs.push({ delim: m[2] ?? m[3] ?? m[4] ?? '', strip: m[1] === '-' })
        i += m[0].length - 1
        continue
      }
    }
    const op = OPS.find(o => line.startsWith(o, i))
    if (op) {
      endSegment(i)
      i += op.length - 1
      if (op === '\n') {
        // Skip each pending heredoc body up to and including its delimiter line.
        for (const doc of heredocs.splice(0)) {
          for (;;) {
            const next = line.indexOf('\n', i + 1)
            const lineEnd = next < 0 ? line.length : next
            const text = line.slice(i + 1, lineEnd)
            i = lineEnd
            if ((doc.strip ? text.replace(/^\t+/, '') : text) === doc.delim || next < 0) break
          }
        }
      }
      start = i + 1
      continue
    }
    if (c === ' ' || c === '\t') {
      endWord()
      continue
    }
    if (c === "'") {
      const close = line.indexOf("'", i + 1)
      const to = close < 0 ? line.length : close
      word += line.slice(i + 1, to)
      inWord = true
      i = to
      continue
    }
    if (c === '"') {
      inWord = true
      for (i++; i < line.length && line[i] !== '"'; i++) {
        const d = line[i] ?? ''
        if (d === '\\' && /["\\$`]/.test(line[i + 1] ?? '')) word += line[++i] ?? ''
        else word += d
      }
      continue
    }
    // A backslash escapes only shell-special characters; elsewhere it is a Windows path separator.
    if (c === '\\' && /[ '"\\;&|$`()]/.test(line[i + 1] ?? '')) {
      word += line[++i] ?? ''
      inWord = true
      continue
    }
    word += c
    inWord = true
  }
  endSegment(line.length)
  return out
}

/** The words after leading `VAR=value` assignments and `sudo`/`command`/`exec`. */
function commandWords(words: string[]): string[] {
  let i = 0
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i] ?? '')) i++
  while (i < words.length && /^(sudo|command|exec|nohup|time)$/.test(words[i] ?? '')) i++
  return words.slice(i)
}

const isGit = (w: string | undefined) => !!w && /(^|[\\/])git(\.exe)?$/i.test(w)

/** `git [global options] <sub> …` → the subcommand, its args and a `-C` dir. */
export function gitInvocation(words: string[]): { sub: string; args: string[]; dir?: string } | undefined {
  const w = commandWords(words)
  if (!isGit(w[0])) return undefined
  let dir: string | undefined
  let i = 1
  while (i < w.length) {
    const a = w[i] ?? ''
    if (a === '-C') {
      dir = dir ? `${dir}/${w[i + 1] ?? ''}` : w[i + 1]
      i += 2
    } else if (a === '-c' || a === '--git-dir' || a === '--work-tree' || a === '--namespace') i += 2
    else if (a.startsWith('-')) i++
    else break
  }
  const sub = w[i]
  return sub ? { sub, args: w.slice(i + 1), ...(dir ? { dir } : {}) } : undefined
}

/** Every `git commit` in the line, with the directory it runs in (`-C`, else an earlier `cd`). */
export function gitCommits(line: string): { dir?: string }[] {
  const out: { dir?: string }[] = []
  for (const s of splitCommand(line)) {
    const g = gitInvocation(s.words)
    if (g?.sub !== 'commit') continue
    const dir = g.dir ?? s.cd
    out.push(dir ? { dir } : {})
  }
  return out
}

/** One `git status --porcelain` line → status + path (renames: the new path). */
export function parsePorcelain(text: string): { staged: boolean; path: string }[] {
  const out: { staged: boolean; path: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.length < 4 || line.startsWith('??') || line.startsWith('!!')) continue
    const x = line[0] ?? ' '
    let path = line.slice(3)
    const arrow = path.indexOf(' -> ')
    if (arrow >= 0) path = path.slice(arrow + 4)
    out.push({ staged: x !== ' ', path: path.replace(/^"|"$/g, '') })
  }
  return out
}

export const BRIDGE_PACKAGE_ID = 'com.denny99.claude-bridge'

/**
 * Which entries of Packages/packages-lock.json a `git diff` (with enough context, e.g. -U60) changes: the bridge's
 * own entry (a bridge update, wanted) and/or any other (local churn). A changed line before any entry key counts as
 * other.
 */
export function lockDiffEntries(diff: string): { bridge: boolean; other: boolean } {
  let bridge = false
  let other = false
  let current: string | undefined
  let inHunk = false
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('@@')) {
      inHunk = true
      current = undefined
      continue
    }
    if (!inHunk || line.startsWith('+++') || line.startsWith('---')) continue
    const key = /^[ +-] {4}"([^"]+)":\s*\{/.exec(line)
    if (key) current = key[1]
    else if (/^[ +-] {0,2}[}\]]/.test(line)) current = undefined
    if (line[0] !== '+' && line[0] !== '-') continue
    if (current === BRIDGE_PACKAGE_ID) bridge = true
    else other = true
  }
  return { bridge, other }
}

/**
 * The deny reason for a commit while restore-before-commit files are modified, or undefined. `bridgeMixed` lists lock
 * files whose change includes a bridge update next to churn: that entry may land, the rest goes back.
 */
export function commitReason(
  modified: { staged: boolean; path: string }[],
  gitDir?: string,
  bridgeMixed: string[] = [],
): string | undefined {
  if (!modified.length) return undefined
  const git = gitDir ? `git -C ${shQuote(gitDir)}` : 'git'
  const fix = modified.flatMap(m =>
    bridgeMixed.includes(m.path)
      ? [
          `${git} add -p -- ${shQuote(m.path)}   # stage only the ${BRIDGE_PACKAGE_ID} entry (bridge update)`,
          `${git} checkout -- ${shQuote(m.path)}   # then drop the rest`,
        ]
      : [`${git} checkout ${m.staged ? 'HEAD ' : ''}-- ${shQuote(m.path)}`],
  )
  return [
    `Unity: ${modified.map(m => m.path).join(', ')} ${modified.length > 1 ? 'are' : 'is'} modified and listed under restoreBeforeCommit in .claude/unity.json (it churns locally and must not land in a commit).`,
    ...(bridgeMixed.length
      ? [
          `${bridgeMixed.join(', ')} also changes the ${BRIDGE_PACKAGE_ID} entry: that is a bridge update and may be committed (restoring it would pin the old bridge again). Keep only that entry.`,
        ]
      : []),
    bridgeMixed.length ? 'Then commit again:' : `Restore it first, then commit again:`,
    ...fix.map(f => `  ${f}`),
  ].join('\n')
}

// --- writes in the same line as a commit ---

const LOCKS: Record<string, string[]> = {
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  yarn: ['yarn.lock'],
  pnpm: ['pnpm-lock.yaml'],
}
const INSTALL = /^(i|install|ci|add|remove|rm|uninstall|un|update|up|upgrade|dedupe|audit)$/

/** The paths one simple command writes (best effort): redirect targets, `sed -i`/`perl -i`, tee, touch, cp/mv targets. */
function writtenPaths(words: string[]): { paths: string[]; locks: string[] } {
  const paths: string[] = []
  const locks: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? ''
    const r = /^(?:\d*|&)>>?\|?(.*)$/.exec(w)
    // `> f`, `>>f`, `2> f` and `x>>f` (no space before the operator).
    const target = r ? r[1] || words[++i] : w.includes('>') ? w.slice(w.lastIndexOf('>') + 1) || words[++i] : undefined
    if (target && !target.startsWith('&')) paths.push(target)
  }
  const w = commandWords(
    words.filter((x, i) => !/^(?:\d*|&)>/.test(x) && !/^(?:\d*|&)>>?\|?$/.test(words[i - 1] ?? '')),
  )
  const cmd = (w[0] ?? '').replace(/^.*[\\/]/, '').replace(/\.(exe|cmd)$/i, '')
  const args = w.slice(1)
  const files = args.filter(a => !a.startsWith('-'))
  if ((cmd === 'sed' || cmd === 'perl') && args.some(a => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
    // sed -i 's/a/b/' file…: the first non-flag word is the script unless -e/-f gave it.
    const script = args.some(a => a === '-e' || a === '-f' || /^-[a-zA-Z]*[ef]$/.test(a)) ? 0 : 1
    paths.push(...files.slice(script))
  } else if (cmd === 'tee' || cmd === 'touch' || cmd === 'truncate') paths.push(...files)
  else if ((cmd === 'cp' || cmd === 'mv' || cmd === 'install') && files.length > 1)
    paths.push(files[files.length - 1] ?? '')
  else if (LOCKS[cmd] && (cmd === 'yarn' ? !files[0] || INSTALL.test(files[0]) : INSTALL.test(files[0] ?? '')))
    locks.push(...(LOCKS[cmd] ?? []))
  return { paths, locks }
}

const normPath = (p: string) =>
  p
    .replace(/\\/g, '/')
    .split('/')
    .filter(x => x && x !== '.')
    .join('/')

/**
 * Restore-before-commit paths the line writes BEFORE a `git commit` in the same line (`echo x >> lock && git commit`):
 * the status check runs before the line, so it cannot see that change. `files` are relative to the session root.
 */
export function writesBeforeCommit(line: string, files: string[]): string[] {
  const segs = splitCommand(line)
  const lastCommit = segs.map(s => gitInvocation(s.words)?.sub === 'commit').lastIndexOf(true)
  if (lastCommit < 0 || !files.length) return []
  const wanted = files.map(normPath)
  const hit = new Set<string>()
  for (const s of segs.slice(0, lastCommit)) {
    const { paths, locks } = writtenPaths(s.words)
    for (const p of paths) {
      const at = normPath(s.cd && !/^([\\/]|[A-Za-z]:)/.test(p) ? `${s.cd}/${p}` : p)
      // The exact listed path, else the longest one it ends with (`unity/Packages/x` over `Packages/x`).
      const near = wanted
        .filter(f => at === f || at.endsWith(`/${f}`) || f.endsWith(`/${at}`))
        .sort((a, b) => Number(b === at) - Number(a === at) || b.length - a.length)[0]
      if (near) hit.add(near)
    }
    for (const l of locks) for (const f of wanted) if (f === l || f.endsWith(`/${l}`)) hit.add(f)
  }
  return [...hit]
}

/** The deny reason for writing a restore-before-commit file and committing in one line. */
export function writeCommitReason(paths: string[]): string | undefined {
  if (!paths.length) return undefined
  return [
    `Unity: this command line changes ${paths.join(', ')} and commits in the same line. ${paths.length > 1 ? 'They are' : 'It is'} listed under restoreBeforeCommit in .claude/unity.json (it churns locally and must not land in a commit).`,
    `Run the change on its own, restore the file(s), then commit:`,
    ...paths.map(p => `  git checkout -- ${shQuote(p)}`),
  ].join('\n')
}

// --- .meta guard ---

type Style = 'posix' | 'git' | 'cmd' | 'ps'

export interface FileOp {
  op: 'move' | 'remove'
  style: Style
  segment: Segment
  /** Command words before the paths (incl. flags), e.g. `git mv -f`. */
  head: string[]
  sources: string[]
  dest?: string
  /** `mv -t dir` form. */
  targetDir?: boolean
}

/** A move/remove in one segment: mv/rm, git mv/rm, cmd move/del/erase, PowerShell Move-Item/Remove-Item. */
export function fileOp(segment: Segment): FileOp | undefined {
  const w = commandWords(segment.words)
  const cmd = (w[0] ?? '').replace(/^.*[\\/]/, '')
  const g = gitInvocation(segment.words)
  if (g && (g.sub === 'mv' || g.sub === 'rm')) {
    const head = w.slice(0, w.indexOf(g.sub) + 1)
    return posixOp(g.sub === 'mv' ? 'move' : 'remove', 'git', segment, head, g.args)
  }
  if (cmd === 'mv' || cmd === 'rm')
    return posixOp(cmd === 'mv' ? 'move' : 'remove', 'posix', segment, [w[0] ?? cmd], w.slice(1))
  const lower = cmd.toLowerCase()
  if (lower === 'move' || lower === 'del' || lower === 'erase') {
    const flags = w.slice(1).filter(a => /^\/-?[A-Za-z]/.test(a) && a.length <= 3)
    const paths = w.slice(1).filter(a => !flags.includes(a))
    const head = [w[0] ?? cmd, ...flags]
    if (lower === 'move')
      return paths.length >= 2
        ? { op: 'move', style: 'cmd', segment, head, sources: paths.slice(0, -1), dest: paths[paths.length - 1] }
        : undefined
    return paths.length ? { op: 'remove', style: 'cmd', segment, head, sources: paths } : undefined
  }
  if (/^(move-item|mi|remove-item|ri|del|erase)$/i.test(cmd)) return psOp(/^(move-item|mi)$/i.test(cmd), segment, w)
  return undefined
}

function posixOp(op: FileOp['op'], style: Style, segment: Segment, head: string[], args: string[]): FileOp | undefined {
  const flags: string[] = []
  const paths: string[] = []
  let target: string | undefined
  let ended = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? ''
    if (!ended && a === '--') ended = true
    else if (!ended && (a === '-t' || a === '--target-directory')) target = args[++i]
    else if (!ended && a.startsWith('--target-directory=')) target = a.slice('--target-directory='.length)
    else if (!ended && a.startsWith('-') && a !== '-') flags.push(a)
    else paths.push(a)
  }
  const h = [...head, ...flags]
  if (op === 'remove') return paths.length ? { op, style, segment, head: h, sources: paths } : undefined
  if (target)
    return paths.length ? { op, style, segment, head: h, sources: paths, dest: target, targetDir: true } : undefined
  if (paths.length < 2) return undefined
  return { op, style, segment, head: h, sources: paths.slice(0, -1), dest: paths[paths.length - 1] }
}

function psOp(move: boolean, segment: Segment, w: string[]): FileOp | undefined {
  const flags: string[] = []
  const positional: string[] = []
  let path: string[] | undefined
  let dest: string | undefined
  const list = (v: string | undefined) =>
    (v ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  for (let i = 1; i < w.length; i++) {
    const a = w[i] ?? ''
    if (/^-(Path|LiteralPath|PSPath)$/i.test(a)) path = list(w[++i])
    else if (/^-Destination$/i.test(a)) dest = w[++i]
    else if (a.startsWith('-')) flags.push(a)
    else positional.push(a)
  }
  const sources = path ?? list(positional.shift())
  if (move) dest = dest ?? positional.shift()
  const head = [w[0] ?? '', ...flags]
  if (!sources.length || (move && !dest)) return undefined
  return { op: move ? 'move' : 'remove', style: 'ps', segment, head, sources, ...(move ? { dest } : {}) }
}

const slash = (p: string) => p.replace(/\\/g, '/')
const trimSlash = (p: string) => p.replace(/[\\/]+$/, '')

/**
 * A path under a Unity `Assets/` folder that has a `.meta` of its own (not a .meta, no wildcard). Paths inside
 * Library/, Temp/ or a PackageCache are Unity's own copies (no tracked .meta) and are left out.
 */
export function isAssetPath(p: string): boolean {
  const n = trimSlash(slash(p))
  const at = n.search(/(^|\/)Assets\/./)
  if (at < 0 || /\.meta$/i.test(n) || /[*?[\]]/.test(n)) return false
  // Only folders above the Assets/ folder count: Assets/Temp/x.cs is an ordinary asset.
  return !/(^|\/)(Library|Temp|PackageCache)(\/|$)/.test(n.slice(0, at))
}

/** Sources of the op whose `.meta` is not named by any move/remove in the same command line (`named`). */
export function missingMetas(op: FileOp, named?: Set<string>): string[] {
  const all = named ?? new Set(op.sources.map(key))
  return op.sources.filter(s => isAssetPath(s) && !all.has(`${key(s)}.meta`))
}

const key = (p: string) => trimSlash(slash(p)).toLowerCase()

function quoteFor(style: Style, word: string): string {
  if (style === 'posix' || style === 'git') return shQuote(word)
  return /[\s,;'"&()]/.test(word) ? `"${word.replace(/"/g, '""')}"` : word
}

/** The command for one op with the given `.meta` files added. */
export function correctedOp(op: FileOp, missing: string[]): string {
  const q = (w: string) => quoteFor(op.style, w)
  const head = op.head.map(q).join(' ')
  const meta = (p: string) => `${trimSlash(p)}.meta`
  const sep = op.style === 'ps' ? '; ' : ' && '
  if (op.op === 'remove') {
    if (op.style === 'ps')
      return [op.sources, missing.map(meta)]
        .flat()
        .map(p => `${head} ${q(p)}`)
        .join(sep)
    return `${head} ${[...op.sources, ...missing.map(meta)].map(q).join(' ')}`
  }
  const dest = op.dest ?? ''
  const intoDir = op.targetDir || op.sources.length > 1 || /[\\/]$/.test(dest)
  if (op.targetDir) return `${head} -t ${q(dest)} ${[...op.sources, ...missing.map(meta)].map(q).join(' ')}`
  if (intoDir && (op.style === 'posix' || op.style === 'git'))
    return `${head} ${[...op.sources, ...missing.map(meta), dest].map(q).join(' ')}`
  // Rename (or a one-source move in cmd/PowerShell): move the .meta beside it under the matching name.
  const lines = [`${head} ${op.sources.map(q).join(' ')} ${q(dest)}`]
  for (const m of missing) lines.push(`${head} ${q(meta(m))} ${q(intoDir ? dest : meta(dest))}`)
  return lines.join(sep)
}

export interface MetaFinding {
  op: FileOp
  missing: string[]
}

/** Every move/remove of an asset under Assets/ without its `.meta` in the same command. */
export function metaFindings(line: string): MetaFinding[] {
  const ops = splitCommand(line)
    .map(fileOp)
    .filter((o): o is FileOp => !!o)
  const named = new Set(ops.flatMap(o => o.sources.map(key)))
  const out: MetaFinding[] = []
  for (const op of ops) {
    const missing = missingMetas(op, named)
    if (missing.length) out.push({ op, missing })
  }
  return out
}

/** The deny reason with the corrected full command (each faulty segment replaced). */
export function metaReason(line: string, findings: MetaFinding[]): string | undefined {
  if (!findings.length) return undefined
  let fixed = line
  for (const f of [...findings].sort((a, b) => b.op.segment.start - a.op.segment.start)) {
    const raw = line.slice(f.op.segment.start, f.op.segment.end)
    const lead = raw.length - raw.trimStart().length
    const trail = raw.length - raw.trimEnd().length
    fixed = `${fixed.slice(0, f.op.segment.start + lead)}${correctedOp(f.op, f.missing)}${fixed.slice(f.op.segment.end - trail)}`
  }
  const files = findings.flatMap(f => f.missing)
  const verb = findings.every(f => f.op.op === 'remove') ? 'deleted' : 'moved'
  return [
    `Unity: ${files.join(', ')} ${verb} without ${files.length > 1 ? 'their' : 'its'} .meta. The .meta holds the asset's GUID; without it Unity re-imports under a new GUID and every scene/prefab reference to it breaks (or an orphaned .meta stays behind).`,
    ...(findings.some(f => f.op.style === 'git' && f.op.head.includes('--cached'))
      ? [
          'git rm --cached only untracks the file (it stays on disk), but the .meta must leave the index with it, or the repo keeps a GUID for an asset it no longer has.',
        ]
      : []),
    'Run this instead:',
    `  ${fixed}`,
    "Safest ways: `git mv` for the file and its .meta (git keeps the history), or move/delete it in the Unity editor's Project window, which takes the .meta along. Already moved without the .meta? Move the leftover .meta next to the file the same way (`git mv old.meta new.meta`).",
  ].join('\n')
}

/** A Unity run started by hand in a Bash line: the editor binary or a project wrapper script (`node tools/unity.mjs`). */
export interface UnityRun {
  /** The words as written, for the refusal. */
  text: string
  /** `-projectPath <dir>`, else an earlier `cd <dir>` in the same line. */
  dir?: string
}

const isUnityBinary = (w: string | undefined) => !!w && /(^|[\\/])Unity(\.exe)?$/.test(w)
const isNode = (w: string | undefined) => !!w && /(^|[\\/])node(\.exe)?$/i.test(w)
const isUnityWrapper = (w: string | undefined) => !!w && /(^|[\\/])unity\.[cm]?js$/i.test(w)

/** Every segment of the line that starts Unity itself (binary, or `node …/unity.mjs`), with the directory it targets. */
export function unityRuns(line: string): UnityRun[] {
  const out: UnityRun[] = []
  for (const s of splitCommand(line)) {
    let w = commandWords(s.words)
    if (w[0] === 'env') w = commandWords(w.slice(1))
    const binary = isUnityBinary(w[0])
    const wrapper = isNode(w[0]) && isUnityWrapper(w.slice(1).find(a => !a.startsWith('-')))
    if (!binary && !wrapper) continue
    const p = w.findIndex(a => /^-projectPath$/i.test(a))
    const dir = (p >= 0 ? w[p + 1] : undefined) ?? s.cd
    out.push({ text: w.join(' '), ...(dir ? { dir } : {}) })
  }
  return out
}

/** The refusal for a hand-started Unity run in the main checkout while an editor holds the project. */
export function unityRunReason(runs: UnityRun[]): string | undefined {
  if (!runs.length) return undefined
  return [
    `Unity is open on this project (its editor holds Temp/UnityLockfile), so \`${runs[0]?.text}\` must not run in the main checkout beside it: a second Unity process on the same project fails on the lock or corrupts Library/.`,
    'Use the unity tools instead: unity_run_tests, unity_refresh and unity_console work through the open editor; for a batch run (compile, tests, a project script) call unity_worktree first and run the command inside that worktree (`cd <worktreeDir>/<name> && …`).',
    'Or ask the person to close the Unity editor, then run it here.',
  ].join(' ')
}
