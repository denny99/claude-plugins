// Runde 2 (6): the live watch starts at session start in a Unity project, without panel, chip or measurement.
// Its own file: each test file runs in its own process, so no watch is left over from another test.
import { expect, test } from 'claude-code/testing'

import { fakeWorld, ROOT } from './world'

test('(r6) live watch: session start alone reads the heartbeat on the clock', async ($, on) => {
  const world = fakeWorld(on)
  // every read of the fake status.json asks `bridge.up` first: count those asks
  let reads = 0
  let up = world.bridge.up
  Object.defineProperty(world.bridge, 'up', {
    get: () => (reads++, up),
    set: (v: boolean) => void (up = v),
    configurable: true,
  })
  await world.clock.advance(3100)
  expect(reads).toBe(0) // nothing runs before the session starts
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  // (in this harness the auto-open at session start starts it too; with autoOpen off, autoOpen() starts it first)
  const before = reads
  await world.clock.advance(3100)
  expect(reads).toBeGreaterThan(before)
})
