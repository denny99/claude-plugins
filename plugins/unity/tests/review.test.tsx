import { expect, test, type Engine } from 'claude-code/testing'
import { findShown } from './shown'

import {
  appendLines,
  isoLocal,
  parseAnswers,
  parseIdeas,
  parseQuestions,
  pngSize,
  reviewConfig,
  sectionItems,
  spotFacts,
  spotText,
  stamp,
  verdictOf,
} from '../features/review/data'
import { describeMarks, markedSvg } from '../features/review/viewer'
import { fakeWorld, PANE, ROOT, settle } from './world'

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const REVIEW = {
  questions: 'docs/fragen.json',
  answers: 'docs/antworten.jsonl',
  shots: 'docs/shots',
  ideas: 'vault/Ideen.md',
  running: ['.worktrees/*/STATUS*.txt'],
  queue: 'docs/queue.md',
}

const QUESTIONS = JSON.stringify({
  version: 1,
  items: [
    {
      id: 'reuse',
      kind: 'anschauen',
      title: 'Reuse am Fluss',
      text: 'Schwimmt sie richtig?',
      spot: { seed: 1, x: 2, z: 3, line: 'spot: seed=1 x=2 z=3' },
      options: ['passt', 'passt nicht'],
    },
    {
      id: 'fackel',
      kind: 'entscheiden',
      title: 'Welche Fackel-Farbe?',
      text: '',
      options: ['warmes Orange', 'gedämpftes Gelb'],
    },
    { id: 'bild-1', kind: 'bild', title: 'Neues Dach', text: 'Kanten sauber?', image: 'docs/dach.png' },
    { kind: 'anschauen', title: 'no id: skipped' },
  ],
})

const OLD_LINE =
  '{"id":"alt","verdict":"passt","choice":null,"comment":"","spot":null,"version":"1.0","commit":"x","time":"2026-11-13T20:12:16+01:00","screenshot":null}'

test('data: config, questions, answers, ideas, queue, spots, png size', async () => {
  expect(reviewConfig(JSON.stringify({ review: REVIEW }))?.answers).toBe('docs/antworten.jsonl')
  expect(reviewConfig('{"tests":{}}')).toBeUndefined()
  expect(reviewConfig('not json')).toBeUndefined()
  const qs = parseQuestions(QUESTIONS)
  expect(qs.map(q => q.id)).toEqual(['reuse', 'fackel', 'bild-1'])
  expect(qs[2]?.image).toBe('docs/dach.png')
  expect(parseAnswers(`${OLD_LINE}\n{torn\n`).map(a => a.id)).toEqual(['alt'])
  expect(appendLines(OLD_LINE, ['{"id":"neu"}'])).toBe(`${OLD_LINE}\n{"id":"neu"}\n`)
  expect(verdictOf('passt nicht', '')).toBe('passt-nicht')
  expect(verdictOf('passt', 'x')).toBe('passt')
  expect(verdictOf(undefined, 'hm')).toBe('kommentar')
  expect(isoLocal(Date.UTC(2026, 10, 13, 19, 12, 16), 60)).toBe('2026-11-13T20:12:16+01:00')
  expect(stamp(Date.UTC(2026, 10, 13, 19, 12, 16), 60)).toBe('20261113-201216')
  const ideas = parseIdeas('# Ideen\n\n### Bienen im Garten\nSie summen.\n\n### Floß\n')
  expect(ideas).toEqual([
    { id: 'idee:bienen-im-garten', title: 'Bienen im Garten', text: 'Sie summen.' },
    { id: 'idee:floss', title: 'Floß', text: '' },
  ])
  expect(sectionItems('## Done\n- a\n## Next\n- b\n1. c\n## Later\n- d')).toEqual(['b', 'c'])
  expect(spotText('spot: seed=123456789012345678')).toBe('{"line":"spot: seed=123456789012345678"}')
  expect(
    spotFacts({ x: 412.2, z: 1088, place: { name: 'Birkenwald' }, season: 'Autumn', weather: 'Rain', seed: 5 }),
  ).toEqual(['412 / 1088 · Birkenwald', 'Autumn · Rain', 'Seed 5'])
  expect(pngSize(PNG_1x1)).toEqual({ width: 1, height: 1 })
  const svg = markedSvg('data:x', { width: 100, height: 50 }, [
    {
      tool: 'arrow',
      color: 'red',
      pts: [
        [0, 0],
        [1, 1],
      ],
    },
  ])
  expect(svg).toContain('<polygon')
  expect(
    describeMarks([
      {
        tool: 'pen',
        color: 'blue',
        pts: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      },
    ])[0],
  ).toBe('1. Markierung blau im Bereich x 10%–30%, y 20%–40%')
})

function reviewWorld(on: Parameters<typeof fakeWorld>[0], withConfig = true) {
  const world = fakeWorld(on, {
    config: withConfig ? { review: REVIEW } : {},
    board: {
      sounds: [
        { id: 'fackel_an', name: 'Fackel zünden', group: 'Crafting', duration: 1.2, takes: 1 },
        { id: 'music:1', name: 'Ruhig · Abend · Ufer', group: 'Music', duration: 120, takes: 1 },
      ],
      mix: [
        { group: 'Master', db: 0 },
        { group: 'Ambience', db: -4 },
      ],
    },
  })
  world.files[`${ROOT}/docs/fragen.json`] = QUESTIONS
  world.files[`${ROOT}/docs/antworten.jsonl`] = `${OLD_LINE}\n`
  world.files[`${ROOT}/vault/Ideen.md`] = '### Bienen im Garten\nSie summen.\n'
  world.files[`${ROOT}/docs/queue.md`] = '## Next\n- Brunnen\n'
  world.files[`${ROOT}/docs/dach.png`] = atob(PNG_1x1)
  world.files[`${ROOT}/.git/HEAD`] = 'ref: refs/heads/main\n'
  world.files[`${ROOT}/.git/refs/heads/main`] = 'abcdef1234567890\n'
  return world
}

async function openReview($: Engine, world: ReturnType<typeof fakeWorld>) {
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
}

test('review list: renders on desktop and terminal; an answer is appended with screenshot and spot', async ($, on) => {
  const world = reviewWorld(on)
  world.bridge.isPlaying = true
  await openReview($, world)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await settle(world, ui.press({ key: 'tab-review' }))
    expect((await findShown(ui, /Reuse am Fluss/))?.text).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'rv-goto-reuse' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'rv-tab-decide' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Befund 64/65: one "Antworten" (the comment field's), the screenshot switch reads as a checkbox.
  expect(await ui.find({ type: 'Button', key: 'rv-answer-reuse' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'rv-shot-reuse' }))?.props.label).toMatch(
    /^[☑☐] Screenshot mitschicken$/,
  )
  await settle(world, ui.press({ key: 'rv-goto-reuse' }))
  const gotoCmd = Object.entries(world.files).find(([p, t]) => /cmd-.*\.json$/.test(p) && t.includes('"goto"'))
  expect(gotoCmd?.[1]).toContain('spot: seed=1 x=2 z=3')
  await settle(world, ui.press({ key: 'rv-choice-reuse-1' }))
  const log = world.files[`${ROOT}/docs/antworten.jsonl`] ?? ''
  const lines = log.trim().split('\n')
  expect(lines[0]).toBe(OLD_LINE)
  const a = JSON.parse(lines[1] ?? '{}') as Record<string, unknown>
  expect(a.id).toBe('reuse')
  expect(a.verdict).toBe('passt-nicht')
  expect(a.commit).toBe('abcdef123456')
  expect(String(a.screenshot)).toMatch(/^docs\/shots\/reuse-\d{8}-\d{6}\.png$/)
  expect(a.spot).toEqual({ pos: [4, 5, 6], weather: 'rain' })
  expect(Object.keys(a)).toEqual([
    'id',
    'verdict',
    'choice',
    'comment',
    'spot',
    'version',
    'commit',
    'time',
    'screenshot',
  ])
  // Decide: the choice is kept as the option text.
  await settle(world, ui.press({ key: 'rv-tab-decide' }))
  await settle(world, ui.press({ key: 'rv-choice-fackel-0' }))
  const last = JSON.parse((world.files[`${ROOT}/docs/antworten.jsonl`] ?? '').trim().split('\n').pop() ?? '{}')
  expect(last).toMatchObject({ id: 'fackel', verdict: 'kommentar', choice: 'warmes Orange' })
  await ui.unmount()
})

test('review without config: setup hint; Laufend reads status globs and the queue', async ($, on) => {
  const world = reviewWorld(on, false)
  await openReview($, world)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(world, ui.press({ key: 'tab-review' }))
  expect((await findShown(ui, /Review ist nicht eingerichtet/))?.text).toBeDefined()
  await ui.unmount()
})

test('sounds: list, play near, mix nudge through mix_set, verdict appended as ton:<id>, music folded', async ($, on) => {
  const world = reviewWorld(on)
  await openReview($, world)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  await settle(world, ui.press({ key: 'rv-tab-sounds' }))
  await settle(world, ui.press({ key: 'rv-snd-load' }))
  expect((await findShown(ui, /Fackel zünden/))?.text).toBeDefined()
  expect(await findShown(ui, /Ruhig · Abend · Ufer/)).toBeUndefined()
  await settle(world, ui.press({ key: 'rv-play-fackel_an' }))
  const playCmd = Object.values(world.files).find(t => t.includes('"sound_play"'))
  expect(playCmd).toContain('"near"')
  await settle(world, ui.press({ key: 'rv-mix-Ambience-down' }))
  const mixCmd = Object.values(world.files).find(t => t.includes('"mix_set"'))
  expect(JSON.parse(mixCmd ?? '{}')).toMatchObject({ group: 'Ambience', db: -7 })
  expect((await findShown(ui, /−7 dB/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'rv-ok-fackel_an' }))
  const last = JSON.parse((world.files[`${ROOT}/docs/antworten.jsonl`] ?? '').trim().split('\n').pop() ?? '{}')
  expect(last).toMatchObject({ id: 'ton:fackel_an', verdict: 'passt', choice: 'fackel_an' })
  await settle(world, ui.press({ key: 'rv-music-toggle' }))
  expect((await findShown(ui, /Ruhig · Abend · Ufer/))?.text).toBeDefined()
  await ui.unmount()
})

test('sounds after an error: "Nochmal holen", Aktualisieren and the bridge coming back each load the board again', async ($, on) => {
  const world = reviewWorld(on)
  await openReview($, world)
  world.bridge.up = false
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  await settle(world, ui.press({ key: 'rv-tab-sounds' }))
  await ui.press({ key: 'rv-snd-load' })
  await world.clock.advance(100)
  expect((await findShown(ui, 'Soundboard nicht erreichbar'))?.text).toBeDefined()
  expect((await findShown(ui, /nicht mit dem Unity-Editor verbunden/))?.text).toBeDefined()
  world.bridge.up = true
  await ui.press({ key: 'rv-snd-retry' })
  await world.clock.advance(100)
  expect((await findShown(ui, /Fackel zünden/))?.text).toBeDefined()
  expect(await findShown(ui, 'Soundboard nicht erreichbar')).toBeUndefined()

  world.bridge.up = false
  await ui.press({ key: 'refresh' })
  await world.clock.advance(100)
  expect((await findShown(ui, 'Soundboard nicht erreichbar'))?.text).toBeDefined()
  world.bridge.up = true
  await world.clock.advance(5200) // the automatic re-fetch
  expect(await findShown(ui, 'Soundboard nicht erreichbar')).toBeUndefined()
  expect((await findShown(ui, /Fackel zünden/))?.text).toBeDefined()
  await ui.unmount()
})

test('viewer: unity_review_show draws the frame as Svg with a paint Client; a stroke becomes a mark; feedback returns the image', async ($, on) => {
  const world = reviewWorld(on)
  await openReview($, world)
  world.files[`${ROOT}/art/n1.png`] = atob(PNG_1x1)
  world.files[`${ROOT}/art/n2.png`] = atob(PNG_1x1)
  const shown = (await settle(
    world,
    $.tool.call({
      tool: 'mcp__unity__unity_review_show',
      title: 'Fuchs · Laufen',
      question: 'Sauber in allen Richtungen?',
      groups: [
        { label: 'N', frames: ['art/n1.png', 'art/n2.png'] },
        { label: 'O', frames: ['art/n1.png'] },
      ],
    } as never),
  )) as { result?: unknown }
  expect(String(shown.result)).toContain('2 view(s), 3 frame(s)')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect((await findShown(ui, /Claude fragt: „Sauber in allen Richtungen\?“/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'rv-next' }))
  expect((await findShown(ui, /N · Bild 2\/2/))?.text).toBeDefined()
  await ui.post(
    {
      type: 'mark',
      pts: [
        [0.1, 0.1],
        [0.5, 0.5],
      ],
    },
    { in: 'rv-paint' },
  )
  expect((await findShown(ui, /1 Markierung/))?.text).toBeDefined()
  // The real surface module: a drag over its region posts a stroke.
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'rv-paint' } as never)
  await ui.pointer({ type: 'move', x: 3, y: 1, button: 'left', in: 'rv-paint' } as never)
  await ui.pointer({ type: 'up', x: 3, y: 1, button: 'left', in: 'rv-paint' } as never)
  await settle(world, Promise.resolve())
  expect((await findShown(ui, /2 Markierungen/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'rv-view-send' }))
  expect(world.prompts.at(-1)).toContain('Markierung rot')
  expect(world.prompts.at(-1)).toContain('Bild mit Markierungen holen mit unity_review_feedback')
  await ui.unmount()
  const fb = (await settle(world, $.tool.call({ tool: 'mcp__unity__unity_review_feedback' }))) as { result?: unknown }
  const blocks = fb.result as { type: string }[]
  expect(blocks.map(b => b.type)).toEqual(['text', 'image'])
  expect(Object.keys(world.files).some(p => /\.claude\/unity-review\/marks-\d{8}-\d{6}\.svg$/.test(p))).toBe(true)
  // Terminal: no Svg, the file path instead.
  await settle(
    world,
    $.tool.call({
      tool: 'mcp__unity__unity_review_show',
      title: 'Dach',
      groups: [{ label: 'Vorne', frames: ['art/n1.png'] }],
    } as never),
  )
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(world, term.press({ key: 'tab-review' }))
  expect((await findShown(term, /Bild in Datei \/g\/art\/n1\.png/))?.text).toBeDefined()
  await term.unmount()
})

test('Problem melden: capture + spot, kind and note, "Nur merken" lists it, sending later prompts Claude', async ($, on) => {
  const world = reviewWorld(on)
  world.bridge.isPlaying = true
  await openReview($, world)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  await settle(world, ui.press({ key: 'rv-report-open' }))
  expect((await findShown(ui, /Problem melden/))?.text).toBeDefined()
  const shots = Object.keys(world.files).filter(p =>
    /\.claude\/unity-review\/report-\d{8}-\d{6}(-klein)?\.png$/.test(p),
  )
  // one picture per report in the reports folder; the pane's small copy sits in the bridge's temp shots
  expect(shots).toHaveLength(1)
  await settle(world, ui.press({ key: 'rv-kind-sieht-falsch-aus' }))
  await settle(world, ui.input({ key: 'rv-report-note', text: 'Baum schwebt', kind: 'change' } as never))
  await settle(world, ui.press({ key: 'rv-report-keep' }))
  const saved = world.files[`${ROOT}/.claude/unity-review/reports.jsonl`] ?? ''
  expect(JSON.parse(saved.trim())).toMatchObject({ kind: 'Sieht falsch aus', note: 'Baum schwebt', sent: false })
  expect((await findShown(ui, /Sieht falsch aus: Baum schwebt/))?.text).toBeDefined()
  const id = (JSON.parse(saved.trim()) as { id: string }).id
  // kit „ask Claude“: an impatient double press sends once (the second only toasts); a sent report loses its button
  const before = world.prompts.length
  await settle(world, Promise.all([ui.press({ key: `rv-rep-send-${id}` }), ui.press({ key: `rv-rep-send-${id}` })]))
  expect(world.prompts).toHaveLength(before + 1)
  expect(world.toasts).toContain('Schon an Claude geschickt – kommt mit der Antwort darauf.')
  expect(world.prompts.at(-1)).toContain('Problem gemeldet im Unity-Spiel: Sieht falsch aus.')
  expect(world.prompts.at(-1)).toContain('Notiz: Baum schwebt')
  expect(JSON.parse((world.files[`${ROOT}/.claude/unity-review/reports.jsonl`] ?? '').trim()).sent).toBe(true)
  await ui.unmount()
})

test('Problem melden from Übersicht switches to Review; measuring runs detached, the card shows it, then sends', async ($, on) => {
  const world = reviewWorld(on)
  world.bridge.isPlaying = true
  await openReview($, world)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'report' }))
  expect((await ui.find({ type: 'Button', key: 'tab-review' }))?.props.variant).toBe('primary')
  expect((await findShown(ui, /Problem melden/))?.text).toBeDefined()
  await settle(world, ui.press({ key: 'rv-kind-ruckelt' }))
  // The button's hook returns before the 10 s recording ends.
  await ui.press({ key: 'rv-report-send' })
  expect((await findShown(ui, /Messe 10 s Leistung/))?.text).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'rv-report-send' })).toBeUndefined()
  const before = world.prompts.length
  for (let i = 0; i < 120 && world.prompts.length === before; i++) await world.clock.advance(250)
  expect(world.prompts.at(-1)).toContain('Problem gemeldet im Unity-Spiel: Ruckelt.')
  expect(world.prompts.at(-1)).toContain('Leistung: 10 s, 3 Bilder')
  await ui.unmount()
})

test('schmales Panel: Entscheidungs-Optionen ganz lesbar, keine „Entscheiden“-Pill, alle Unter-Tabs erreichbar', async ($, on) => {
  const world = reviewWorld(on)
  await openReview($, world)
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    viewport: { columns: 40, rows: 30 },
    props: { ...PANE.props, bodyColumns: 40, scroll: { offset: 0, bodyRows: 30 } },
  })
  if (!(await ui.find({ type: 'Button', key: 'tab-review' }))) await settle(world, ui.press({ key: 'tab-more' }))
  await settle(world, ui.press({ key: 'tab-review' }))
  const subs = async () =>
    (await ui.findAll({ type: 'Button' })).map(b => String(b.props.key ?? '')).filter(k => /^rv-tab-/.test(k))
  if ((await subs()).includes('rv-tab-more')) await settle(world, ui.press({ key: 'rv-tab-more' }))
  for (const k of [
    'rv-tab-look',
    'rv-tab-decide',
    'rv-tab-pictures',
    'rv-tab-sounds',
    'rv-tab-ideas',
    'rv-tab-running',
  ])
    expect(await subs()).toContain(k)
  await settle(world, ui.press({ key: 'rv-tab-decide' }))
  expect((await subs()).includes('rv-tab-look')).toBe(true) // menu closed again, strip keeps its order
  // the option is a wrapping text above a short button; the button carries no option text (runde 2, Befund 4)
  expect((await findShown(ui, 'A: warmes Orange'))?.text).toBeDefined()
  const a = await ui.find({ type: 'Button', key: 'rv-choice-fackel-0' })
  expect(a?.props.label).toBe('A wählen')
  const alts = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt ?? ''))
  expect(alts.includes('Entscheiden')).toBe(false)
  await ui.unmount()
})
