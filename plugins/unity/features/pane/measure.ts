/** Frame-time recording through the bridge, kept in the model (shared by Übersicht and Leistung). */
import type { EngineInterface } from 'claude-code'

import type { ModelPerf } from '../../types'
import { isPlayError } from '../../lib/play'
import { patchModel, perfRecord, readModel, type Options } from '../state'

/**
 * Starts recording `seconds` of frame times and returns right away: the button hook only marks the model busy
 * („Messe 10 s …“), the recording itself runs detached on the clock (like `measureThenComplete` in the review report),
 * so no hook waits for the bridge. The result is kept newest first, at most 5.
 */
export async function measure($: EngineInterface, options: Options, seconds: number, switchTab = false): Promise<void> {
  const m = await readModel($)
  if (m.busy?.startsWith('perf ')) return
  await patchModel($, {
    busy: `perf ${seconds}`,
    perfError: undefined,
    ...(switchTab ? { tab: 'perf' as const } : {}),
  })
  $.clock.after(0, () => void record($, options, seconds))
}

/** The seconds of a running recording from `busy` (`perf 10` → 10), else undefined. */
export function measuringSeconds(busy: string | undefined): number | undefined {
  const m = /^perf (\d+)$/.exec(busy ?? '')
  return m ? Number(m[1]) : undefined
}

async function record($: EngineInterface, options: Options, seconds: number): Promise<void> {
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
