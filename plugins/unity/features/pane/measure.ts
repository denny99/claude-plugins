/** Frame-time recording through the bridge, kept in the model (shared by Übersicht and Leistung). */
import type { EngineInterface } from 'claude-code'

import type { ModelPerf } from '../../types'
import { isPlayError } from '../../lib/play'
import { patchModel, perfRecord, readModel, type Options } from '../state'

/** Records `seconds` of frame times and keeps the result (newest first, at most 5). */
export async function measure($: EngineInterface, options: Options, seconds: number, switchTab = false): Promise<void> {
  await patchModel($, { busy: `perf ${seconds}`, ...(switchTab ? { tab: 'perf' as const } : {}) })
  try {
    const res = await perfRecord($, options, seconds)
    if (isPlayError(res)) {
      await patchModel($, { perfError: { code: res.code, error: res.error } })
      return
    }
    const at = await $.clock.now()
    const before = await readModel($)
    const perf = JSON.parse(JSON.stringify(res)) as ModelPerf
    await patchModel($, { perfRuns: [{ at, perf }, ...(before.perfRuns ?? [])].slice(0, 5), perfError: undefined })
  } catch (e) {
    await patchModel($, { perfError: { error: e instanceof Error ? e.message : String(e) } })
  } finally {
    await patchModel($, { busy: undefined })
  }
}
