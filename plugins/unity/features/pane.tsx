/** The `unity` pane: bridge + play state, safe target, compile, console, tests, batch/custom jobs. */
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { UnityModel } from '../types'
import { batchAllowed, countResults, formatMessage, rankResults } from '../lib/unity'
import { EmptyState, Header, kit, Line, LogBox, Row, Section, type Action, type Kit } from '../lib/ui'
import {
  affectedTests,
  batchTarget,
  bridgeCommand,
  createWorktree,
  landingsLine,
  refreshLandings,
  useMainTarget,
  configOf,
  patchModel,
  readModel,
  refreshModel,
  runTests,
  screenshot,
  startBatchJob,
  stopJob,
  type Options,
} from './state'

type Extra = {
  Input: (p: Record<string, unknown>) => RenderElement
  Select: (p: Record<string, unknown>) => RenderElement
  Link: (p: Record<string, unknown>) => RenderElement
}

export const PANE_ID = 'unity'
export const PANE_TITLE = 'UNITY'
export const BRIDGE_GIT_URL =
  'https://github.com/denny99/claude-plugins.git?path=/plugins/unity/bridge/com.denny99.claude-bridge'
export const BRIDGE_README =
  'https://github.com/denny99/claude-plugins/tree/main/plugins/unity/bridge/com.denny99.claude-bridge'

export async function openPane($: EngineInterface, options: Options): Promise<void> {
  await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
  $.clock.after(0, () => void refreshModel($, options).then(() => refreshLandings($, options)))
}

/** Hands a problem to Claude as a prompt. */
export async function fixWithClaude($: EngineInterface, what: string, detail: string): Promise<void> {
  await $.prompt.submit({ text: `Fix this Unity ${what}:\n\n${detail}` })
}

function run($: EngineInterface, label: string, work: () => Promise<string | undefined | void>): () => void {
  return () =>
    void (async () => {
      await patchModel($, { busy: label })
      try {
        const text = await work()
        if (text) void $.ui.toast(text.split('\n')[0] ?? text)
      } catch (e) {
        await patchModel($, { error: e instanceof Error ? e.message : String(e) })
      } finally {
        await patchModel($, { busy: undefined })
      }
    })()
}

export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>, options: Options): Promise<RenderElement> {
  const k = await kit($, e)
  const { Box } = k
  const x = $.ui.resolve(e) as unknown as Extra
  const m = await readModel($)
  const refresh = run($, 'refresh', async () => {
    await refreshModel($, options)
  })
  if (m.phase !== 'ok' || !m.project)
    return (
      <Box flexDirection="column">
        {Header(k, { title: PANE_TITLE, onRefresh: refresh })}
        {EmptyState(
          k,
          m.phase === 'unknown'
            ? 'Looking for a Unity project…'
            : 'No Unity project here (no ProjectSettings/ProjectVersion.txt at the root or one level down).',
        )}
      </Box>
    )
  return (
    <Box flexDirection="column" gap={1}>
      {Header(k, {
        title: PANE_TITLE,
        context: `${m.project.name} · ${m.project.version}${m.busy ? ` · ${m.busy}…` : ''}`,
        onRefresh: refresh,
        refreshing: m.busy === 'refresh',
      })}
      {m.error ? Line(k, `✗ ${m.error}`, { color: 'red' }) : null}
      {editorSection($, k, x, m, options)}
      {targetSection($, k, m, options)}
      {compileSection($, k, m)}
      {m.bridge.up ? consoleSection($, k, m, options) : null}
      {testsSection($, k, x, m, options)}
      {jobsSection($, k, m, options)}
    </Box>
  )
}

function editorSection($: EngineInterface, k: Kit, x: Extra, m: UnityModel, options: Options): RenderElement {
  const { Text } = k
  if (!m.bridge.up)
    return Section(k, {
      key: 'editor',
      title: 'Editor',
      children: [
        Row(k, {
          key: 'bridge-down',
          status: 'idle',
          primary:
            m.bridge.why === 'stale'
              ? 'Editor bridge not answering (editor closed or busy)'
              : 'Editor bridge not installed / editor closed',
          secondary: 'Package Manager → + → Add package from git URL:',
        }),
        k.compact ? null : <Text dimColor>{BRIDGE_GIT_URL}</Text>,
        <x.Link href={BRIDGE_README} label="Bridge install guide" />,
      ],
    })
  const b = m.bridge
  const state = b.isCompiling ? 'compiling' : b.isPlaying ? (b.isPaused ? 'paused' : 'playing') : 'edit mode'
  const actions: Action[] = b.isPlaying
    ? [
        {
          key: 'stop',
          label: 'Stop',
          primary: true,
          onPress: run($, 'stop', async () => msg(await bridgeCommand($, options, { cmd: 'stop' }), 'Stopped')),
        },
        {
          key: 'pause',
          label: b.isPaused ? 'Resume' : 'Pause',
          onPress: run($, 'pause', async () => msg(await bridgeCommand($, options, { cmd: 'pause' }), 'Toggled pause')),
        },
      ]
    : [
        {
          key: 'play',
          label: 'Play',
          primary: true,
          onPress: run($, 'play', async () => msg(await bridgeCommand($, options, { cmd: 'play' }), 'Playing')),
        },
      ]
  actions.push({
    key: 'shot',
    label: 'Screenshot',
    onPress: run($, 'screenshot', async () => {
      const r = await screenshot($, options)
      return 'error' in r ? `Screenshot failed: ${r.error}` : `Screenshot: ${r.path}`
    }),
  })
  return Section(k, {
    key: 'editor',
    title: 'Editor',
    children: [
      Row(k, {
        key: 'bridge-up',
        status: b.isCompiling ? 'running' : 'ok',
        primary: `Unity ${b.unityVersion ?? ''} · ${state}`.replace('  ', ' '),
        secondary: b.scene ? `scene ${b.scene}` : undefined,
        actions,
      }),
      m.lastShot ? Line(k, `last screenshot: ${m.lastShot}`, { dim: true }) : null,
    ],
  })
}

function msg(r: { ok: boolean; error?: string }, okText: string): string {
  return r.ok ? okText : `Failed: ${r.error ?? ''}`
}

function targetSection($: EngineInterface, k: Kit, m: UnityModel, options: Options): RenderElement {
  const target = batchTarget(m)
  const allowed = batchAllowed({ lock: target.lock, bridgeUp: target.bridgeUp })
  const cfg = configOf(m)
  const wt = m.worktree
  const actions: Action[] = []
  if (!wt || wt.status === 'failed')
    actions.push({
      key: 'worktree-new',
      label: 'Worktree',
      onPress: run($, 'worktree', async () => {
        const stamp = new Date(await $.clock.now()).toISOString().slice(0, 16).replace(/[-:T]/g, '')
        return createWorktree($, options, `batch-${stamp}`)
      }),
    })
  if (wt)
    actions.push({
      key: 'worktree-main',
      label: 'Use main',
      onPress: run($, 'main target', async () => {
        await useMainTarget($)
        return 'Batch runs go to the main checkout again.'
      }),
    })
  const editorState = m.bridge.up
    ? 'editor open'
    : m.lock === 'held'
      ? 'editor open (no bridge)'
      : m.lock === 'stale'
        ? 'stale lock file'
        : 'no editor'
  return Section(k, {
    key: 'target',
    title: 'Target',
    collapsible: true,
    actions,
    children: [
      Row(k, {
        key: 'target-row',
        status: allowed.ok ? 'ok' : 'warning',
        primary: target.worktree ? `${target.root} (worktree ${target.worktree})` : `${m.project?.root ?? ''}`,
        secondary: target.worktree
          ? `main checkout: ${editorState} · batch runs ${allowed.ok ? 'allowed' : 'blocked'} here`
          : `${editorState} · batch runs ${allowed.ok ? 'allowed' : 'blocked'}`,
      }),
      wt && wt.status !== 'ready'
        ? Row(k, {
            key: 'worktree-row',
            status: wt.status === 'copying' ? 'running' : 'failed',
            primary: `Worktree ${wt.name}: ${wt.status === 'copying' ? 'copying Library…' : (wt.error ?? 'failed')}`,
            secondary: wt.path,
            indent: 2,
          })
        : null,
      !allowed.ok ? Line(k, allowed.reason ?? '', { dim: true, indent: 2 }) : null,
      cfg.worktreeDir ? Line(k, `Worktrees for batch runs: ${cfg.worktreeDir}/`, { dim: true, indent: 2 }) : null,
      cfg.restoreBeforeCommit?.length
        ? Line(k, `Restore before commit: ${cfg.restoreBeforeCommit.join(', ')}`, { dim: true, indent: 2 })
        : null,
      !m.configFound ? Line(k, 'No .claude/unity.json — /unity-init drafts one.', { dim: true, indent: 2 }) : null,
      m.editorPath
        ? null
        : Line(k, `Unity ${m.project?.version ?? ''} not found in the Hub folders.`, { color: 'yellow', indent: 2 }),
    ],
  })
}

function compileSection($: EngineInterface, k: Kit, m: UnityModel): RenderElement | null {
  if (!m.compile) return null
  const errors = m.compile.messages.filter(x => x.severity === 'error')
  const warnings = m.compile.messages.length - errors.length
  return Section(k, {
    key: 'compile',
    title: 'Compile',
    count: errors.length ? `${errors.length} error(s)` : warnings ? `${warnings} warning(s)` : 'ok',
    children: [
      !errors.length
        ? Row(k, {
            key: 'compile-ok',
            status: 'ok',
            primary: `Compiled${warnings ? ` with ${warnings} warning(s)` : ''}`,
          })
        : null,
      ...errors.slice(0, 8).map((x, i) =>
        Row(k, {
          key: `cerr-${i}`,
          status: 'failed',
          primary: formatMessage(x),
          actions: [
            { key: `cfix-${i}`, label: 'Fix', onPress: () => void fixWithClaude($, 'compile error', formatMessage(x)) },
          ],
        }),
      ),
    ],
  })
}

function consoleSection($: EngineInterface, k: Kit, m: UnityModel, options: Options): RenderElement {
  const problems = m.console
    .filter(c => c.type !== 'Log')
    .slice(-10)
    .reverse()
  return Section(k, {
    key: 'console',
    title: 'Console',
    count: problems.length,
    collapsible: true,
    actions: problems.length
      ? [
          {
            key: 'console-clear',
            label: 'Clear',
            onPress: run($, 'clear', async () =>
              msg(await bridgeCommand($, options, { cmd: 'clear-console' }), 'Console cleared'),
            ),
          },
        ]
      : [],
    children: problems.length
      ? problems.map(c =>
          Row(k, {
            key: `con-${c.seq}`,
            status: c.type === 'Warning' ? 'warning' : 'failed',
            primary: c.message.split('\n')[0] ?? '',
            secondary: c.stack?.split('\n').find(l => l.trim()) ?? undefined,
            actions:
              c.type === 'Warning'
                ? []
                : [
                    {
                      key: `fix-${c.seq}`,
                      label: 'Fix',
                      onPress: () =>
                        void fixWithClaude($, `console ${c.type.toLowerCase()}`, `${c.message}\n${c.stack ?? ''}`),
                    },
                  ],
          }),
        )
      : [EmptyState(k, 'No errors or warnings.')],
  })
}

function testsSection($: EngineInterface, k: Kit, x: Extra, m: UnityModel, options: Options): RenderElement {
  const { Input, Select } = x
  const filter = m.filterInput.trim() || undefined
  const start = (mode: 'EditMode' | 'PlayMode'): (() => void) =>
    run($, `${mode} tests`, () => runTests($, options, mode, filter, 0))
  const t = m.tests
  const c = t ? countResults(t.results) : undefined
  const ranked = t ? rankResults(t.results, m.previous).filter(r => r.status === 'Failed') : []
  const target = batchTarget(m)
  const canRun = m.bridge.up || batchAllowed({ lock: target.lock, bridgeUp: false }).ok
  const reminder = landingsLine(m)
  return Section(k, {
    key: 'tests',
    title: 'Tests',
    count: c ? `${c.passed}✓ ${c.failed}✗` : undefined,
    actions: canRun
      ? [
          { key: 'edit-tests', label: 'EditMode', primary: true, onPress: start('EditMode') },
          { key: 'play-tests', label: 'PlayMode', onPress: start('PlayMode') },
          {
            key: 'affected-tests',
            label: 'Affected',
            onPress: run($, 'affected tests', () => affectedTests($, options, { run: true, waitMs: 0 })),
          },
        ]
      : [],
    children: [
      reminder ? Line(k, `⚠ ${reminder}`, { color: 'yellow' }) : null,
      m.affected
        ? Line(
            k,
            `Affected: ${m.affected.areas.length ? m.affected.areas.join(', ') : (m.affected.text.split('\n')[0] ?? '')}`,
            {
              dim: true,
            },
          )
        : null,
      <Input
        key="filter"
        label="Filter"
        placeholder="regex on full test names; ';' separates"
        value={m.filterInput}
        onSubmit={(v: string) => void patchModel($, { filterInput: v })}
      />,
      m.presets.length ? (
        <Select
          key="preset"
          label="Area"
          value={m.presets.find(p => p.filter === m.filterInput)?.name ?? ''}
          options={[{ value: '', label: '(all tests)' }, ...m.presets.map(p => ({ value: p.name, label: p.name }))]}
          onSelect={(v: string) => void patchModel($, { filterInput: m.presets.find(p => p.name === v)?.filter ?? '' })}
        />
      ) : null,
      !canRun ? Line(k, 'Tests need the editor bridge, or no editor open (batch).', { dim: true }) : null,
      t
        ? Row(k, {
            key: 'test-summary',
            status: t.state === 'running' ? 'running' : t.state === 'error' || (c?.failed ?? 0) > 0 ? 'failed' : 'ok',
            primary:
              t.state === 'running'
                ? `${t.mode ?? ''} running…`
                : t.state === 'error'
                  ? `Run broke: ${t.error ?? ''}`
                  : `${t.mode ?? ''} ${c?.passed ?? 0} passed, ${c?.failed ?? 0} failed, ${c?.skipped ?? 0} skipped`,
            secondary: t.filter ? `filter ${t.filter}` : undefined,
          })
        : null,
      ...ranked.slice(0, 10).map((r, i) =>
        Row(k, {
          key: `tf-${i}`,
          status: 'failed',
          primary: `${r.newlyRed ? 'NEW ' : ''}${r.fullName}`,
          secondary: r.message?.split('\n')[0],
          actions: [
            {
              key: `tfix-${i}`,
              label: 'Fix',
              onPress: () =>
                void fixWithClaude($, 'failing test', `${r.fullName}\n${r.message ?? ''}\n${r.stack ?? ''}`),
            },
          ],
        }),
      ),
    ],
  })
}

function jobsSection($: EngineInterface, k: Kit, m: UnityModel, options: Options): RenderElement | null {
  const cfg = configOf(m)
  const target = batchTarget(m)
  const allowed = batchAllowed({ lock: target.lock, bridgeUp: target.bridgeUp }).ok
  const actions: Action[] = []
  if (allowed) {
    actions.push({
      key: 'batch-compile',
      label: 'Compile check',
      onPress: run($, 'compile check', () => startBatchJob($, options, 'compile', {})),
    })
    if (cfg.buildMethod)
      actions.push({
        key: 'batch-build',
        label: 'Build',
        onPress: run($, 'build', () => startBatchJob($, options, 'build', {})),
      })
  }
  for (const j of cfg.customJobs ?? [])
    if (!j.batch || allowed)
      actions.push({
        key: `custom-${j.name}`,
        label: j.name,
        onPress: run($, j.name, () => startBatchJob($, options, 'custom', { custom: j.name })),
      })
  if (!actions.length && !m.jobs.length) return null
  const latest = [...m.jobs].reverse()
  const glyph = (s: string) =>
    (s === 'running' ? 'running' : s === 'exited' ? 'ok' : s === 'stopped' ? 'idle' : 'failed') as
      'running' | 'ok' | 'idle' | 'failed'
  return Section(k, {
    key: 'jobs',
    title: 'Jobs',
    count: m.jobs.filter(j => j.status === 'running').length || undefined,
    actions,
    children: [
      ...latest.slice(0, 5).map(j =>
        Row(k, {
          key: `job-${j.key}`,
          status: glyph(j.status),
          primary: `${j.name} · ${j.status}${j.exitCode !== undefined ? ` (exit ${j.exitCode})` : ''}`,
          secondary: j.error ?? (j.taskId ? `task ${j.taskId}` : undefined),
          actions:
            j.status === 'running'
              ? [
                  {
                    key: `stop-${j.key}`,
                    label: 'Stop',
                    confirm: 'Really stop?',
                    onPress: run($, 'stop job', async () => (await stopJob($, j.key)) ?? 'Stopped'),
                  },
                ]
              : [],
        }),
      ),
      latest[0]?.status === 'failed' && latest[0].failLog?.length
        ? LogBox(k, {
            key: 'job-faillog',
            title: `Last ${Math.min(60, latest[0].failLog.length)} log lines · ${latest[0].name}`,
            lines: latest[0].failLog,
          })
        : latest[0] && latest[0].tail.length
          ? LogBox(k, { key: 'job-log', title: `Log · ${latest[0].name}`, lines: latest[0].tail })
          : null,
    ],
  })
}
