/** Frame-time recording through the bridge, kept in the model (shared by Übersicht and Leistung). */
import type { EngineInterface } from 'claude-code'

import { isPlayError, perfRecord } from '../../lib/play'
import { patchModel, queuePerf, readModel, type Options } from '../state'

/**
 * Starts recording `seconds` of frame times and returns right away: the button hook only marks the model busy
 * („Messe 10 s …“) and queues the command; the live watch in state.ts fetches the result on its own ticks and patches
 * the model, so the card is drawn as soon as the bridge answers. The result is kept newest first, at most 5.
 */
export async function measure($: EngineInterface, options: Options, seconds: number, switchTab = false): Promise<void> {
  const m = await readModel($)
  if (m.busy?.startsWith('perf ')) return
  await patchModel($, {
    busy: `perf ${seconds}`,
    perfError: undefined,
    ...(switchTab ? { tab: 'perf' as const } : {}),
  })
  try {
    const res = await queuePerf($, options, seconds)
    if ('ok' in res && !res.ok) {
      // the same German texts as a failed recording (not-playing, bridge down …)
      const err = await perfRecord(async () => res, seconds)
      if (isPlayError(err))
        await patchModel($, { busy: undefined, perfError: { ...(err.code ? { code: err.code } : {}), error: err.error } })
    }
  } catch (e) {
    await patchModel($, { busy: undefined, perfError: { error: e instanceof Error ? e.message : String(e) } })
  }
}

/** The seconds of a running recording from `busy` (`perf 10` → 10), else undefined. */
export function measuringSeconds(busy: string | undefined): number | undefined {
  const m = /^perf (\d+)$/.exec(busy ?? '')
  return m ? Number(m[1]) : undefined
}
