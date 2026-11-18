// Test helper: what a drawing shows as text, a graphical pill included (a pill is an Svg image there; its text is the
// Svg's `alt`).
type Found = { type: string; text: string; props: Record<string, unknown> }
type Ui = { findAll: (q: { type?: string }) => Promise<Found[]> }

/** Every Text's text and every Svg's `alt`, in document order per kind. */
export async function shownTexts(ui: Ui): Promise<string[]> {
  const texts = (await ui.findAll({ type: 'Text' })).map(x => x.text)
  const alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt ?? ''))
  return [...texts, ...alts]
}

/**
 * The first shown text equal to `text` (a pill's mark before it allowed: "■ gestoppt") or matching the RegExp, as
 * `{ text }`, like `ui.find({ type: 'Text', text })`.
 */
export async function findShown(ui: Ui, text: string | RegExp): Promise<{ text: string } | undefined> {
  const hit = (await shownTexts(ui)).find(t =>
    typeof text === 'string' ? t === text || t.endsWith(` ${text}`) : text.test(t),
  )
  return hit === undefined ? undefined : { text: hit }
}

/**
 * Pages a paged kit strip (Tabs: „‹“ back, „+N“ on) until the button `key` is drawn; does nothing when it already is.
 * `prefix` is the strip's key prefix ('tab-' for the pane tabs, 'rv-tab-' for the review sub tabs).
 */
export async function reveal(
  ui: {
    find: (q: { type?: string; key?: string }) => Promise<unknown>
    press: (q: { key: string }) => Promise<unknown>
  },
  key: string,
  prefix = 'tab-',
): Promise<void> {
  const has = async (k: string) => !!(await ui.find({ type: 'Button', key: k }))
  for (let i = 0; i < 10 && !(await has(key)) && (await has(`${prefix}prev`)); i++)
    await ui.press({ key: `${prefix}prev` })
  for (let i = 0; i < 10 && !(await has(key)) && (await has(`${prefix}more`)); i++)
    await ui.press({ key: `${prefix}more` })
}
