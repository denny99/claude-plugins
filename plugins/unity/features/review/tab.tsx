/** Stub of the Review tab (part B replaces this file). */
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { EmptyState, type Kit } from '../../lib/ui'
import type { Options } from '../state'

export async function reviewTab(
  _$: EngineInterface,
  _e: RenderInput<'Pane'>,
  k: Kit,
  _options: Options,
): Promise<RenderElement> {
  return EmptyState(k, { icon: 'eye', title: 'Noch nichts zu prüfen', text: 'Der Review-Bereich kommt gleich.' })
}

/** Open review items (the tab badge). */
export async function reviewBadge(_$: EngineInterface, _options: Options): Promise<number> {
  return 0
}
