import { expect, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { Header, type Kit } from '../lib/ui'

const COLS = 40

/** Renders the kit Header alone in a test Pane at COLS body columns; returns every Text line. */
async function headerLines($: Engine, on: On, title: string, context: string): Promise<string[]> {
  on('ui.render', { component: 'Pane', requestId: 'hdr' }, async (x, e) => {
    const els = x.ui.resolve(e) as unknown as Pick<Kit, 'Box' | 'Text' | 'Button'>
    const k = { ...els, cols: COLS, rows: 10, compact: false, surface: 'desktop' } as unknown as Kit
    return Header(k, { title, context })
  })
  const ui = await $.ui.mount({
    plugin: 'unity',
    component: 'Pane',
    requestId: 'hdr',
    surface: 'desktop',
    viewport: { columns: COLS, rows: 10 },
    props: {
      title: 'HDR',
      isFocused: false,
      bodyColumns: COLS,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  } as never)
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  return texts.flatMap(t => t.text.split('\n'))
}

test('Header: a title longer than the width drops the context and stays inside the width', async ($, on) => {
  const lines = await headerLines($, on, `Unity ${'project-with-a-very-long-name-'.repeat(3)}`, 'Unity 6000.6.7f1')
  for (const line of lines) expect([...line].length).toBeLessThanOrEqual(COLS)
  expect(lines.join(' ')).not.toContain('6000')
})

test('Header: a title leaving under 4 columns drops the context', async ($, on) => {
  const lines = await headerLines($, on, 'T'.repeat(COLS - 5), 'context')
  for (const line of lines) expect([...line].length).toBeLessThanOrEqual(COLS)
  expect(lines.join(' ')).not.toContain('co')
})

test('Header: a short title keeps its context', async ($, on) => {
  const lines = await headerLines($, on, 'Unity', 'Unity 6000.6.7f1')
  for (const line of lines) expect([...line].length).toBeLessThanOrEqual(COLS)
  expect(lines.join(' ')).toContain('6000.6.7f1')
})
