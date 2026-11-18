/**
 * Starter strip above the prompt: one chip "Unity" (only in a Unity project) that opens the pane, with the editor's
 * state next to it — not connected, tests running, compile errors or Play mode. Rows are merged with other mods' rows by
 * `mergeLauncherRows` (key `launch:unity@2`).
 */
import type { EngineInterface, On, RenderElement, RenderInput } from 'claude-code'

import type { UnityModel } from '../types'
import type { Tone } from '../lib/theme'
import { kit, LauncherChip, LauncherRow, mergeLauncherRows } from '../lib/ui'
import { openPane } from './pane'
import { readModel, type Options } from './state'

/** The chip's state, most urgent first: compile errors, tests running (also in the background), no editor, Play mode; nothing when ready. */
export function launcherStatus(m: UnityModel): { status?: string; tone?: Tone } {
  const errors = (m.compile?.messages ?? []).filter(x => x.severity === 'error').length
  if (errors) return { status: errors === 1 ? '1 Kompilierfehler' : `${errors} Kompilierfehler`, tone: 'bad' }
  const testsRunning = m.tests?.state === 'running' || m.jobs.some(j => j.kind === 'tests' && j.status === 'running')
  if (testsRunning) return { status: 'Tests laufen', tone: 'warn' }
  if (!m.bridge.up) return { status: 'nicht verbunden', tone: 'warn' }
  if (m.bridge.isPlaying) return { status: m.bridge.isPaused ? 'Play-Modus · Pause' : 'Play-Modus', tone: 'info' }
  return {}
}

async function drawLauncher(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  options: Options,
): Promise<RenderElement | null> {
  const m = await readModel($)
  if (!m.unityHere && !m.project) return null
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
