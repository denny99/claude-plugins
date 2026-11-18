// Band v3 (two fixed lines above the prompt). Same file in every plugin that carries the kit's launcher section.
import { expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import {
  BAND_VERSION,
  bandVersion,
  fitStarters,
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
const fake$ = { ui: { resolve: () => ({ Box: 'Box', Text: 'Text' }) } } as never
const starter = (plugin: string, label: string, status?: string) => ({
  plugin,
  tree: LauncherRow(k, {
    plugin,
    chips: [LauncherChip(k, { key: `launch-${plugin}`, label, status, tone: status ? 'warn' : undefined, onPress: () => {} })],
  }) as RenderElement,
})
const meterLine = { type: 'Box', props: { key: launchKey('ds-usage-line'), justifyContent: 'flex-end' }, children: [] }
const usage = { plugin: 'ds-usage-line', tree: meterLine as never }
// core's answer to next(e): one row alone is its tree, several a column
const next = async (e: { props: { rows: readonly { tree: RenderElement }[] } }) =>
  (e.props.rows.length === 1
    ? e.props.rows[0]!.tree
    : { type: 'Box', props: { flexDirection: 'column' }, children: e.props.rows.map(r => r.tree) }) as never
const merge = async (rows: unknown[], bodyColumns = 120) =>
  (await mergeLauncherRows(fake$, { surface: 'desktop', props: { rows, bodyColumns } } as never, next as never)) as Node

test('four starters with status and the usage row make exactly two lines, none wraps', async () => {
  const out = await merge([
    starter('dnd-studio', 'D&D', 'Tisch läuft · Runde 2'),
    usage,
    starter('ds-solutions-flow', 'Solutions', '2 Fehler'),
    starter('ds-flutter', 'Flutter', 'Gerät fehlt'),
    starter('ds-communication', 'Kommunikation', 'Call 15:30'),
  ])
  expect(out.props?.key).toBe('launch-band')
  expect(out.props?.flexDirection).toBe('column')
  const [line1, rule, line2, ...rest] = out.children ?? []
  expect(rest).toEqual([])
  expect(line1?.props?.key).toBe('launch-strip')
  expect(line1?.props?.flexWrap).toBe('nowrap')
  expect(rule?.props?.key).toBe('launch-rule')
  expect(line2).toBe(meterLine)
  expect(walk(out).filter(n => n.props?.flexWrap === 'wrap' || n.props?.wrap === 'wrap')).toEqual([])
  // starters in their order on line 1
  expect(line1?.children?.map(c => c.props?.key)).toEqual([
    `launch:dnd-studio@${BAND_VERSION}`,
    `launch:ds-solutions-flow@${BAND_VERSION}`,
    `launch:ds-flutter@${BAND_VERSION}`,
    `launch:ds-communication@${BAND_VERSION}`,
  ])
  // the merger's boxes hold other plugins' rows: flex props only (the engine refuses minWidth/overflow there)
  expect(Object.keys(line1?.props ?? {}).sort()).toEqual(['alignItems', 'columnGap', 'flexDirection', 'flexWrap', 'key'])
  expect(Object.keys(out.props ?? {}).sort()).toEqual(['flexDirection', 'key'])
  // every starter root shrinks and clips by itself; a status is cut with "…"
  for (const row of line1?.children ?? []) expect(row.props).toMatchObject(LAUNCH_ROW)
  const status = walk(out).find(n => n.children?.includes('· Gerät fehlt' as never))
  expect(status?.props?.wrap).toBe('truncate-end')
  // no hover in a starter changes its width
  expect(walk(line1).filter(n => n.hover !== undefined || n.props?.hover !== undefined)).toEqual([])
})

test('a long status does not change line 2; what does not fit moves into "+N"', async () => {
  const short = await merge([starter('ds-flutter', 'Flutter', 'ok'), starter('ds-ct', 'CT'), usage])
  const long = await merge([
    starter('ds-flutter', 'Flutter', 'Gerät fehlt, Emulator startet nicht, bitte Android Studio prüfen und neu starten'),
    starter('ds-ct', 'CT'),
    usage,
  ])
  expect(long.children?.[2]).toBe(short.children?.[2])
  expect(long.children?.[2]).toBe(meterLine)
  // narrow: statuses cut first; then the last starters go into "+N" and its hover names them
  const rows = [
    starter('dnd-studio', 'D&D', 'Tisch läuft'),
    starter('ds-solutions-flow', 'Solutions'),
    starter('ds-flutter', 'Flutter', 'Gerät fehlt'),
    starter('ds-communication', 'Kommunikation', 'Call 15:30'),
  ]
  expect(fitStarters(rows, 200).hidden).toEqual([])
  const { shown, hidden } = fitStarters(rows, 40)
  expect(shown.length + hidden.length).toBe(4)
  expect(hidden.length).toBeGreaterThan(0)
  expect(shown.map(r => r.plugin)).toEqual(rows.slice(0, shown.length).map(r => r.plugin))
  const narrow = await merge([...rows, usage], 40)
  const line1 = narrow.children?.[0]
  const more = line1?.children?.at(-1)
  expect(more?.props?.key).toBe('launch-more')
  expect(walk(more).some(n => String(n.children?.[0] ?? '').includes('Kommunikation'))).toBe(true)
  expect(narrow.children?.[2]).toBe(meterLine)
})

test('a v2 row next to a v3 merger is drawn on line 1 as it comes; a newer row hands the merge on', async () => {
  const v2 = { plugin: 'ds-ct', tree: { type: 'Box', props: { key: 'launch:ds-ct@2', flexDirection: 'row' }, children: [] } as never }
  const v2usage = { plugin: 'ds-usage-line', tree: { type: 'Box', props: { key: 'launch:ds-usage-line@2', justifyContent: 'flex-end' } } as never }
  expect(bandVersion(v2)).toBe(2)
  const out = await merge([starter('ds-flutter', 'Flutter'), v2, v2usage])
  const [line1, rule, line2] = out.children ?? []
  expect(line1?.children?.map(c => c.props?.key)).toEqual([`launch:ds-flutter@${BAND_VERSION}`, 'launch:ds-ct@2'])
  expect(line1?.children?.[1]).toBe(v2.tree)
  expect(rule?.props?.key).toBe('launch-rule')
  expect(line2).toBe(v2usage.tree)
  // a row keyed for a newer band: passes untouched; keys without a version count as 1
  const newer = { plugin: 'x', tree: { type: 'Box', props: { key: `launch:x@${BAND_VERSION + 1}` } } as never }
  const old = { plugin: 'y', tree: { type: 'Box', props: { key: 'launch:y' } } as never }
  expect(bandVersion(old)).toBe(1)
  const rows = [old, newer, usage]
  let handed: unknown
  await mergeLauncherRows(fake$, { props: { rows, bodyColumns: 80 } } as never, (async (e: { props: { rows: unknown } }) => {
    handed = e.props.rows
    return null
  }) as never)
  expect(handed).toBe(rows)
})
