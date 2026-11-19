// Design rules (kit-rules.ts) on the Review tab: frame, question cards, Klänge, Ideen, Laufend, the picture viewer.
import { expect, test, type Engine } from 'claude-code/testing'

import { kitRuleLines } from './kit-rules'
import { findShown, reveal } from './shown'
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
    { id: 'reuse', kind: 'anschauen', title: 'Reuse am Fluss', text: 'Schwimmt sie richtig?', spot: { line: 'spot: seed=1 x=2 z=3' } },
    { id: 'steg', kind: 'anschauen', title: 'Steg am Ufer', text: 'Hoch genug?' },
    { id: 'alt', kind: 'anschauen', title: 'Alte Frage', text: '' },
    {
      id: 'fackel',
      kind: 'entscheiden',
      title: 'Welche Fackel-Farbe?',
      text: 'Für die Höhle.',
      options: ['Fackel an der Wand lassen, aber wärmer und etwas heller machen', 'warmes Orange', 'gedämpftes Gelb', 'so lassen'],
    },
    { id: 'bild-1', kind: 'bild', title: 'Neues Dach', text: 'Kanten sauber?', image: 'docs/dach.png' },
  ],
})
const OLD_LINE =
  '{"id":"alt","verdict":"passt","choice":null,"comment":"","spot":null,"version":"1.0","commit":"x","time":"2026-11-13T20:12:16+01:00","screenshot":null}'

function reviewWorld(on: Parameters<typeof fakeWorld>[0], withConfig = true) {
  const world = fakeWorld(on, {
    config: withConfig ? { review: REVIEW } : {},
    board: {
      sounds: [
        { id: 'fackel_an', name: 'Fackel zünden', group: 'Crafting', duration: 1.2, takes: 1 },
        { id: 'tropfen', name: 'Tropfen', group: 'Ambience', duration: 0.4, takes: 3 },
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
  world.files[`${ROOT}/vault/Ideen.md`] = '### Bienen im Garten\nSie summen.\n### Brücke\nAus Holz.\n'
  world.files[`${ROOT}/docs/queue.md`] = '## Next\n- Brunnen\n'
  world.files[`${ROOT}/docs/dach.png`] = atob(PNG_1x1)
  return world
}

async function mountReview($: Engine, world: ReturnType<typeof fakeWorld>) {
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: false })
  await settle(world, $.command.run({ command: 'unity', args: '' } as never))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(world, ui.press({ key: 'tab-review' }))
  const sub = async (id: string) => {
    await reveal(ui, `rv-tab-${id}`, 'rv-tab-')
    await settle(world, ui.press({ key: `rv-tab-${id}` }))
  }
  const clean = async () => expect(kitRuleLines(await ui.drawn())).toEqual([])
  return { ui, sub, clean }
}

test('Review frame and question cards: Offen / Erledigt as cards, one action row per card, no rule broken', async ($, on) => {
  const world = reviewWorld(on)
  const { ui, sub, clean } = await mountReview($, world)
  // Anschauen: the unfolded question, the list „Offen“ (two open), „Erledigt“ (one)
  await clean()
  expect((await findShown(ui, 'Offen'))?.text).toBeDefined()
  expect((await findShown(ui, 'Erledigt'))?.text).toBeDefined()
  expect((await findShown(ui, '1 von 2'))?.text).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'rv-open-steg' }))?.props.label).toBe('Details')
  expect((await ui.find({ type: 'Button', key: 'rv-report-open' }))?.props.label).toBe('Problem melden')
  await settle(world, ui.press({ key: 'rv-open-steg' }))
  expect((await findShown(ui, '2 von 2'))?.text).toBeDefined()
  await clean()
  // Entscheiden: options as rows, one main action
  await sub('decide')
  await clean()
  await settle(world, ui.press({ key: 'rv-choice-fackel-2' }))
  expect((await findShown(ui, /C gewählt/))?.text).toBeDefined()
  await clean()
  await sub('pictures')
  expect((await ui.find({ type: 'Button', key: 'rv-img-bild-1' }))?.props.label).toBe('Bild ansehen')
  await clean()
  // the picture viewer of a list picture: two verdicts of equal rank, no primary
  await settle(world, ui.press({ key: 'rv-img-bild-1' }))
  expect((await ui.find({ type: 'Button', key: 'rv-view-ok' }))?.props).toMatchObject({ label: 'Passt', variant: 'secondary' })
  expect((await ui.find({ type: 'Button', key: 'rv-view-send' }))?.props).toMatchObject({ label: 'Passt nicht', variant: 'secondary' })
  await clean()
  await settle(world, ui.press({ key: 'rv-view-close' }))
  await sub('ideas')
  await clean()
  await settle(world, ui.press({ key: 'rv-idea-open-idee:bienen-im-garten' }))
  await clean()
  await sub('running')
  await clean()
  await ui.unmount()
})

test('Review Klänge: mode as a switch, two actions per sound row, „Nochmal“ behind Details; no rule broken', async ($, on) => {
  const world = reviewWorld(on)
  const { ui, sub, clean } = await mountReview($, world)
  await sub('sounds')
  expect((await ui.find({ type: 'Button', key: 'rv-snd-load' }))?.props.label).toBe('Neu laden')
  await clean()
  await settle(world, ui.press({ key: 'rv-snd-load' }))
  await clean()
  expect((await ui.find({ type: 'Button', key: 'rv-snd-stop' }))?.props.label).toBe('Stoppen')
  expect((await ui.find({ type: 'Button', key: 'rv-ok-fackel_an' }))?.props.label).toBe('Passt')
  expect(await ui.find({ type: 'Button', key: 'rv-no-fackel_an' })).toBeUndefined()
  await settle(world, ui.press({ key: 'rv-mode-flat' }))
  await settle(world, ui.press({ key: 'rv-play-fackel_an' }))
  expect(Object.values(world.files).find(t => t.includes('"sound_play"'))).toContain('"flat"')
  // the note with „Nochmal machen“ waits behind the row's Details
  await settle(world, ui.press({ key: 'rv-snd-fackel_an-details' }))
  expect(await ui.find({ key: 'rv-note-ton-fackel_an' } as never)).toBeDefined()
  await clean()
  await settle(world, ui.input({ key: 'rv-note-ton-fackel_an', text: 'zu dumpf', kind: 'submit' } as never))
  const last = JSON.parse((world.files[`${ROOT}/docs/antworten.jsonl`] ?? '').trim().split('\n').pop() ?? '{}')
  expect(last).toMatchObject({ id: 'ton:fackel_an', verdict: 'passt-nicht', comment: 'zu dumpf' })
  // the next group with new sounds unfolds by itself; a group folds and unfolds through its row's Details
  expect(await ui.find({ type: 'Button', key: 'rv-play-tropfen' })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'rv-sgrp-1-details' }))?.props.label).toBe('Schließen')
  await settle(world, ui.press({ key: 'rv-sgrp-1-details' }))
  expect(await ui.find({ type: 'Button', key: 'rv-play-tropfen' })).toBeUndefined()
  await clean()
  await settle(world, ui.press({ key: 'rv-sgrp-0-details' }))
  expect((await findShown(ui, 'Nochmal'))?.text).toBeDefined() // the rated sound's pill
  // the music unfolds through the card's text action
  await settle(world, ui.press({ key: 'rv-music-toggle' }))
  expect((await ui.find({ type: 'Button', key: 'rv-music-toggle' }))?.props.label).toBe('Schließen')
  await clean()
  await ui.unmount()
})

test('Review without a review block: one sentence and one action; a failed board: the error in the card', async ($, on) => {
  const world = reviewWorld(on, false)
  const { ui, sub, clean } = await mountReview($, world)
  expect((await findShown(ui, /Review ist nicht eingerichtet/))?.text).toBeDefined()
  expect(await findShown(ui, /questions|answers|shots/)).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'rv-setup-draft' }))?.props.label).toBe('Entwurf erstellen')
  await clean()
  world.bridge.up = false
  await sub('sounds')
  await ui.press({ key: 'rv-snd-load' })
  await world.clock.advance(100)
  expect((await findShown(ui, 'Soundboard nicht erreichbar'))?.text).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'rv-snd-retry' }))?.props.label).toBe('Neu laden')
  await clean()
  await ui.unmount()
})
