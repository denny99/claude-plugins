// Band v2 (one line above the prompt). Same file in every plugin that carries the kit's launcher section.
import { expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import {
  BAND_VERSION,
  bandVersion,
  LAUNCH_ROW,
  LauncherChip,
  LauncherRow,
  launchKey,
  mergeLauncherRows,
} from '../lib/ui'

type Node = { type?: unknown; props?: Record<string, unknown>; hover?: unknown; children?: Node[] }
const walk = (n: Node | undefined, out: Node[] = []): Node[] => {
  if (!n || typeof n !== 'object') return out
  out.push(n)
  for (const c of n.children ?? []) walk(c, out)
  return out
}

// A kit as far as the launcher needs it.
const k = {
  Box: 'Box',
  Text: 'Text',
  Button: 'Button',
  graphical: true,
  brand: 'deltastone',
  cols: 80,
  t: { faint: 'inactive', tones: { ok: { fg: 'success' }, warn: { fg: 'warning' }, bad: { fg: 'error' }, info: { fg: 'suggestion' } } },
} as never
const fake$ = { ui: { resolve: () => ({ Box: 'Box' }) } } as never
const starter = (plugin: string, label: string, status?: string) => ({
  plugin,
  tree: LauncherRow(k, {
    plugin,
    chips: [LauncherChip(k, { key: `launch-${plugin}`, label, status, tone: status ? 'warn' : undefined, onPress: () => {} })],
  }) as RenderElement,
})
const usage = {
  plugin: 'ds-usage-line',
  tree: { type: 'Box', props: { key: launchKey('ds-usage-line'), justifyContent: 'flex-end' }, children: [] } as never,
}
// core's answer to next(e): one row alone is its tree, several a column
const next = async (e: { props: { rows: readonly { tree: RenderElement }[] } }) =>
  (e.props.rows.length === 1
    ? e.props.rows[0]!.tree
    : { type: 'Box', props: { flexDirection: 'column' }, children: e.props.rows.map(r => r.tree) }) as never

test('four starters and the usage row make one strip that never wraps', async () => {
  const rows = [
    starter('dnd-studio', 'D&D'),
    usage,
    starter('ds-solutions-flow', 'Solutions'),
    starter('ds-flutter', 'Flutter', 'Start fehlgeschlagen'),
    starter('ds-communication', 'Kommunikation'),
  ]
  const out = (await mergeLauncherRows(fake$, { props: { rows } } as never, next as never)) as Node
  expect(out.props?.key).toBe('launch-strip')
  expect(out.props?.flexWrap).toBe('nowrap')
  expect(walk(out).filter(n => n.props?.flexWrap === 'wrap')).toEqual([])
  // starters left in their order, the meters right
  expect(out.children?.map(c => c.props?.key)).toEqual([
    'launch:dnd-studio@2',
    'launch:ds-solutions-flow@2',
    'launch:ds-flutter@2',
    'launch:ds-communication@2',
    'launch:ds-usage-line@2',
  ])
  // the merger's box holds other plugins' rows: flex props only (the engine refuses minWidth/overflow there)
  expect(Object.keys(out.props ?? {}).sort()).toEqual(['alignItems', 'columnGap', 'flexDirection', 'flexWrap', 'key'])
  // every starter root shrinks and clips by itself; a status is cut with "…"
  for (const row of out.children?.slice(0, 4) ?? []) expect(row.props).toMatchObject(LAUNCH_ROW)
  const status = walk(out).find(n => n.children?.includes('Start fehlgeschlagen' as never))
  expect(status?.props?.wrap).toBe('truncate-end')
  // no hover in a starter changes its width: none reveals or restyles anything
  expect(walk(out).filter(n => n.hover !== undefined || n.props?.hover !== undefined)).toEqual([])
})

test('a row keyed for a newer band hands the merge on untouched; old rows count as version 1', async () => {
  const newer = { plugin: 'x', tree: { type: 'Box', props: { key: `launch:x@${BAND_VERSION + 1}` } } as never }
  const old = { plugin: 'y', tree: { type: 'Box', props: { key: 'launch:y' } } as never }
  expect(bandVersion(old)).toBe(1)
  expect(bandVersion(usage)).toBe(BAND_VERSION)
  const rows = [old, newer, usage]
  let handed: unknown
  await mergeLauncherRows(fake$, { props: { rows } } as never, (async (e: { props: { rows: unknown } }) => {
    handed = e.props.rows
    return null
  }) as never)
  expect(handed).toBe(rows)
})
