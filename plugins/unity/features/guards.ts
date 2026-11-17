/**
 * Edit guards: notes appended to an Edit/Write result (never a block). Pure; the hook supplies what it read.
 *
 * Bash `mv`/`rm` of a .cs without its .meta is NOT covered: hooking Bash with tool.call/tool.run disables
 * run_in_background, and a tool.check verdict carries no text for the model. Only Edit/Write are watched.
 */
import { join, norm, relative } from '../lib/path'
import { isSerializedAsset, matchesGlob, type ProjectConfig } from '../lib/unity'

export interface EditFacts {
  tool: 'Edit' | 'Write'
  path: string
  /** The text the edit put in (Write content / Edit new_string). */
  text: string
  existedBefore: boolean
  sessionRoot: string
  projectRoot: string
  /** Paths among the file and its folders up to Assets/ whose `.meta` is missing (checked by the hook). */
  missingMeta: string[]
  isPlaying: boolean
}

const WALL_CLOCK =
  /\b(Stopwatch|DateTime\.(Now|UtcNow)|Time\.(time|realtimeSinceStartup|unscaledTime)|Environment\.TickCount)\b/

/** Paths whose .meta the hook should check: the file and every folder between it and Assets/ (or Packages/x/). */
export function metaCandidates(projectRoot: string, path: string): string[] {
  const rel = relative(projectRoot, path)
  if (rel === norm(path) || !/^(Assets|Packages\/[^/]+)\//.test(rel)) return []
  const parts = rel.split('/')
  const stop = rel.startsWith('Assets/') ? 1 : 2
  const out: string[] = []
  for (let i = parts.length; i > stop; i--) out.push(join(projectRoot, ...parts.slice(0, i)))
  return out
}

export function editNotes(f: EditFacts, cfg: ProjectConfig): string[] {
  const notes: string[] = []
  const relSession = relative(f.sessionRoot, f.path)
  const relProject = relative(f.projectRoot, f.path)
  const rels = [relSession, relProject]
  if (isSerializedAsset(f.path))
    notes.push(
      `${relProject} is Unity-serialized YAML. Hand edits break easily (fileID/GUID references, prefab overrides): prefer changing it in the editor or through an editor script, and re-open it in Unity to check.`,
    )
  if (f.tool === 'Write' && !f.existedBefore && f.missingMeta.length)
    notes.push(
      `New asset without .meta: ${f.missingMeta.map(p => relative(f.projectRoot, p)).join(', ')}. Unity writes the .meta on its next refresh (unity_refresh); commit the .meta files together with the new file/folder.`,
    )
  if (/\.cs$/i.test(f.path) && /(^|\/)Tests?\/|Tests?\.cs$/i.test(relProject) && WALL_CLOCK.test(f.text))
    notes.push(
      `Wall-clock in a test (${WALL_CLOCK.exec(f.text)?.[0]}): timing asserts are flaky on CI and slower machines. Assert on frames/ticks or counts instead.`,
    )
  for (const b of cfg.bannedApis ?? [])
    if (rels.some(r => matchesGlob(r, b.glob))) {
      const hits = b.patterns.filter(p => f.text.includes(p))
      if (hits.length) notes.push(`Banned here by .claude/unity.json (${b.glob}): ${hits.join(', ')}.`)
    }
  for (const s of cfg.syncReminders ?? []) if (rels.some(r => matchesGlob(r, s.glob))) notes.push(s.message)
  if (f.isPlaying)
    for (const [glob, hint] of Object.entries(cfg.playRestart ?? { '*.cs': 'restart' }))
      if (rels.some(r => matchesGlob(r, glob))) {
        notes.push(
          hint === 'restart'
            ? 'Unity is in Play mode: this change needs a Play restart to take effect — tell the person.'
            : hint === 'reload'
              ? 'Unity is in Play mode: this change can be reloaded without restarting Play — tell the person.'
              : `Unity is in Play mode: ${hint}`,
        )
        break
      }
  return notes
}
