/**
 * Starter strip above the prompt: one chip "Unity" (only in a Unity project) that opens the pane, with the editor's
 * state as a short status after it ("kompiliert …", "Play läuft", "Tests laufen", "3 Fehler", "nicht verbunden"). Band
 * v4: `mergeLauncherRows` puts the row (key `launch:unity@4`) on line 1 with the other mods' starters, the usage meter
 * below, both left-aligned; a calm editor (ready, or simply closed) shows only the name, colour only for warn/bad.
 */
import type { EngineInterface, On, RenderElement, RenderInput } from 'claude-code'

import type { UnityModel } from '../types'
import type { Tone } from '../lib/theme'
import { kit, LauncherChip, LauncherRow, mergeLauncherRows } from '../lib/ui'
import { openPane } from './pane'
import { bridgeOutdated, editorActivity, editorBusyWithTests, ensureLive, readModel, type Options } from './state'

/**
 * The chip's state in a few words: compile errors (bad) first, then {@link editorActivity} — the same answer the
 * panel's pill reads, so band and panel never disagree (Play wins over the domain reload's isCompiling). Band v4: a
 * calm state returns `{}` and the chip shows only "Unity" — the editor ready, or simply closed (no lock held: nothing
 * is asked of it). "nicht verbunden"/"antwortet nicht" (warn) only when the editor is open here (lock held) but the
 * bridge does not answer; "Bridge veraltet" (warn) when it answers with an old bridge. Running things (tests,
 * compiling, Play) are `info`. Colour only for warn/bad; `showsStatus` in `LauncherChip` (lib/ui.tsx) decides.
 */
export function launcherStatus(m: UnityModel): { status?: string; tone?: Tone } {
  const errors = (m.compile?.messages ?? []).filter(x => x.severity === 'error').length
  if (errors) return { status: errors === 1 ? '1 Fehler' : `${errors} Fehler`, tone: 'bad' }
  // a test run blocks the editor's main thread: a stale heartbeat then is no problem (same as the panel's pill)
  if (editorBusyWithTests(m)) return { status: 'Tests laufen', tone: 'info' }
  switch (editorActivity(m)) {
    case 'down':
      if (m.lock !== 'held') return {} // editor closed: calm, nothing to report
      return { status: m.bridge.why === 'stale' ? 'antwortet nicht' : 'nicht verbunden', tone: 'warn' }
    case 'tests':
      return { status: 'Tests laufen', tone: 'info' }
    case 'compiling':
      return { status: 'kompiliert …', tone: 'info' }
    case 'paused':
      return { status: 'Play pausiert', tone: 'info' }
    case 'playing':
      return { status: 'Play läuft', tone: 'info' }
    default:
      return bridgeOutdated(m) ? { status: 'Bridge veraltet', tone: 'warn' } : {}
  }
}

async function drawLauncher(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  options: Options,
): Promise<RenderElement | null> {
  const m = await readModel($)
  if (!m.unityHere && !m.project) return null
  // A hot reload / `/reload-plugins` stops the old copy's watch; the band draws right after, so it starts here at the
  // latest (a timer, no state write — allowed while drawing). Once per loaded copy: ensureLive keeps a module flag.
  if (m.phase !== 'none') ensureLive($, options)
  const k = await kit($, e, { brand: 'neutral', lang: 'de' })
  const s = launcherStatus(m)
  return LauncherRow(k, {
    plugin: 'unity',
    chips: [
      LauncherChip(k, {
        key: 'launch-unity',
        label: 'Unity',
        status: s.status,
        tone: s.tone,
        onPress: () => void openPane($, options),
      }),
    ],
  })
}

export function registerLauncher(on: On, options: Options): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e) // a survey has the band
    return (await drawLauncher($, e, options)) ?? next(e)
  })
  on(
    'ui.render',
    { component: 'AbovePromptList' },
    ($, e, next) => mergeLauncherRows($, e, next) as Promise<RenderElement>,
  )
}
