/** Stub of "Problem melden" (part B replaces this file). */
import type { EngineInterface } from 'claude-code'

import type { Options } from '../state'

export async function openReport($: EngineInterface, _options: Options): Promise<void> {
  void $.ui.toast('Problem melden kommt mit dem Review-Tab.')
}
