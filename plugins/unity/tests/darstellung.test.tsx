// Paket 2 der Befunde: Hell-Modus mit Kontrast, schmales Panel, feste Tab-Leiste, „Mehr“ als Untermenü.
import { expect, test } from 'claude-code/testing'

import { pillSvg } from '../lib/ui'
import { boxPaint, schemeColors, schemeSvg, themeTokens, windowTokens, type Tokens } from '../lib/theme'
import { findShown } from './shown'
import { fakeWorld, PANE, ROOT, settle } from './world'

const start = { cwd: ROOT, surface: 'terminal', isInteractive: false } as const

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** Every text/surface pair a pane draws: text on card, panel and well, buttons, active tab, links, tone pills. */
function pairs(t: Tokens): [string, string, string][] {
  const out: [string, string, string][] = []
  for (const fg of ['text', 'muted', 'faint', 'link', 'accentTintText'] as const)
    for (const bg of ['card', 'bg', 'well'] as const) out.push([`${fg}/${bg}`, t[fg], t[bg]])
  out.push(['onAccent/accent (primary button)', t.onAccent, t.accent])
  out.push(['accentTintText/accentTint (active tab, hover)', t.accentTintText, t.accentTint])
  for (const [k, v] of Object.entries(t.tones)) {
    out.push([`tone ${k} (pill)`, v.fg, v.bg])
    out.push([`tone ${k} on card`, v.fg, t.card])
  }
  return out
}

test('Kontrast: alle Token-Paare Text/Fläche der Unity-Marke lesen sich hell und dunkel mit 4.5:1 oder mehr', () => {
  for (const mode of ['light', 'dark'] as const) {
    const low = pairs(themeTokens('neutral', mode))
      .map(([name, fg, bg]) => ({ name, ratio: Math.round(contrast(fg, bg) * 100) / 100 }))
      .filter(p => p.ratio < 4.5)
    expect({ mode, low }).toEqual({ mode, low: [] })
  }
})

// The desktop window may be light while the engine's `theme` says dark: graphical surfaces follow the window.
const WINDOW = { light: ['#ffffff', '#faf9f5', '#f4f4f5'], dark: ['#1f1e1d', '#262624', '#18181b'] }

test('Fenster-Modus: jede Svg-Farbe liest sich auf hellem und dunklem Fenster und auf ihrer Pill mit 4.5:1', () => {
  const c = schemeColors('neutral')
  const low: string[] = []
  for (const mode of ['light', 'dark'] as const) {
    for (const key of ['text', 'inactive', 'claude', 'success', 'warning', 'error', 'suggestion'])
      for (const bg of WINDOW[mode]) if (contrast(c[key]![mode], bg) < 4.5) low.push(`${mode} ${key} on ${bg}`)
    for (const [tone, fg] of [
      ['ok', 'success'],
      ['warn', 'warning'],
      ['bad', 'error'],
      ['info', 'suggestion'],
      ['neutral', 'inactive'],
      ['accent', 'claude'],
    ] as const)
      if (contrast(c[fg]![mode], c[`tone-${tone}-bg`]![mode]) < 4.5) low.push(`${mode} pill ${tone}`)
  }
  expect(low).toEqual([])
  expect(schemeSvg('<svg><rect fill="tone-ok-bg"/></svg>')).toContain('@media (prefers-color-scheme: dark){')
})

test('Hell-Modus: Karten füllen sich auf dem Desktop nicht selbst, Text und Rahmen sind Theme-Keys', async ($, on) => {
  const t = windowTokens('neutral')
  expect([t.card, t.bg, t.well, t.accentTint].map(boxPaint)).toEqual([undefined, undefined, undefined, undefined])
  const world = fakeWorld(on)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  for (const tab of ['tab-overview', 'tab-tests', 'tab-review', 'tab-perf']) {
    await settle(world, ui.press({ key: tab }))
    const fills = (await ui.findAll({ type: 'Box' })).map(b => b.props.backgroundColor).filter(Boolean)
    expect({ tab, fills }).toEqual({ tab, fills: [] })
    const hex = (await ui.findAll({ type: 'Text' })).map(x => x.props.color).filter(c => /^#/.test(String(c ?? '')))
    expect({ tab, hex }).toEqual({ tab, hex: [] })
  }
  await ui.unmount()
})

async function tabKeys(ui: { findAll: (q: { type?: string }) => Promise<{ props: Record<string, unknown> }[]> }) {
  return (await ui.findAll({ type: 'Button' }))
    .map(b => String(b.props.key ?? b.props.id ?? ''))
    .filter(k => /^tab-/.test(k))
}

test('feste Tab-Leiste: breit alle sechs Tabs ohne „Mehr“, Reihenfolge bleibt bei Konsole-Fehler und Ziel', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'refresh' }))
  const all = ['tab-overview', 'tab-tests', 'tab-review', 'tab-perf', 'tab-console', 'tab-target']
  expect(await tabKeys(ui)).toEqual(all)
  await settle(world, ui.press({ key: 'settings' }))
  expect(await tabKeys(ui)).toEqual(all)
  await settle(world, ui.press({ key: 'tab-console' }))
  expect(await tabKeys(ui)).toEqual(all)
  await ui.unmount()
})

test('schmales Panel (~320 px): Leiste behält die Reihenfolge, „Mehr ▾“ bietet den Rest als Untermenü und schließt nach der Wahl', async ($, on) => {
  const world = fakeWorld(on)
  await $.session.start(start)
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    viewport: { columns: 40, rows: 30 },
    props: { ...PANE.props, bodyColumns: 40, scroll: { offset: 0, bodyRows: 30 } },
  })
  await settle(world, ui.press({ key: 'refresh' }))
  const strip = await tabKeys(ui)
  expect(strip).toContain('tab-more')
  expect(strip[0]).toBe('tab-overview')
  const more = await ui.find({ type: 'Button', key: 'tab-more' })
  expect(String(more?.props.label)).toMatch(/^Mehr ▾$/)
  await settle(world, ui.press({ key: 'tab-more' }))
  const open = await tabKeys(ui)
  // every tab reachable: strip + menu = all six
  for (const k of ['tab-overview', 'tab-tests', 'tab-review', 'tab-perf', 'tab-console', 'tab-target'])
    expect(open).toContain(k)
  expect(String((await ui.find({ type: 'Button', key: 'tab-more' }))?.props.label)).toMatch(/▴$/)
  await settle(world, ui.press({ key: 'tab-target' }))
  expect((await findShown(ui, /Worauf Claude arbeitet/))?.text).toBeDefined()
  const after = await tabKeys(ui)
  expect(after).toEqual(strip) // menu closed, strip unchanged: "Ziel" displaces nothing
  const moreAfter = await ui.find({ type: 'Button', key: 'tab-more' })
  expect(String(moreAfter?.props.label)).toBe('Mehr ▾')
  expect(moreAfter?.props.variant).toBe('primary')
  await ui.unmount()
})

test('schmales Panel: die Status-Pill im Kopf wird nie gekürzt', async ($, on) => {
  const world = fakeWorld(on, { bridge: false })
  await $.session.start(start)
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    viewport: { columns: 30, rows: 30 },
    props: { ...PANE.props, bodyColumns: 30, scroll: { offset: 0, bodyRows: 30 } },
  })
  await settle(world, ui.press({ key: 'refresh' }))
  const alts = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt ?? ''))
  expect(alts.some(a => /nicht verbunden$|antwortet nicht$/.test(a))).toBe(true)
  expect(alts.some(a => a.includes('…'))).toBe(false)
  await ui.unmount()
})

test('Pill „• Kommentar“: Breite reicht für den ganzen Text (Schätzung nicht zu knapp)', () => {
  // 11 Zeichen, davon 1 Großbuchstabe, Punkt und Leerzeichen schmal: mit pad 8 und 7.1 je Kleinbuchstabe ≥ 80 px.
  expect(pillSvg('• Kommentar', 'success', 'tone-ok-bg').width).toBeGreaterThanOrEqual(80)
  expect(pillSvg('• Kommentar', 'success', 'tone-ok-bg').source).toContain('text-anchor="middle"')
})
