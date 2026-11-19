// Runde 3, kleine Befunde: „Sperre lösen?“ erster Klick tat nichts [2], Warnung „Bereich trifft … nicht“ mit Rohtext [3],
// Bereich als Satz statt Testnamen (Beifang).
import { expect } from 'claude-code/testing'
import { test } from './limits'

import { loadProjectConfig, normalizeFilter, unmatchedParts } from '../lib/unity'
import { confirmStep } from '../lib/ui'
import { fakeWorld, PANE, PROJECT, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const
const PKG = 'com.denny99.claude-bridge'

function oldBridge(world: ReturnType<typeof fakeWorld>): void {
  world.files[`${PROJECT}/Packages/manifest.json`] = JSON.stringify({ dependencies: { [PKG]: 'https://x/y.git' } })
  world.files[`${PROJECT}/Packages/packages-lock.json`] = JSON.stringify({
    dependencies: { [PKG]: { version: 'https://x/y.git', hash: '58a5ce9' } },
  })
  world.dirs[`${PROJECT}/Library/PackageCache`] = [`${PKG}@b055521ea1a0`]
  world.files[`${PROJECT}/Library/PackageCache/${PKG}@b055521ea1a0/package.json`] = JSON.stringify({ version: '0.1.0' })
  world.statusExtra.bridgeVersion = undefined
}

test('[2] two-step press is decided on the state at press time: an old handler on the question confirms', () => {
  // The desktop may keep the handler of the button drawn before (same key). Both steps now run the same press,
  // which looks at the pending question when pressed: asks when none stands, confirms when this key's does.
  expect(confirmStep(undefined, 'bridge-update')).toEqual({ fire: false, confirm: 'bridge-update' })
  expect(confirmStep('bridge-update', 'bridge-update')).toEqual({ fire: true, confirm: undefined })
  expect(confirmStep('other', 'bridge-update')).toEqual({ fire: false, confirm: 'bridge-update' })
})

test('[2] two-step button: cancel, then one press asks again (does not confirm)', async ($, on) => {
  const world = fakeWorld(on)
  oldBridge(world)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  await settle(world, ui.press({ key: 'bridge-update' }))
  await settle(world, ui.press({ key: 'bridge-update-cancel' }))
  await settle(world, ui.press({ key: 'bridge-update' }))
  expect(world.files[`${PROJECT}/Packages/packages-lock.json`]).toContain(PKG)
  expect(await ui.find({ type: 'Button', key: 'bridge-update-cancel' })).toBeDefined() // asks again
  await settle(world, ui.press({ key: 'bridge-update' })) // confirms
  expect(JSON.parse(world.files[`${PROJECT}/Packages/packages-lock.json`] ?? '{}').dependencies[PKG]).toBeUndefined()
  await ui.unmount()
})

test('[3] a part without hits is named by its class, not by the raw command line of an old run', () => {
  const raw = '-testFilter "Cozy.Presentation.Tests.ClaudeProvidersTests;Cozy.Core.Tests"'
  expect(unmatchedParts(raw, ['Cozy.Core.Tests.A.Works'])).toEqual(['Cozy.Presentation.Tests.ClaudeProvidersTests'])
  expect(unmatchedParts('Cozy.Core.Tests', ['Cozy.Core.Tests.A.Works'])).toEqual([])
  expect(unmatchedParts(undefined, ['x'])).toEqual([])
})

test('Beifang: an area that reads like a sentence gets a note on load, the filter stays as written', async () => {
  const n = normalizeFilter(': ohne Groß-/Kleinschreibung, Präfix zuerst) ist rein. Ein Klick daneben klappt')
  expect(n.note).toContain('sieht nach Satz statt Testnamen aus')
  expect(normalizeFilter('Cozy.Core.Tests;^Foo\\.Bar$').note).toBe('')
  const files: Record<string, string> = {
    '/p/.claude/unity.json': JSON.stringify({ tests: { areas: { '18. Darstellung': 'Präfix zuerst) ist rein. Ein Klick daneben', ok: 'Cozy.Ui' } } }),
  }
  const fs = { read: async (f: string) => files[f] ?? '', exists: async (f: string) => f in files }
  const { presets } = await loadProjectConfig('/p', fs)
  expect(presets.find(p => p.name === '18. Darstellung')?.note).toContain('Satz')
  expect(presets.find(p => p.name === 'ok')?.note).toBeUndefined()
})
