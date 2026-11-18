/** Shared engine stand-ins for the plugin-level tests (not a test file itself). */
import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'

import { BRIDGE_VERSION } from '../lib/bridge'

export const VERSION = 'm_EditorVersion: 6000.6.7f1\n'
export const ROOT = '/g'
export const PROJECT = '/g/unity'
export const BRIDGE = `${PROJECT}/Temp/ClaudeBridge`
export const EDITOR = '/Applications/Unity/Hub/Editor/6000.6.7f1/Unity.app/Contents/MacOS/Unity'

export type World = {
  git: { status: string; diff: string; untracked: string; head: string; count: string; top: string; worktrees: string }
  /** Extra folder listings for fs.list (name → dirs in it). */
  dirs: Record<string, string[]>
  files: Record<string, string>
  calls: Record<string, unknown>[]
  argv: string[]
  prompts: string[]
  /** Extra heartbeat fields (newer bridge fields, or overrides like isCompiling / scene). */
  statusExtra: Record<string, unknown>
  bridge: { up: boolean; isPlaying: boolean; compileSeq: number; errors: boolean; nothingToCompile?: boolean }
  clock: { advance(ms: number): Promise<void> }
}

/** Engine stand-ins: an in-memory disk, a faked editor bridge reacting to cmd files, Bash/TaskStop, lsof. */
export function fakeWorld(
  on: On,
  opts: {
    bridge?: boolean
    lock?: 'held' | 'stale' | 'none'
    config?: Record<string, unknown>
    platform?: 'macos' | 'windows' | 'linux'
    store?: Record<string, unknown>
    /** A sound board + spot provider in the fake bridge (sound_*, mix_*, goto answer instead of no-provider). */
    board?: {
      sounds: { id: string; name: string; group: string; duration: number; takes: number }[]
      mix: { group: string; db: number }[]
    }
  } = {},
): World {
  const files: Record<string, string> = {
    [`${PROJECT}/ProjectSettings/ProjectVersion.txt`]: VERSION,
    [EDITOR]: '',
    [`${ROOT}/.claude/unity.json`]: JSON.stringify({
      tests: { areas: { Core: 'Game.Tests.Core' } },
      customJobs: [{ name: 'Smoke', command: 'node tools/smoke.mjs', batch: true }],
      editorEnv: { GAME_MUTE: '1' },
      ...opts.config,
    }),
  }
  if (opts.lock && opts.lock !== 'none') files[`${PROJECT}/Temp/UnityLockfile`] = ''
  const world: World = {
    git: { status: '', diff: '', untracked: '', head: 'abc123', count: '0', top: ROOT, worktrees: '' },
    dirs: {},
    files,
    calls: [],
    argv: [],
    prompts: [],
    statusExtra: {},
    bridge: { up: opts.bridge ?? true, isPlaying: false, compileSeq: 3, errors: true },
    clock: mock.clock(on, { now: 1000 }),
  }
  const statusText = () =>
    JSON.stringify({
      updatedAt: 1e13,
      unityVersion: '6000.6.7f1',
      isCompiling: false,
      isPlaying: world.bridge.isPlaying,
      isPaused: false,
      compileSeq: world.bridge.compileSeq,
      scene: 'Assets/Scenes/Main.unity',
      bridgeVersion: BRIDGE_VERSION, // the shipped bridge; an old one: statusExtra.bridgeVersion = undefined
      ...world.statusExtra,
    })
  const read = (p: string): string | undefined =>
    p === `${BRIDGE}/status.json` && world.bridge.up ? statusText() : files[p]
  mock.store(on, opts.store ?? {})
  mock.env(on, { HOME: '/Users/d', PATH: '/usr/bin' })
  on('session.info', () => ({ value: { transcriptPath: '', platform: opts.platform ?? ('macos' as const) } }))
  on('session.root', () => ({ value: ROOT }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: read(e.path) !== undefined }))
  on('fs.read', (_, e) => {
    const text = read(e.path)
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    if (e.as === 'bytes') return { value: { base64: btoa(text) } }
    return { value: e.offset !== undefined ? text.slice(e.offset, e.offset + (e.length ?? text.length)) : text }
  })
  on('fs.stat', (_, e) => {
    const text = read(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: { size: text.length, mtimeMs: 1, isFile: true, isDirectory: false, isLink: false } as never }
  })
  on('fs.list', (_, e) => ({
    value:
      e.path === ROOT
        ? [{ name: 'unity', kind: 'dir' as const, size: 0, mtimeMs: 1, isLink: false } as never]
        : (world.dirs[e.path] ?? []).map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 1, isLink: false }) as never),
  }))
  on('fs.write', (_, e) => {
    files[e.path] = String(e.text ?? '')
    const m = /cmd-([^/]+)\.json$/.exec(e.path)
    if (m && world.bridge.up) {
      const cmd = JSON.parse(files[e.path] ?? '{}') as Record<string, unknown>
      const done = (data: Record<string, unknown>) => {
        files[`${BRIDGE}/result-${m[1]}.json`] = JSON.stringify({ id: m[1], ok: true, ...data })
      }
      const fail = (error: string, code: string) => {
        files[`${BRIDGE}/result-${m[1]}.json`] = JSON.stringify({ id: m[1], ok: false, error, code })
      }
      if (cmd.cmd === 'cancel-tests') {
        const t = JSON.parse(files[`${BRIDGE}/tests.json`] ?? '{}') as Record<string, unknown>
        files[`${BRIDGE}/tests.json`] = JSON.stringify({ ...t, state: 'error', error: 'Cancelled', current: '' })
        done({ runId: t.runId })
      } else if (cmd.cmd === 'refresh' && world.bridge.nothingToCompile) done({})
      else if (cmd.cmd === 'refresh') {
        world.bridge.compileSeq++
        files[`${BRIDGE}/compile.json`] = JSON.stringify({
          seq: world.bridge.compileSeq,
          finishedAt: 2000,
          messages: world.bridge.errors
            ? [
                {
                  severity: 'Error',
                  message: 'Assets/Game/A.cs(3,1): error CS1002: ; expected',
                  file: 'Assets/Game/A.cs',
                  line: 3,
                  column: 1,
                },
              ]
            : [],
        })
        done({})
      } else if (cmd.cmd === 'run-tests') {
        files[`${BRIDGE}/tests.json`] = JSON.stringify({
          runId: 'r1',
          state: 'done',
          mode: cmd.mode,
          filter: cmd.filter,
          results: [
            { fullName: 'Game.Tests.Core.Adds', name: 'Adds', status: 'Passed' },
            { fullName: 'Game.Tests.Core.Breaks', name: 'Breaks', status: 'Failed', message: 'Expected 1 but was 2' },
          ],
        })
        done({ runId: 'r1' })
      } else if (cmd.cmd === 'screenshot') {
        files[String(cmd.path)] = 'PNG!'
        done({ path: cmd.path })
      } else if (cmd.cmd === 'capture') {
        files[String(cmd.path)] = 'PNG!'
        done({
          path: cmd.path,
          playing: world.bridge.isPlaying,
          scene: 'Assets/Scenes/Main.unity',
          provider: true,
          camera: { name: 'Main Camera', position: [1, 2, 3], rotation: [10, 0, 0], fov: 60 },
          spot: { pos: [4, 5, 6], weather: 'rain' },
        })
      } else if (cmd.cmd === 'perf_record') {
        if (!world.bridge.isPlaying) fail('perf_record needs Play mode.', 'not-playing')
        else
          done({
            perf: {
              seconds: cmd.seconds,
              requestedSeconds: cmd.seconds,
              frames: 3,
              budgetMs: 16.6,
              avgMs: 15,
              p50: 10,
              p95: 30,
              p99: 30,
              worst: 30,
              hitches: 1,
              seriesStep: 1,
              series: [10, 5, 30],
              costs: [{ name: 'AI', avgMs: 2, maxMs: 5, hitchAvgMs: 5, hitchMaxMs: 5, hitchShare: 0.16 }],
            },
            spot: { pos: [4, 5, 6] },
          })
      } else if (opts.board && /^(sound_|mix_|goto$)/.test(String(cmd.cmd))) {
        const b = opts.board
        if (cmd.cmd === 'sound_list') done({ sounds: b.sounds })
        else if (cmd.cmd === 'sound_play') done({ sound: cmd.sound, mode: cmd.mode })
        else if (cmd.cmd === 'mix_get') done({ groups: b.mix })
        else if (cmd.cmd === 'mix_set') {
          const g = b.mix.find(x => x.group === cmd.group)
          if (!g) fail(`unknown group ${String(cmd.group)}`, 'bad-input')
          else {
            g.db = Number(cmd.db)
            done({ groups: b.mix })
          }
        } else if (cmd.cmd === 'goto') done({ spot: { line: cmd.spot } })
        else done({})
      } else if (/^(sound_|mix_|goto$)/.test(String(cmd.cmd))) {
        fail('This project offers no sound board (no IClaudeSoundBoard registered).', 'no-provider')
      } else if (cmd.cmd === 'play') {
        world.bridge.isPlaying = true
        done({})
      } else done({})
    }
    return { value: undefined }
  })
  on('process.spawn', async function* (_, e) {
    world.argv.push(e.argv.join(' '))
    if (e.argv[0] === 'git') {
      const a = e.argv.slice(1)
      const out = a.includes('--show-toplevel')
        ? `${world.git.top}\n`
        : a.includes('worktree') && a.includes('list')
          ? world.git.worktrees
          : a.includes('--show-toplevel')
        ? `${world.git.top}\n`
        : a.includes('rev-parse')
          ? `${world.git.head}\n`
          : a.includes('status')
            ? world.git.status
            : a.includes('diff')
              ? world.git.diff
              : a.includes('ls-files')
                ? world.git.untracked
                : a.includes('rev-list')
                  ? `${world.git.count}\n`
                  : ''
      if (a.includes('worktree') && a.includes('add')) files[String(a[a.length - 1])] = ''
      if (out) yield { stream: 'stdout' as const, text: out }
      return { value: { code: 0, signal: null } }
    }
    if (e.argv[0] === 'lsof' && opts.lock === 'held') {
      yield { stream: 'stdout' as const, text: '4242\n' }
      return { value: { code: 0, signal: null } }
    }
    return { value: { code: 1, signal: null } }
  })
  on('tool.call', (_, e) => {
    world.calls.push(e as unknown as Record<string, unknown>)
    if (e.tool === 'Bash') {
      const id = `b${world.calls.filter(c => c.tool === 'Bash').length}`
      files[`/tmp/t/${id}.output`] = 'Unity batch log\n'
      return {
        result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: id },
        text: `Command running in background with ID: ${id}. Output is being written to: /tmp/t/${id}.output.`,
      }
    }
    return { result: {} }
  })
  on('tool.check', () => ({ decision: 'allow' as const, value: { decision: 'allow' as const } }) as never)
  on('prompt.submit', (_, e) => {
    world.prompts.push(e.text)
    return { text: e.text } as never
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__unity__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  return world
}

/** Resolves a call that sleeps on the mocked clock. */
export async function settle<T>(world: World, p: Promise<T>, steps = 80): Promise<T> {
  let done = false
  void p.then(() => (done = true))
  for (let i = 0; i < steps && !done; i++) await world.clock.advance(250)
  return p
}

export const PANE = {
  plugin: 'unity',
  component: 'Pane',
  requestId: 'unity',
  props: {
    title: 'UNITY',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 80 },
    view: {},
  },
} as const
