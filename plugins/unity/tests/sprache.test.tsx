// Paket 3 der Befunde: Panel, Toasts, Slash-Echo und Prompts an Claude auf Deutsch; Projektname; Ortszeit.
import { expect, test } from 'claude-code/testing'

import { clockTime, FIX_ASK, fixPrompt, localDateTime, localDay, localStamp } from '../features/pane/common'
import { noCostsText, perfPrompt } from '../features/pane/perf'
import { marksLine } from '../features/review/viewer'
import { affectedText } from '../lib/affected'
import { playError } from '../lib/play'
import { batchAllowed } from '../lib/unity'
import { findShown } from './shown'
import { fakeWorld, PANE, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const

test('/unity answers in German', async ($, on) => {
  fakeWorld(on)
  await $.session.start(start)
  const res = (await $.command.run({ command: 'unity', args: '' } as never)) as { text?: string }
  expect(res.text).toBe('Unity-Panel geöffnet.')
})

test('no editor: the step names the checkout and the project folder, the header the checkout', async ($, on) => {
  const world = fakeWorld(on, { bridge: false })
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  expect((await findShown(ui, /^Projekt g\/unity im Unity-Editor öffnen$/))?.text).toBeDefined()
  expect(await findShown(ui, /mit unity öffnen/)).toBeUndefined()
  await ui.unmount()
})

test('prompts to Claude are German', () => {
  expect(fixPrompt(FIX_ASK.compile, 'CS0103 x')).toBe('Behebe diesen Unity-Kompilierfehler:\n\nCS0103 x')
  expect(fixPrompt(FIX_ASK.test, 'A.B')).toMatch(/^Repariere diesen fehlschlagenden Unity-Test:/)
  const perf = {
    seconds: 10, frames: 600, budgetMs: 16.6, avgMs: 10, p50: 9, p95: 20, p99: 30, worst: 40, hitches: 2,
    seriesStep: 1, series: [], costs: [],
  }
  const text = perfPrompt(Date.UTC(2026, 10, 18, 13, 5), { ...perf, sources: 1 } as never)
  expect(text).toMatch(/^Analysiere diese Frame-Zeit-Messung aus Unity/)
  expect(text).toContain('Finde die wahrscheinliche Ursache im Code')
  expect(text).toContain('Die Kostenquelle lieferte keine Werte.')
  expect(text).not.toContain('IClaudePerfSource')
  expect(noCostsText({ sources: 0 })).toBe('Das Projekt hat keine Kostenquelle registriert.')
  expect(noCostsText({})).not.toContain('IClaude')
  expect(marksLine(0, true)).toBe('Markierungen: keine')
  expect(marksLine(2, true)).toBe('Bild mit Markierungen holen mit unity_review_feedback')
})

test('panel sentences without English or inner terms', () => {
  const t = affectedText({ areas: [], uncovered: ['unity/Packages/packages-lock.json'], ignored: [] } as never)
  expect(t).toBe(
    '1 geänderte Datei gehört zu keinem Test-Bereich: unity/Packages/packages-lock.json — zur Sicherheit alle Tests laufen lassen.',
  )
  expect(batchAllowed({ lock: 'free', bridgeUp: true }).reason).not.toMatch(/bridge/i)
  const old = playError({ error: 'unknown command: perf_record' }, 'Frame-Zeiten messen')
  expect(old.error).toMatch(/^Das Unity-Paket Claude Bridge im Projekt kann Frame-Zeiten messen noch nicht\./)
  expect(old.error).toContain('Unity → Package Manager → Claude Bridge → Update')
})

test('times for people are local', () => {
  const at = new Date(2026, 10, 8, 7, 5).getTime()
  expect(clockTime(at)).toBe('07:05')
  expect(localDay(at)).toBe('08.11.2026')
  expect(localDateTime(at)).toBe('08.11.2026 07:05')
  expect(localStamp(at)).toBe('202611080705')
})
