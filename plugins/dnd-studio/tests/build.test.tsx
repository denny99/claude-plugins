import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import { findShown } from './shown'

import { checkColors } from '../lib/make-colors.js'
import { LOOKS, phaseLook } from '../lib/looks'
import type { LookId } from '../lib/looks'
import { buildPhase, countFindings, findingsPathOf, pnpAgentOf } from '../lib/model'
import { augmentedPath, startArgv } from '../lib/host'
import { buildOpen } from '../features/look'

const PANE = {
  plugin: 'dnd-studio',
  component: 'Pane',
  requestId: 'dnd',
  props: { title: 'D&D', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('the build cockpit tracks pnp agents and counts the reviewers’ findings', async ($, on) => {
  const themes: string[] = []
  mock.clock(on, { now: 1_700_000_000_000 })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', () => ({ value: {} as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('theme.set', (_, e) => {
    themes.push(String((e as { backdrop?: { scene?: string } }).backdrop?.scene))
    return { value: { isDrawn: true } as never }
  })
  on('theme.clear', () => {
    themes.push('clear')
    return { value: { isDrawn: true } as never }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', (_, e) => ({ value: ({ HOME: '/Users/d', PATH: '/usr/bin' } as Record<string, string>)[e.name] }))
  on('fs.read', (_, e) => {
    // on Windows the engine hands "/a/b" on as "C:\a\b": compared the POSIX way
    if (e.path.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/') === '/Users/d/kampagne/maengel-technik.md') return { value: '# Mängel\n\n1. Szene 2 ohne Bild\n2. Bartel ohne Stimme\n' }
    throw new Error('missing')
  })
  on('agent.spawn', (_, e) => ({ model: 'opus', agentId: e.description }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'Prüfe die Kampagne. Mängel-Datei: ~/kampagne/maengel-technik.md',
    description: 'a1',
    subagentType: 'dnd-studio:pnp-review-technik',
    parentModel: 'opus',
  } as never)
  await $.agent.spawn({ tool_use_id: 't2', prompt: 'x', description: 'other', subagentType: 'general-purpose', parentModel: 'opus' } as never)
  expect(themes).toEqual(['dnd-inspect'])

  await $.command.run({ command: 'dnd', args: 'build' } as never).catch(() => undefined)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await findShown(ui, /Prüfer Technik/))?.text).toContain('Prüfer Technik')
  await ui.unmount()

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'x', agentId: 'a1', reason: 'answer' } as never)
  const ui2 = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect((await findShown(ui2, /2 Mängel/))?.text).toContain('2 Mängel')
  await ui2.unmount()
  // Between phases the build stays open: the review look stands instead of flickering back to the person's theme.
  expect(themes).toEqual(['dnd-inspect'])
})

test('a build is open between phases until the fixes end, reset or three idle hours', () => {
  const t = 1_700_000_000_000
  const run = (agent: string, state: 'running' | 'done', endedAt?: number) => ({ id: agent, agent, campaign: 'K', state, startedAt: t - 1000, endedAt })
  expect(buildOpen([run('pnp-texter', 'running')], t)).toBe(true)
  expect(buildOpen([run('pnp-architekt', 'done', t - 60_000)], t)).toBe(true)
  expect(buildOpen([run('pnp-architekt', 'done', t - 4 * 3600_000)], t)).toBe(false)
  expect(buildOpen([run('pnp-nachbesserer', 'done', t - 60_000)], t)).toBe(false)
  expect(buildOpen([], t)).toBe(false)
})

const SEASONS = {
  name: 'seasons',
  register(on: On) {
    on('agent.spawn', async ($, e, next) => {
      const r = await next(e)
      if (e.subagentType === 'general-purpose') await $.theme.set({ colors: {} } as never)
      return r
    })
  },
}

test('a theme another plugin set after ours is never cleared when our look goes off', { plugins: [SEASONS as never] }, async ($, on) => {
  const themes: string[] = []
  mock.clock(on, { now: 1_700_000_000_000 })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', () => ({ value: {} as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('theme.set', (_, e) => {
    themes.push(String((e as { backdrop?: { scene?: string } }).backdrop?.scene ?? 'other'))
    return { value: { isDrawn: true, requestId: 'r' } as never }
  })
  on('theme.clear', () => {
    themes.push('clear')
    return { value: { isDrawn: true } as never }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', (_, e) => ({ value: ({ HOME: '/Users/d', PATH: '/usr/bin' } as Record<string, string>)[e.name] }))
  on('fs.read', () => {
    throw new Error('missing')
  })
  on('agent.spawn', (_, e) => ({ model: 'opus', agentId: e.description }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'x', description: 'a1', subagentType: 'dnd-studio:pnp-texter', parentModel: 'opus' } as never)
  expect(themes.length).toBe(1)
  // Another plugin (seasons) sets its own theme over ours.
  await $.agent.spawn({ tool_use_id: 't2', prompt: 'x', description: 'g1', subagentType: 'general-purpose', parentModel: 'opus' } as never)
  expect(themes).toEqual(['dnd-ink', 'other'])
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'x', agentId: 'a1', reason: 'answer' } as never)
  expect(themes).not.toContain('clear')
})

test('agent names, findings paths and counts', () => {
  expect(pnpAgentOf('dnd-studio:pnp-maler')).toBe('pnp-maler')
  expect(pnpAgentOf('pnp-texter')).toBe('pnp-texter')
  expect(pnpAgentOf('Explore')).toBeUndefined()
  expect(findingsPathOf('Protokoll /tmp/a.md, Mängel C:\\k\\maengel.md')).toBe('C:\\k\\maengel.md')
  expect(countFindings('Keine Mängel gefunden.')).toBe(0)
  expect(countFindings('## Szene 1\ntext\n## Szene 2\n')).toBe(2)
  expect(countFindings('- a\n  - detail\n- b\n- c')).toBe(3)
})

test('build phases map to their looks', () => {
  const run = (agent: string, state: 'running' | 'done') => ({ id: agent, agent, campaign: '', state, startedAt: 0 })
  expect(phaseLook(buildPhase([run('pnp-lore', 'running')]))).toBe('parchment')
  expect(phaseLook(buildPhase([run('pnp-lore', 'done'), run('pnp-architekt', 'running')]))).toBe('blueprint')
  expect(phaseLook(buildPhase([run('pnp-texter', 'running')]))).toBe('ink')
  expect(phaseLook(buildPhase([run('pnp-maler', 'running')]))).toBe('studio')
  expect(phaseLook(buildPhase([run('pnp-klang', 'running')]))).toBe('music')
  expect(phaseLook(buildPhase([run('pnp-tischbereit', 'running')]))).toBe('stage')
  expect(phaseLook(buildPhase([run('pnp-review-konsistenz', 'running')]))).toBe('inspect')
  expect(phaseLook(buildPhase([run('pnp-nachbesserer', 'running')]))).toBe('forge')
  expect(phaseLook(buildPhase([run('pnp-nachbesserer', 'done')]))).toBe('table')
  expect(phaseLook(buildPhase([]))).toBe('')
})

test('every look paints and every scene is small pure vector', () => {
  for (const id of Object.keys(LOOKS) as LookId[]) {
    const look = LOOKS[id]
    expect(checkColors(look.colors).filter(l => l.startsWith("Desktop won't paint"))).toEqual([])
    expect(look.problems.filter(l => l.startsWith("Desktop won't paint"))).toEqual([])
    expect(look.svg.length < 131072).toBe(true)
    expect(/<image|href|<!--/i.test(look.svg)).toBe(false)
    expect(look.svg.includes('prefers-reduced-motion')).toBe(true)
  }
})

test('host paths per OS', () => {
  expect(augmentedPath('windows', 'C:\\Users\\d', 'C:\\Windows\\System32;C:\\x').split(';')).toContain('C:\\x')
  expect(augmentedPath('windows', 'C:\\Users\\d', 'C:\\x').includes(':/')).toBe(false)
  expect(augmentedPath('macos', '/Users/d', '/usr/bin').startsWith('/opt/homebrew/bin:')).toBe(true)
  expect(startArgv('windows', 'C:\\Users\\d\\AppData\\Local')).toEqual([
    'explorer.exe',
    'C:\\Users\\d\\AppData\\Local\\Programs\\DnD Studio\\DnD Studio.exe',
  ])
  expect(startArgv('linux', '')).toBeUndefined()
})
