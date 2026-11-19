// Test helper shared by every mod (copy it with the kit): counts the design rules on a drawing.
//
//   const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
//   expect(kitRuleFindings(await ui.drawn())).toEqual([])
//
// It reads the tree a pane drew (plain data: `ui.drawn()`, or what a render hook returned) and reports each place that
// breaks a rule the kit cannot enforce by itself:
//   one-primary     a card holds more than one primary button
//   row-actions     a list row shows more than two actions (the fold button aside)
//   label-words     a button label has more than three words
//   no-variant      a button is neither primary, secondary nor plain text
//   check-label     a button label starts with a check mark (a check mark is a status)
//   card-in-card    a framed box sits inside a framed box
//   actions-last    a card's action row is not its last line
//   clipped         (with `cols`) a button label is wider than the body
// Cards are found by their frame, so mount a graphical surface (desktop) for the card rules; `clipped` is meant for a
// terminal drawing at 48 columns (the 320 px board).

export type KitRule =
  | 'one-primary'
  | 'row-actions'
  | 'label-words'
  | 'no-variant'
  | 'check-label'
  | 'card-in-card'
  | 'actions-last'
  | 'clipped'

export type KitRuleFinding = { rule: KitRule; at: string; detail: string }

export type KitRuleOptions = {
  /** Rules left out (a mod package that has not reached a view yet names what it still owes). */
  skip?: readonly KitRule[]
  /** Button keys (exact, or a RegExp) a rule does not apply to, e.g. tab strips with long names. */
  allow?: readonly (string | RegExp)[]
  /** Body width in cells: turns on `clipped`. */
  cols?: number
  /** Most words of a label (3). */
  maxWords?: number
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown }

/** Key suffix of the box `Actions` draws its buttons in; a list row's ends with `ROW_ACTIONS_SUFFIX`. */
export const ACTIONS_SUFFIX = ':actions'
export const ROW_ACTIONS_SUFFIX = ':row:actions'

const kidsOf = (n: Node): unknown[] => {
  const c = n.children ?? n.props?.children
  return Array.isArray(c) ? c.flat(8) : c === undefined || c === null || c === false ? [] : [c]
}
const isNode = (n: unknown): n is Node => !!n && typeof n === 'object'
const textOf = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : isNode(n) ? kidsOf(n).map(textOf).join('') : ''
const keyOf = (n: Node): string => (typeof n.props?.key === 'string' ? n.props.key : '')
const isCard = (n: Node): boolean => n.type === 'Box' && n.props?.borderStyle !== undefined
const isButton = (n: Node): boolean => n.type === 'Button'
/** What a button shows: its `label` (a desktop draws that), else its text. */
const labelOf = (n: Node): string => String(n.props?.label ?? textOf(n)).trim()

function walk(n: unknown, visit: (n: Node, parents: Node[]) => void, parents: Node[] = []): void {
  if (!isNode(n)) return
  visit(n, parents)
  const next = [...parents, n]
  for (const c of kidsOf(n)) walk(c, visit, next)
}

function all(n: unknown, pick: (n: Node) => boolean): Node[] {
  const out: Node[] = []
  walk(n, x => {
    if (pick(x)) out.push(x)
  })
  return out
}

/** The words of a label: marks in front (↑ ↓ ↗ ▶ ⚠, a fold arrow) and a count after it ("· 3", "(3)", " 3") do not count. */
export function labelWords(label: string): string[] {
  return label
    .replace(/[︎️]/g, '')
    .replace(/^[↑↓↗▶⚠‹›…+▸▾]+\s*/u, '')
    .replace(/\s*·\s*\S+$/u, '')
    .replace(/\s*\(\d+\)$/u, '')
    .replace(/\s+\d+$/u, '')
    .replace(/\s*›$/u, '')
    .split(/\s+/)
    .filter(Boolean)
}

/** Every place of the drawing that breaks a design rule; empty when it keeps them all. */
export function kitRuleFindings(tree: unknown, o: KitRuleOptions = {}): KitRuleFinding[] {
  const out: KitRuleFinding[] = []
  const skip = new Set(o.skip ?? [])
  const allowed = (key: string) => (o.allow ?? []).some(a => (typeof a === 'string' ? a === key : a.test(key)))
  const add = (rule: KitRule, at: string, detail: string) => {
    if (!skip.has(rule)) out.push({ rule, at, detail })
  }
  const maxWords = o.maxWords ?? 3
  walk(tree, (n, parents) => {
    const key = keyOf(n)
    if (isCard(n)) {
      const title = textOf(kidsOf(n)[0]).slice(0, 40)
      const at = key || title || 'card'
      if (parents.some(isCard)) add('card-in-card', at, 'a framed box inside a framed box')
      const primaries = all(n, x => isButton(x) && x.props?.variant === 'primary').filter(b => !allowed(keyOf(b)))
      if (primaries.length > 1)
        add('one-primary', at, `${primaries.length} primary buttons: ${primaries.map(labelOf).join(' | ')}`)
      const parts = kidsOf(n).filter(isNode)
      parts.forEach((part, i) => {
        const k = keyOf(part)
        if (k.endsWith(ACTIONS_SUFFIX) && !k.endsWith(ROW_ACTIONS_SUFFIX) && i !== parts.length - 1)
          add('actions-last', at, `the action row ${k} is line ${i + 1} of ${parts.length}`)
      })
    }
    if (n.type === 'Box' && key.endsWith(ROW_ACTIONS_SUFFIX)) {
      const acts = all(n, x => isButton(x) || x.type === 'Link').filter(
        b => !/-details$|-more$|-cancel$/.test(keyOf(b)) && !allowed(keyOf(b)),
      )
      if (acts.length > 2) add('row-actions', key, `${acts.length} actions: ${acts.map(labelOf).join(' | ')}`)
    }
    if (isButton(n) && !allowed(key)) {
      const label = labelOf(n)
      const at = key || label
      if (n.props?.variant === undefined && n.props?.plain !== true) add('no-variant', at, label)
      if (/^[✓✔]/u.test(label)) add('check-label', at, label)
      const words = labelWords(label)
      if (words.length > maxWords && !/\?$/.test(label)) add('label-words', at, `${words.length} words: ${label}`)
      if (o.cols !== undefined && [...label].length + 4 > o.cols)
        add('clipped', at, `${[...label].length + 4} cells in a body of ${o.cols}: ${label}`)
    }
  })
  return out
}

/** The findings as lines, for a readable test failure: `expect(kitRuleLines(tree)).toEqual([])`. */
export function kitRuleLines(tree: unknown, o: KitRuleOptions = {}): string[] {
  return kitRuleFindings(tree, o).map(f => `${f.rule} @ ${f.at}: ${f.detail}`)
}
