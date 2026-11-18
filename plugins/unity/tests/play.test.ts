import { describe, expect, test } from 'claude-code/testing'

import { sendCommand, type BridgeCommand, type BridgeResult } from '../lib/bridge'
import type { Host } from '../lib/host'
import {
  capture,
  gotoSpot,
  mixGet,
  mixSet,
  perfRecord,
  perfTimeoutMs,
  soundList,
  soundPlay,
  soundStop,
  type Send,
} from '../lib/play'

/** A sender that records commands + timeouts and answers from a table. */
function fakeSend(answer: (c: BridgeCommand) => BridgeResult) {
  const sent: { command: BridgeCommand; timeoutMs: number }[] = []
  const send: Send = async (command, timeoutMs) => {
    sent.push({ command, timeoutMs })
    return answer(command)
  }
  return { send, sent }
}

const ok = (data: Record<string, unknown>): BridgeResult => ({ ok: true, data: { id: 'x', ok: true, ...data } })
const noProvider: BridgeResult = { ok: false, error: 'no provider', code: 'no-provider' }

describe('capture', () => {
  test('parses picture, camera and the free-form spot', async () => {
    const { send, sent } = fakeSend(() =>
      ok({
        path: '/p/Temp/ClaudeBridge/shots/a.png',
        playing: true,
        scene: 'Assets/A.unity',
        provider: true,
        camera: { name: 'Main Camera', position: [1, 2, 3], rotation: [0, 90, 0], fov: 60 },
        spot: { pos: [1, 2], weather: 'rain', seed: 42 },
      }),
    )
    const r = await capture(send, { width: 320 })
    expect(r).toEqual({
      path: '/p/Temp/ClaudeBridge/shots/a.png',
      playing: true,
      scene: 'Assets/A.unity',
      provider: true,
      camera: { name: 'Main Camera', position: [1, 2, 3], rotation: [0, 90, 0], fov: 60 },
      spot: { pos: [1, 2], weather: 'rain', seed: 42 },
    })
    expect(sent[0]).toEqual({ command: { cmd: 'capture', width: 320 }, timeoutMs: 20000 })
  })

  test('without provider: picture + camera only (spot null is dropped)', async () => {
    const { send } = fakeSend(() => ok({ path: '/a.png', provider: false, spot: null, camera: null }))
    expect(await capture(send)).toEqual({ path: '/a.png', playing: false, provider: false })
  })

  test('an old bridge says how to update instead of "unknown command"', async () => {
    const { send } = fakeSend(() => ({ ok: false, error: 'ArgumentException: unknown command capture' }))
    const r = await capture(send)
    expect(r).toEqual({ code: 'outdated', error: expect.stringContaining('Package Manager → Claude Bridge → Update') })
  })

  test('a timeout is named with what was attempted', async () => {
    const { send } = fakeSend(() => ({ ok: false, code: 'timeout', error: 'Der Editor hat nicht innerhalb von 20 s geantwortet' }))
    expect(await capture(send)).toEqual({
      code: 'timeout',
      error: 'Der Editor hat nicht innerhalb von 20 s geantwortet (die Ansicht aufnehmen).',
    })
  })
})

describe('goto', () => {
  test('sends the spot as JSON text, returns the spot reached', async () => {
    const { send, sent } = fakeSend(() => ok({ spot: { pos: [9, 9] } }))
    expect(await gotoSpot(send, { pos: [1, 2] })).toEqual({ spot: { pos: [9, 9] } })
    expect(sent[0]?.command).toEqual({ cmd: 'goto', spot: '{"pos":[1,2]}' })
  })

  test('no provider → a clear sentence', async () => {
    const { send } = fakeSend(() => noProvider)
    expect(await gotoSpot(send, '{"a":1}')).toEqual({
      code: 'no-provider',
      error: 'Dieses Projekt kann nicht zu einer Stelle springen (es hat dafür nichts registriert).',
    })
  })

  test('refuses a non-object without asking the bridge', async () => {
    const { send, sent } = fakeSend(() => ok({}))
    expect(await gotoSpot(send, 'nope')).toMatchObject({ code: 'bad-input' })
    expect(sent).toHaveLength(0)
  })
})

describe('perf_record', () => {
  const perf = {
    seconds: 4.98,
    requestedSeconds: 5,
    frames: 300,
    budgetMs: 16.6,
    avgMs: 16.6,
    p50: 15,
    p95: 22,
    p99: 31,
    worst: 48,
    hitches: 12,
    seriesStep: 2,
    series: [15, 48],
    costs: [{ name: 'AI', avgMs: 1, maxMs: 9, hitchAvgMs: 6, hitchMaxMs: 9, hitchShare: 0.25 }],
  }

  test('clamps seconds, waits long enough, parses stats + costs + spot', async () => {
    const { send, sent } = fakeSend(() => ok({ perf, spot: { pos: [1] } }))
    const r = await perfRecord(send, 500)
    expect(sent[0]).toEqual({ command: { cmd: 'perf_record', seconds: 120 }, timeoutMs: perfTimeoutMs(120) })
    expect(r).toEqual({ ...perf, spot: { pos: [1] } })
    expect(perfTimeoutMs(5)).toBe(20000)
  })

  test('outside Play mode', async () => {
    const { send } = fakeSend(() => ({ ok: false, error: 'perf_record needs Play mode.', code: 'not-playing' }))
    expect(await perfRecord(send, 5)).toEqual({
      code: 'not-playing',
      error: 'Messen geht nur im Play-Modus: erst Play drücken.',
    })
  })

  test('aborted recording keeps the partial data and the reason', async () => {
    const { send } = fakeSend(() => ok({ perf: { ...perf, aborted: 'Play mode ended during the recording.' } }))
    expect(await perfRecord(send, 5)).toMatchObject({ aborted: 'Play mode ended during the recording.', frames: 300 })
  })
})

describe('sounds and mix', () => {
  test('list, play, stop, mix get/set', async () => {
    const { send, sent } = fakeSend(c =>
      c.cmd === 'sound_list'
        ? ok({ sounds: [{ id: 'door', name: 'door', group: 'SFX', duration: 1.25, takes: 3 }, { name: 'no id' }] })
        : c.cmd === 'mix_get' || c.cmd === 'mix_set'
          ? ok({ groups: [{ group: 'Music', db: c.cmd === 'mix_set' ? c.db : -6 }] })
          : ok({}),
    )
    expect(await soundList(send)).toEqual({
      sounds: [{ id: 'door', name: 'door', group: 'SFX', duration: 1.25, takes: 3 }],
    })
    expect(await soundPlay(send, 'door', 'flat')).toEqual({ sound: 'door', mode: 'flat' })
    expect(await soundStop(send)).toEqual({ stopped: true })
    expect(await mixGet(send)).toEqual({ groups: [{ group: 'Music', db: -6 }] })
    expect(await mixSet(send, 'Music', -200)).toEqual({ groups: [{ group: 'Music', db: -80 }] })
    expect(sent.map(s => s.command.cmd)).toEqual(['sound_list', 'sound_play', 'sound_stop', 'mix_get', 'mix_set'])
    expect(sent[1]?.command).toEqual({ cmd: 'sound_play', sound: 'door', mode: 'flat' })
  })

  test('no sound board → one clear sentence for every call', async () => {
    const { send } = fakeSend(() => noProvider)
    const want = {
      code: 'no-provider',
      error: 'Dieses Projekt hat kein Soundboard (es hat dafür nichts registriert).',
    }
    expect(await soundList(send)).toEqual(want)
    expect(await soundPlay(send, 'x')).toEqual(want)
    expect(await mixSet(send, 'Music', 0)).toEqual(want)
  })

  test('bad input never reaches the bridge', async () => {
    const { send, sent } = fakeSend(() => ok({}))
    expect(await soundPlay(send, '')).toMatchObject({ code: 'bad-input' })
    expect(await mixSet(send, 'Music', Number.NaN)).toMatchObject({ code: 'bad-input' })
    expect(sent).toHaveLength(0)
  })
})

describe('file queue', () => {
  /** A host whose "editor" answers each cmd file at once, like the bridge does. */
  function queueHost(answer: (cmd: Record<string, unknown>) => Record<string, unknown>) {
    const files: Record<string, string> = {}
    let t = 0
    const host = {
      now: async () => t,
      after: (ms: number, fn: () => void) => {
        t += ms
        fn()
      },
      fs: {
        exists: async (p: string) => p in files,
        read: async (p: string) => files[p] ?? '',
        write: async (p: string, text: string) => {
          files[p] = text
          const m = /cmd-([^/]+)\.json$/.exec(p)
          if (m) {
            const cmd = JSON.parse(text) as Record<string, unknown>
            files[p.replace(/cmd-([^/]+)\.json$/, `result-${m[1]}.json`)] = JSON.stringify({ id: m[1], ...answer(cmd) })
          }
        },
      },
    } as unknown as Pick<Host, 'fs' | 'after' | 'now'>
    return { host, files }
  }

  test('flat command fields on disk; the error code comes back', async () => {
    const seen: Record<string, unknown>[] = []
    const { host } = queueHost(cmd => {
      seen.push(cmd)
      return { ok: false, error: 'no board', code: 'no-provider' }
    })
    const send: Send = (c, ms) => sendCommand(host, '/p', c, ms)
    expect(await mixSet(send, 'Music', -3)).toMatchObject({ code: 'no-provider' })
    expect(seen[0]).toMatchObject({ cmd: 'mix_set', group: 'Music', db: -3 })
    expect(typeof seen[0]?.id).toBe('string')
  })

  test('an empty code from JsonUtility is no code', async () => {
    const { host } = queueHost(() => ({ ok: false, error: 'boom', code: '' }))
    expect(await sendCommand(host, '/p', { cmd: 'sound_stop' })).toEqual({ ok: false, error: 'boom' })
  })
})
