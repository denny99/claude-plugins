/** The `unity` pane (kit v2, brand neutral, German): header, tabs Übersicht · Tests · Review · Leistung (+ Konsole, Ziel). */
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { UnityModel, UnityTab } from '../types'
import { HOUNDSRIDGE_LOGO, LOGO_HEIGHT, LOGO_WIDTH } from '../lib/brand'
import { countResults } from '../lib/unity'
import { ErrorState, kit, LoadingState, EmptyState, PaneHeader, Tabs, type Kit, type PillProps } from '../lib/ui'
import { reviewBadge, reviewTab } from './review/tab'
import { patchModel, readModel, refreshLandings, refreshModel, type Options } from './state'
import { BRIDGE_GIT_URL, BRIDGE_README, fixWithClaude, run, selectTab, type Extra } from './pane/common'
import { consoleTab } from './pane/console'
import { overviewTab } from './pane/overview'
import { perfTab } from './pane/perf'
import { setupView } from './pane/setup'
import { targetTab } from './pane/target'
import { testsTab } from './pane/tests'

export { BRIDGE_GIT_URL, BRIDGE_README, fixWithClaude }

export const PANE_ID = 'unity'
export const PANE_TITLE = 'UNITY'

export async function openPane($: EngineInterface, options: Options): Promise<void> {
  await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
  $.clock.after(0, () => void refreshModel($, options).then(() => refreshLandings($, options)))
}

/** The one status pill of the header. */
function statusPill(m: UnityModel): PillProps {
  if (m.phase === 'unknown') return { text: 'verbindet …', tone: 'warn', glyph: '◷' }
  if (m.phase !== 'ok') return { text: 'kein Projekt', tone: 'neutral', glyph: false }
  const b = m.bridge
  if (!b.up) return { text: b.why === 'stale' ? 'antwortet nicht' : 'nicht verbunden', tone: 'bad' }
  if (b.isCompiling) return { text: 'kompiliert', tone: 'warn', glyph: '◷' }
  if (b.isPlaying) return { text: b.isPaused ? 'pausiert' : 'Play-Modus', tone: 'info', icon: 'play' }
  return { text: 'Editor bereit', tone: 'ok' }
}

export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>, options: Options): Promise<RenderElement> {
  const k = await kit($, e, { brand: 'neutral', lang: 'de' })
  const { Box } = k
  const x = $.ui.resolve(e) as unknown as Extra
  const m = await readModel($)
  const refresh = run($, 'refresh', async () => {
    await refreshModel($, options)
  })
  const header = PaneHeader(k, {
    logo: HOUNDSRIDGE_LOGO,
    logoAlt: 'Houndsridge',
    logoWidth: LOGO_WIDTH,
    logoHeight: LOGO_HEIGHT,
    label: 'Unity',
    title: m.project?.name ?? 'Unity',
    pill: statusPill(m),
    actions: [
      { key: 'refresh', icon: 'refresh', label: 'Aktualisieren', onPress: refresh },
      ...(m.phase === 'ok'
        ? [{ key: 'settings', icon: 'gear' as const, label: 'Ziel', onPress: selectTab($, 'target') }]
        : []),
    ],
  })
  if (m.phase === 'unknown')
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {LoadingState(k, {
          shape: [2, 3],
          text: 'Frage Unity nach dem Stand … Importiert der Editor gerade, kann das eine Minute dauern.',
        })}
      </Box>
    )
  if (m.phase !== 'ok' || !m.project)
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {EmptyState(k, {
          icon: 'folder',
          title: 'Kein Unity-Projekt hier',
          text: 'Weder im Ordner noch eine Ebene tiefer liegt eine ProjectSettings/ProjectVersion.txt.',
          action: { key: 'refresh-empty', label: 'Erneut suchen', icon: 'refresh', onPress: refresh },
        })}
      </Box>
    )
  const tab: UnityTab = m.tab ?? 'overview'
  const review = await reviewBadge($, options).catch(() => 0)
  const failed = m.tests ? countResults(m.tests.results).failed : 0
  const problems = m.console.filter(c => c.type !== 'Log' && c.type !== 'Warning').length
  const tabs = Tabs<UnityTab>(k, {
    tabs: [
      { id: 'overview', label: 'Übersicht', icon: 'grid' },
      { id: 'tests', label: 'Tests', icon: 'flask', count: failed || undefined },
      { id: 'review', label: 'Review', icon: 'eye', count: review || undefined },
      { id: 'perf', label: 'Leistung', icon: 'gauge' },
      { id: 'console', label: 'Konsole', icon: 'terminal', count: problems || undefined },
      { id: 'target', label: 'Ziel', icon: 'folder' },
    ],
    active: tab,
    onSelect: id => void patchModel($, { tab: id }),
    maxVisible: k.narrow ? 4 : 5,
    moreLabel: 'Mehr',
  })
  const body = await tabBody($, e, k, x, m, options, tab)
  return (
    <Box flexDirection="column" gap={1}>
      {header}
      {tabs}
      {m.error
        ? ErrorState(k, {
            key: 'pane-error',
            title: 'Das hat nicht geklappt',
            message: m.error,
            onRetry: () => void patchModel($, { error: undefined }),
          })
        : null}
      {body}
    </Box>
  )
}

async function tabBody(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  k: Kit,
  x: Extra,
  m: UnityModel,
  options: Options,
  tab: UnityTab,
): Promise<RenderElement> {
  const now = await $.clock.now()
  switch (tab) {
    case 'tests':
      return testsTab($, k, x, m, options, now)
    case 'review':
      return reviewTab($, e, k, options)
    case 'perf':
      return perfTab($, k, m, options)
    case 'console':
      return consoleTab($, k, m, options, now)
    case 'target':
      return targetTab($, k, m, options)
    default:
      return m.bridge.up ? overviewTab($, k, m, options, now) : setupView($, k, x, m, options, now)
  }
}
