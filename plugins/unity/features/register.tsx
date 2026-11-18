/** Hooks of the unity plugin: session start (commands, tools), edit guards + compile gate, tools, commands, pane. */
import type { EngineInterface, On } from 'claude-code'

import { createHost } from '../lib/host'
import { isAbsolute, join, relative } from '../lib/path'
import { formatMessage, isScriptFile, splitFilter, type ProjectConfig } from '../lib/unity'
import { bashVerdictReason } from './bash'
import { editNotes, metaCandidates } from './guards'
import { draftConfig, draftJson } from './init'
import { BRIDGE_GIT_URL, BRIDGE_README, openPane, PANE_ID, renderPane } from './pane'
import {
  affectedTests,
  batchTarget,
  bridgeCommand,
  createWorktree,
  compileGate,
  configOf,
  ensureModel,
  markStopped,
  readModel,
  refreshModel,
  runTests,
  screenshot,
  testsText,
  type Options,
} from './state'

const TOOLS: { name: string; description: string; inputSchema?: Record<string, unknown> }[] = [
  {
    name: 'unity_status',
    description:
      'Read-only. The Unity project here: version, editor found, editor bridge state (compiling/playing), lock file / batch safety, last compile result, test summary, configured areas and jobs.',
  },
  {
    name: 'unity_console',
    description:
      'Read-only. Recent Unity editor console entries (errors, exceptions, warnings; with `all` also logs) with stack traces. Needs the editor bridge.',
    inputSchema: { type: 'object', properties: { all: { type: 'boolean' }, limit: { type: 'number' } } },
  },
  {
    name: 'unity_refresh',
    description:
      'Makes the open Unity editor import changes and recompile (AssetDatabase.Refresh), waits for the compile and returns the C# errors/warnings. Writes .meta files for new assets. Needs the editor bridge.',
  },
  {
    name: 'unity_run_tests',
    description:
      'Runs Unity tests. In the open editor through the bridge, else as a batchmode background job (only when no editor holds the project). `filter`: regex on full test names, several separated by `;`; or an area name from .claude/unity.json. Waits up to `waitSeconds` (default 120) for the result.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['EditMode', 'PlayMode'] },
        filter: { type: 'string' },
        waitSeconds: { type: 'number' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'unity_affected_tests',
    description:
      'Narrow-test picker. Reads the changed files (git diff against HEAD + untracked), maps them to the test areas of .claude/unity.json / the code map and runs only those areas (`run: false` only lists them). Also says when the full suite is due (commits since the last full run ≥ fullSuiteEvery).',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['EditMode', 'PlayMode'] },
        run: { type: 'boolean' },
        waitSeconds: { type: 'number' },
      },
    },
  },
  {
    name: 'unity_worktree',
    description:
      'Writes outside the editor: `git worktree add <worktreeDir>/<name>` (new branch <name> from HEAD), then copies Library/ copy-on-write in the background. When the copy ends, batchmode runs (tests, compile check, build, batch custom jobs) go to the worktree instead of the checkout someone plays in.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'unity_test_results',
    description: 'Read-only. The current/last Unity test run: counts and failures, newly red first.',
  },
  { name: 'unity_play', description: 'Enters Play mode in the open Unity editor (bridge).' },
  { name: 'unity_stop', description: 'Leaves Play mode in the open Unity editor (bridge).' },
  {
    name: 'unity_screenshot',
    description:
      'Captures the Game view of the open Unity editor as PNG and returns the image (plus its path). Use it to SEE a change instead of assuming it worked.',
    inputSchema: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
  },
]

const COMMANDS = [
  { name: 'unity', description: 'Open the Unity pane (editor bridge, console, compile, tests, jobs)' },
  {
    name: 'unity-test',
    description: 'Run EditMode tests (filter or area name optional; "play" first for PlayMode)',
    argumentHint: '[play] [filter|area]',
  },
  { name: 'unity-play', description: 'Toggle Play mode in the open Unity editor' },
  { name: 'unity-screenshot', description: 'Capture the Unity Game view and show its path' },
  {
    name: 'unity-affected',
    description: 'Run only the test areas the changed files touch',
    argumentHint: '[play]',
  },
  { name: 'unity-worktree', description: 'Add a worktree for batch runs (Library copied)', argumentHint: '<name>' },
  { name: 'unity-init', description: 'Draft .claude/unity.json for this project (shown for review, not written)' },
]

export async function unitySessionStart($: EngineInterface): Promise<void> {
  for (const t of TOOLS) await $.tool.register(t)
  for (const c of COMMANDS) await $.command.register(c)
}

/** Resolves an area name to its filter; anything else is the filter itself. */
function resolveFilter(presets: { name: string; filter: string }[], input: string | undefined): string | undefined {
  const v = input?.trim()
  if (!v) return undefined
  return presets.find(p => p.name.toLowerCase() === v.toLowerCase())?.filter ?? splitFilter(v).join(';')
}

/** Notes for one Edit/Write after it ran; compile gate included. */
async function afterEdit(
  $: EngineInterface,
  options: Options,
  tool: 'Edit' | 'Write',
  input: { file_path?: string; content?: string; new_string?: string },
  existedBefore: boolean,
): Promise<string[]> {
  const m = await ensureModel($, options)
  const path = input.file_path ?? ''
  if (!m.project || !path || !isAbsolute(path)) return []
  if (relative(m.project.sessionRoot, path) === path.replace(/\\/g, '/')) return []
  const host = await createHost($)
  const missingMeta: string[] = []
  if (tool === 'Write' && !existedBefore)
    for (const p of metaCandidates(m.project.root, path)) if (!(await host.fs.exists(`${p}.meta`))) missingMeta.push(p)
  const notes = editNotes(
    {
      tool,
      path,
      text: input.content ?? input.new_string ?? '',
      existedBefore,
      sessionRoot: m.project.sessionRoot,
      projectRoot: m.project.root,
      missingMeta,
      isPlaying: m.bridge.isPlaying === true,
    },
    configOf(m) as ProjectConfig,
  )
  const inProject = relative(m.project.root, path) !== path.replace(/\\/g, '/')
  if (options.compileGate !== false && inProject && isScriptFile(path)) {
    const gate = await compileGate($, options, [path])
    if (gate) notes.push(gate)
  }
  return notes
}

function statusText(m: Awaited<ReturnType<typeof readModel>>): string {
  if (!m.project)
    return 'No Unity project in this session (no ProjectSettings/ProjectVersion.txt at the root or one level down).'
  const cfg = configOf(m)
  const lines = [
    `Project: ${m.project.root} (Unity ${m.project.version})`,
    `Editor binary: ${m.editorPath ?? `not found (tried ${m.editorTried.join(', ')})`}`,
    m.bridge.up
      ? `Bridge: up · ${m.bridge.isCompiling ? 'compiling' : m.bridge.isPlaying ? (m.bridge.isPaused ? 'paused' : 'playing') : 'edit mode'}${m.bridge.scene ? ` · scene ${m.bridge.scene}` : ''}`
      : `Bridge: ${m.bridge.why === 'stale' ? 'not answering' : 'not running'} (install: Package Manager → Add package from git URL ${BRIDGE_GIT_URL})`,
    `Lock file: ${m.lock}${m.lock === 'held' ? ' — an editor has the project open; no batchmode here' : ''}`,
  ]
  if (m.worktree)
    lines.push(
      `Worktree ${m.worktree.name}: ${m.worktree.status}${m.worktree.status === 'ready' ? ` — batch runs go to ${batchTarget(m).root}` : ''}${m.worktree.error ? ` (${m.worktree.error})` : ''}`,
    )
  if (m.landings?.since)
    lines.push(`Commits since the last full test run: ${m.landings.count} (reminder at ${m.landings.every})`)
  const failed = [...m.jobs].reverse().find(j => j.failLog?.length)
  if (failed)
    lines.push(
      `Last failed job "${failed.name}", last log lines:`,
      ...(failed.failLog ?? []).slice(-15).map(l => `  ${l}`),
    )
  if (m.compile) {
    const errs = m.compile.messages.filter(x => x.severity === 'error')
    lines.push(
      `Last compile (${m.compile.source}): ${errs.length ? `${errs.length} error(s)` : 'ok'}`,
      ...errs.slice(0, 10).map(formatMessage),
    )
  }
  if (m.tests)
    lines.push(
      `Tests: ${m.tests.mode ?? ''} ${m.tests.state}, ${m.tests.results.filter(r => r.status === 'Failed').length} failed of ${m.tests.results.length}`,
    )
  lines.push(m.configFound ? 'Config: .claude/unity.json' : 'Config: none (/unity-init drafts one)')
  if (m.presets.length) lines.push(`Test areas: ${m.presets.map(p => p.name).join(', ')}`)
  if (cfg.customJobs?.length) lines.push(`Custom jobs: ${cfg.customJobs.map(j => j.name).join(', ')}`)
  if (cfg.restoreBeforeCommit?.length) lines.push(`Restore before commit: ${cfg.restoreBeforeCommit.join(', ')}`)
  return lines.join('\n')
}

export function registerUnity(on: On, options: Options): void {
  on('session.start', async ($, e, next) => {
    try {
      await unitySessionStart($)
    } catch (err) {
      $.ui.log(`unity: session start failed: ${String(err)}`)
    }
    return next(e)
  })

  // --- Bash guards: verdicts only (tool.check), never tool.call/tool.run on Bash ---
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const command = (e.input as { command?: unknown } | undefined)?.command
    if (typeof command !== 'string' || !command.trim()) return next(e)
    const reason = await bashVerdictReason($, options, command)
    if (!reason) return next(e)
    // Deny AFTER next(e): answering without next makes the engine report this hook as skipped by the hooks above.
    const verdict = await next(e)
    return verdict.decision === 'deny' ? verdict : { decision: 'deny' as const, reason }
  }).catch(($, e, next) => next(e))

  // --- edit guards + compile gate (Edit / Write only: never hook Bash calls) ---
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const notes = await afterEdit($, options, 'Edit', e as never, true).catch(() => [] as string[])
    return notes.length ? { ...ran, context: [...(ran.context ?? []), ...notes] } : ran
  })
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const input = e as unknown as { file_path?: string }
    const existed = input.file_path ? await $.fs.exists(input.file_path).catch(() => true) : true
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const notes = await afterEdit($, options, 'Write', e as never, existed).catch(() => [] as string[])
    return notes.length ? { ...ran, context: [...(ran.context ?? []), ...notes] } : ran
  })
  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const ran = await next(e)
    const input = e as unknown as { task_id?: string; shell_id?: string }
    const id = input.task_id ?? input.shell_id
    if (id && ran.deny === undefined && !ran.isError) await markStopped($, id)
    return ran
  })

  // --- tools ---
  on('tool.call', { tool: 'mcp__unity__unity_status' }, async $ => ({
    result: statusText(await refreshModel($, options)),
  })).catch(() => ({
    deny: 'unity: status failed.',
  }))

  on('tool.call', { tool: 'mcp__unity__unity_console' }, async ($, e) => {
    const input = e as unknown as { all?: boolean; limit?: number }
    const m = await refreshModel($, options)
    if (!m.bridge.up)
      return { result: 'The editor bridge is not running, so the console cannot be read. unity_status says why.' }
    const list = m.console.filter(c => input.all || c.type !== 'Log').slice(-(input.limit ?? 30))
    if (!list.length) return { result: 'Console: no errors or warnings.' }
    return {
      result: list
        .map(c => `[${c.type}] ${c.message}${c.stack ? `\n  ${c.stack.split('\n').slice(0, 6).join('\n  ')}` : ''}`)
        .join('\n'),
    }
  }).catch(() => ({ deny: 'unity: console failed.' }))

  on('tool.call', { tool: 'mcp__unity__unity_refresh' }, async $ => {
    const m = await refreshModel($, options)
    if (!m.bridge.up) return { result: 'The editor bridge is not running; nothing to refresh. unity_status says why.' }
    const text = await compileGate($, { ...options, debounceMs: 0 }, [])
    return { result: text ?? 'Refreshed.' }
  }).catch(() => ({ deny: 'unity: refresh failed.' }))

  on('tool.call', { tool: 'mcp__unity__unity_run_tests' }, async ($, e) => {
    const input = e as unknown as { mode?: string; filter?: string; waitSeconds?: number }
    const mode = input.mode === 'PlayMode' ? 'PlayMode' : 'EditMode'
    const m = await ensureModel($, options)
    const filter = resolveFilter(m.presets, input.filter)
    return { result: await runTests($, options, mode, filter, Math.max(0, input.waitSeconds ?? 120) * 1000) }
  }).catch(() => ({ deny: 'unity: run tests failed.' }))

  on('tool.call', { tool: 'mcp__unity__unity_affected_tests' }, async ($, e) => {
    const input = e as unknown as { mode?: string; run?: boolean; waitSeconds?: number }
    return {
      result: await affectedTests($, options, {
        mode: input.mode === 'PlayMode' ? 'PlayMode' : 'EditMode',
        run: input.run !== false,
        waitMs: Math.max(0, input.waitSeconds ?? 120) * 1000,
      }),
    }
  }).catch(() => ({ deny: 'unity: affected tests failed.' }))

  on('tool.call', { tool: 'mcp__unity__unity_worktree' }, async ($, e) => {
    const input = e as unknown as { name?: string }
    return { result: await createWorktree($, options, String(input.name ?? '').trim()) }
  }).catch(() => ({ deny: 'unity: worktree failed.' }))

  on('tool.call', { tool: 'mcp__unity__unity_test_results' }, async $ => ({
    result: await testsText($, options),
  })).catch(() => ({
    deny: 'unity: test results failed.',
  }))

  on('tool.call', { tool: 'mcp__unity__unity_play' }, async $ => {
    const r = await bridgeCommand($, options, { cmd: 'play' })
    return { result: r.ok ? 'Entered Play mode.' : `Not started: ${r.error}` }
  }).catch(() => ({ deny: 'unity: play failed.' }))

  on('tool.call', { tool: 'mcp__unity__unity_stop' }, async $ => {
    const r = await bridgeCommand($, options, { cmd: 'stop' })
    return { result: r.ok ? 'Left Play mode.' : `Not stopped: ${r.error}` }
  }).catch(() => ({ deny: 'unity: stop failed.' }))

  on('tool.call', { tool: 'mcp__unity__unity_screenshot' }, async ($, e) => {
    const input = e as unknown as { width?: number; height?: number }
    const shot = await screenshot($, options, {
      ...(input.width ? { width: input.width } : {}),
      ...(input.height ? { height: input.height } : {}),
    })
    if ('error' in shot) return { result: `No screenshot: ${shot.error}` }
    // The engine takes content blocks as the result itself (an MCP `{ content: [{ data, mimeType }] }` is refused).
    return {
      result: [
        { type: 'text' as const, text: `Game view screenshot: ${shot.path}` },
        {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: 'image/png' as const, data: shot.base64 },
        },
      ],
    }
  }).catch(() => ({ deny: 'unity: screenshot failed.' }))

  // --- commands ---
  on('command.run', { command: 'unity' }, async $ => {
    await openPane($, options)
    return { text: 'Unity pane opened.' }
  }).catch(() => ({ text: 'unity: opening the pane failed.' }))

  on('command.run', { command: 'unity-test' }, async ($, e) => {
    const words = (e.args ?? '').trim().split(/\s+/).filter(Boolean)
    const mode = words[0]?.toLowerCase() === 'play' ? 'PlayMode' : 'EditMode'
    if (mode === 'PlayMode' || words[0]?.toLowerCase() === 'edit') words.shift()
    const m = await ensureModel($, options)
    const filter = resolveFilter(m.presets, words.join(' '))
    await openPane($, options)
    const text = await runTests($, options, mode, filter, 0)
    return { text }
  }).catch(() => ({ text: 'unity: starting the tests failed.' }))

  on('command.run', { command: 'unity-affected' }, async ($, e) => {
    const mode = (e.args ?? '').trim().toLowerCase().startsWith('play') ? 'PlayMode' : 'EditMode'
    await openPane($, options)
    return { text: await affectedTests($, options, { mode, run: true, waitMs: 0 }) }
  }).catch(() => ({ text: 'unity: picking the affected tests failed.' }))

  on('command.run', { command: 'unity-worktree' }, async ($, e) => {
    const name = (e.args ?? '').trim()
    if (!name) return { text: 'Usage: /unity-worktree <name>' }
    return { text: await createWorktree($, options, name) }
  }).catch(() => ({ text: 'unity: adding the worktree failed.' }))

  on('command.run', { command: 'unity-play' }, async $ => {
    const m = await refreshModel($, options)
    const r = await bridgeCommand($, options, { cmd: m.bridge.isPlaying ? 'stop' : 'play' })
    return { text: r.ok ? (m.bridge.isPlaying ? 'Stopped Play mode.' : 'Entered Play mode.') : r.error }
  }).catch(() => ({ text: 'unity: toggling Play failed.' }))

  on('command.run', { command: 'unity-screenshot' }, async $ => {
    const shot = await screenshot($, options)
    return { text: 'error' in shot ? `No screenshot: ${shot.error}` : `Screenshot saved: ${shot.path}` }
  }).catch(() => ({ text: 'unity: screenshot failed.' }))

  on('command.run', { command: 'unity-init' }, async $ => {
    const m = await refreshModel($, options)
    if (!m.project) return { text: 'No Unity project here.' }
    const host = await createHost($)
    const draft = draftJson(await draftConfig(m.project.sessionRoot, m.project, host.fs))
    const target = join(m.project.sessionRoot, '.claude', 'unity.json')
    return {
      text: [
        m.configFound
          ? `${target} exists already; this draft is for comparison only.`
          : `Draft for ${target} — review it, then ask Claude to write it:`,
        '',
        draft,
        '',
        `Keys: unityPath, projectDir, worktreeDir, editorEnv, tests.areas, filterDocs, bannedApis, restoreBeforeCommit, syncReminders, customJobs, playRestart, refreshWhilePlaying, watchdogMinutes, buildMethod, buildTarget. Bridge package: ${BRIDGE_README}`,
      ].join('\n'),
    }
  }).catch(() => ({ text: 'unity: drafting the config failed.' }))

  // --- pane ---
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => renderPane($, e, options))
}
