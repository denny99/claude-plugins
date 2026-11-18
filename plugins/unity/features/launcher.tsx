/**
 * Starter strip above the prompt: one chip "Unity" (only in a Unity project) that opens the pane, with the editor's
 * state as a short status after it ("Editor bereit", "kompiliert …", "Play läuft", "Tests laufen", "3 Fehler"). Band
 * v3: `mergeLauncherRows` puts the row (key `launch:unity@3`) on line 1 with the other mods' starters, the usage meter
 * below; colour only for warn/bad.
 */
import type { EngineInterface, On, RenderElement, RenderInput } from 'claude-code'

import type { UnityModel } from '../types'
import type { Tone } from '../lib/theme'
import { kit, LauncherChip, LauncherRow, mergeLauncherRows } from '../lib/ui'
import { openPane } from './pane'
import { readModel, type Options } from './state'

/**
 * The chip's state in a few words, most urgent first: compile errors (bad), no editor (warn), tests running (also in
 * the background), compiling, Play mode; "Editor bereit" otherwise. Only warn/bad are drawn in colour.
 */
export function launcherStatus(m: UnityModel): { status?: string; tone?: Tone } {
  const errors = (m.compile?.messages ?? []).filter(x => x.severity === 'error').length
  if (errors) return { status: errors === 1 ? '1 Fehler' : `${errors} Fehler`, tone: 'bad' }
  if (!m.bridge.up) return { status: 'nicht verbunden', tone: 'warn' }
  const testsRunning = m.tests?.state === 'running' || m.jobs.some(j => j.kind === 'tests' && j.status === 'running')
  if (testsRunning) return { status: 'Tests laufen', tone: 'info' }
  if (m.bridge.isCompiling) return { status: 'kompiliert …', tone: 'info' }
  if (m.bridge.isPlaying) return { status: m.bridge.isPaused ? 'Play pausiert' : 'Play läuft', tone: 'info' }
  return { status: 'Editor bereit', tone: 'ok' }
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
