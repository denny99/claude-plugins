/** Tab Übersicht (board Unity-Bereit): editor + compile with Play, tests at a glance, console, jobs, target. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel } from '../../types'
import { batchAllowed, countResults, formatMessage, rankResults, testErrorLine } from '../../lib/unity'
import {
  Actions,
  ActionButton,
  Card,
  CardTitle,
  ListRow,
  LogBox,
  Sentence,
  type Action,
  type Kit,
  type Status,
} from '../../lib/ui'
import { openReport } from '../review/report'
import {
  batchTarget,
  bridgeCommand,
  bridgeOutdated,
  configOf,
  patchModel,
  runTests,
  screenshot,
  startBatchJob,
  stopJob,
  type Options,
} from '../state'
import {
  ago,
  bridgeUpdateCard,
  consoleOrigin,
  exactFilter,
  FIX_ASK,
  fixWithClaude,
  msg,
  run,
  selectTab,
  stopTestsAction,
  targetSentence,
  testsProgress,
} from './common'
import { measure } from './measure'

export function overviewTab($: EngineInterface, k: Kit, m: UnityModel, options: Options, now: number): RenderElement {
  const { Box } = k
  const target = targetSentence(m)
  return (
    <Box flexDirection="column" gap={1}>
      {bridgeOutdated(m) ? bridgeUpdateCard($, k, m, options) : null}
      {editorCard($, k, m, options, now)}
      {testsCard($, k, m, options, now)}
      {consoleCard($, k, m)}
      {jobsCard($, k, m, options)}
      {/* The header's "Ziel" knob opens the target tab; here only where runs go. */}
      {Sentence(k, target.text, { faint: true, tone: target.ok ? undefined : 'warn' })}
    </Box>
  )
}

/** "Problem melden" from the overview: switch to the Review tab, where the report card shows, and capture. */
async function reportFromOverview($: EngineInterface, options: Options): Promise<void> {
  await patchModel($, { tab: 'review' })
  await openReport($, options)
}

/** Editor actions: Play/Stop (the one primary), report a problem, measure 10 s, screenshot. */
export function playActions($: EngineInterface, m: UnityModel, options: Options): Action[] {
  const b = m.bridge
  const acts: Action[] = b.isPlaying
    ? [
        {
          key: 'stop',
          label: 'Stopp',
          icon: 'stop',
          variant: 'primary',
          primary: true,
          onPress: run($, 'stop', async () => msg(await bridgeCommand($, options, { cmd: 'stop' }), 'Gestoppt')),
        },
        {
          key: 'pause',
          label: b.isPaused ? 'Weiter' : 'Pause',
          icon: b.isPaused ? 'play' : 'pause',
          variant: 'secondary',
          onPress: run($, 'pause', async () =>
            msg(await bridgeCommand($, options, { cmd: 'pause' }), b.isPaused ? 'Läuft weiter' : 'Pausiert'),
          ),
        },
      ]
    : [
        {
          key: 'play',
          label: 'Play',
          icon: 'play',
          variant: 'primary',
          primary: true,
          onPress: run($, 'play', async () => msg(await bridgeCommand($, options, { cmd: 'play' }), 'Play läuft')),
        },
      ]
  acts.push(
    {
      key: 'report',
      label: 'Problem melden',
      icon: 'flag',
      variant: 'secondary',
      onPress: () => void reportFromOverview($, options),
    },
    {
      key: 'perf-quick',
      label: '10 s messen',
      icon: 'gauge',
      variant: 'secondary',
      onPress: () => void measure($, options, 10, true),
    },
    {
      key: 'shot',
      label: 'Screenshot',
      icon: 'camera',
      variant: 'secondary',
      onPress: run($, 'screenshot', async () => {
        const r = await screenshot($, options)
        if ('error' in r) return `Screenshot fehlgeschlagen: ${r.error}`
        await $.prompt.submit({ text: shotPrompt(m, r.path) })
        return 'Screenshot an Claude geschickt'
      }),
    },
  )
  return acts
}

/** The open scene's name: the heartbeat's sceneName (newer bridges), else the file name of its path. */
export function sceneLabel(b: UnityModel['bridge']): string | undefined {
  if (b.sceneName) return b.sceneName
  const file = b.scene?.split('/').pop()
  return file ? file.replace(/\.unity$/, '') : undefined
}

/** No saved scene open in Edit mode ("Untitled"): Play would start an empty world. */
export function noSceneOpen(b: UnityModel['bridge']): boolean {
  return b.up && !b.isPlaying && !b.isCompiling && !b.scene
}

/** The prompt of the overview's "Screenshot" button: the picture goes to Claude. */
export function shotPrompt(m: UnityModel, path: string): string {
  const b = m.bridge
  const scene = sceneLabel(b)
  const state = b.isPlaying ? 'Play-Modus' : 'Edit-Modus'
  return [
    `Screenshot aus dem Unity-Editor (${state}${scene ? `, Szene ${scene}` : ''}): ${path}`,
    '',
    'Sieh dir das Bild an (Datei lesen) und sag mir, was dir auffällt.',
  ].join('\n')
}

function editorCard($: EngineInterface, k: Kit, m: UnityModel, options: Options, now: number): RenderElement {
  const b = m.bridge
  const errors = (m.compile?.messages ?? []).filter(x => x.severity === 'error')
  const warnings = (m.compile?.messages.length ?? 0) - errors.length
  // Entering Play reloads the domain (isCompiling for a moment): Play mode wins over "kompiliert".
  const compiling = b.isCompiling && !b.isPlaying
  const state = compiling ? 'kompiliert' : b.isPlaying ? (b.isPaused ? 'pausiert' : 'Play-Modus') : 'Edit-Modus'
  const scene = sceneLabel(b)
  const noScene = noSceneOpen(b)
  const start = m.startScene
  const title = compiling
    ? 'Kompiliert gerade …'
    : errors.length
      ? `${errors.length} ${errors.length === 1 ? 'Kompilierfehler' : 'Kompilierfehler'}`
      : warnings
        ? `Kompiliert mit ${warnings} ${warnings === 1 ? 'Warnung' : 'Warnungen'}`
        : 'Kompiliert ohne Fehler'
  // While compiling, the last compile's age would contradict "gerade".
  const when = m.compile && !compiling ? `${ago(now, m.compile.at)} · ` : ''
  return Card(k, {
    key: 'editor',
    tone: errors.length ? 'bad' : undefined,
    children: [
      CardTitle(k, {
        icon: errors.length ? 'xCircle' : compiling ? 'clock' : 'checkCircle',
        title,
        tone: errors.length ? 'bad' : compiling ? 'warn' : 'ok',
      }),
      Sentence(
        k,
        `${when}${state} · Unity ${b.unityVersion ?? m.project?.version ?? ''}${scene ? ` · Szene ${scene}` : ''}`,
        { faint: true },
      ),
      noScene
        ? Sentence(
            k,
            start
              ? `Keine Szene offen – Play startet eine leere Welt. Startszene: ${start.split('/').pop()?.replace(/\.unity$/, '')}.`
              : 'Keine Szene offen – Play startet eine leere Welt. In den Build Settings ist keine Startszene eingetragen.',
            { tone: 'warn' },
          )
        : null,
      noScene && start
        ? Actions(k, 'scene-acts', [
            {
              key: 'open-start-scene',
              label: 'Startszene öffnen',
              icon: 'play',
              variant: 'secondary',
              onPress: run($, 'open-scene', async () =>
                msg(await bridgeCommand($, options, { cmd: 'open-scene', path: start }), 'Startszene geöffnet'),
              ),
            },
          ])
        : null,
      ...errors.slice(0, 5).map((x, i) =>
        ListRow(k, {
          key: `cerr-${i}`,
          status: 'failed',
          title: formatMessage(x),
          actions: [
            {
              key: `cfix-${i}`,
              label: 'Claude reparieren lassen',
              icon: 'claude',
              variant: 'secondary',
              onPress: () => void fixWithClaude($, FIX_ASK.compile, formatMessage(x)),
            },
          ],
        }),
      ),
      Actions(k, 'editor-acts', playActions($, m, options), 4),
      m.lastShot ? Sentence(k, `Letzter Screenshot: ${m.lastShot.split('/').pop() ?? ''}`, { faint: true }) : null,
    ],
  })
}

export function testsCard($: EngineInterface, k: Kit, m: UnityModel, options: Options, now: number): RenderElement {
  const t = m.tests
  if (!t)
    return Card(k, {
      key: 'tests-card',
      children: [
        CardTitle(k, { icon: 'flask', title: 'Tests' }),
        Sentence(k, 'Noch kein Lauf in dieser Sitzung.', { faint: true }),
        Actions(k, 'tests-card-acts', [
          {
            key: 'tests-open',
            label: 'Tests wählen',
            icon: 'flask',
            variant: 'secondary',
            onPress: selectTab($, 'tests'),
          },
        ]),
      ],
    })
  const c = countResults(t.results)
  const ranked = rankResults(t.results, m.previous).filter(r => r.status === 'Failed')
  const compared = Object.keys(m.previous).length > 0
  const fresh = compared ? ranked.filter(r => r.newlyRed).length : 0
  const mode = t.mode ?? 'EditMode'
  const running = t.state === 'running'
  const pill = running
    ? { text: 'läuft', tone: 'warn' as const, glyph: '◷' }
    : t.state === 'error'
      ? { text: 'Fehler', tone: 'bad' as const }
      : c.failed
        ? { text: `${c.failed} rot${fresh ? ` · ${fresh} neu` : ''}`, tone: 'bad' as const }
        : { text: 'grün', tone: 'ok' as const }
  const total = c.passed + c.failed + c.skipped
  const progress = running ? testsProgress(t, now) : ''
  const sentence = running
    ? `Läuft${t.filter ? ` mit Filter ${t.filter}` : ' · alle Tests'}${progress ? ` · ${progress}` : ' …'}`
    : t.state === 'error'
      ? testErrorLine(t)
      : `${c.passed} von ${total} grün${t.finishedAt ? ` · Lauf ${ago(now, t.finishedAt)}` : ''}`
  const acts: Action[] = []
  if (ranked.length && !running)
    acts.push({
      key: 'rerun-red',
      label: 'Rote erneut ausführen',
      icon: 'rerun',
      variant: 'secondary',
      onPress: run($, 'rerun red', () => runTests($, options, mode, exactFilter(ranked.map(r => r.fullName)), 0)),
    })
  if (running) acts.push(stopTestsAction($, options))
  acts.push({ key: 'tests-open', label: 'Zum Tab Tests', variant: 'link', onPress: selectTab($, 'tests') })
  return Card(k, {
    key: 'tests-card',
    children: [
      CardTitle(k, { icon: 'flask', title: `${mode}-Tests`, pill }),
      Sentence(k, sentence, { faint: true }),
      ...ranked.slice(0, 3).map((r, i) =>
        ListRow(k, {
          key: `ov-tf-${i}`,
          status: 'failed',
          title: r.fullName.split('.').slice(-2).join('.'),
          pill: compared && r.newlyRed ? { text: 'neu', tone: 'info', glyph: false } : undefined,
        }),
      ),
      Actions(k, 'tests-card-acts', acts),
    ],
  })
}

function consoleCard($: EngineInterface, k: Kit, m: UnityModel): RenderElement {
  const errors = m.console.filter(c => c.type === 'Error' || c.type === 'Exception' || c.type === 'Assert')
  const warnings = m.console.filter(c => c.type === 'Warning').length
  const last = errors[errors.length - 1]
  const origin = last ? consoleOrigin(last) : undefined
  return Card(k, {
    key: 'console-card',
    children: [
      CardTitle(k, {
        icon: 'terminal',
        title: 'Konsole',
        pill: errors.length
          ? { text: `${errors.length} ${errors.length === 1 ? 'Fehler' : 'Fehler'}`, tone: 'bad' }
          : warnings
            ? { text: `${warnings} ${warnings === 1 ? 'Warnung' : 'Warnungen'}`, tone: 'warn' }
            : undefined,
      }),
      Sentence(k, last ? (last.message.split('\n')[0] ?? '') : 'Keine Fehler seit dem letzten Kompilieren.', {
        faint: !last,
        tone: last && !origin?.pkg ? 'bad' : undefined,
      }),
      origin
        ? Sentence(
            k,
            origin.pkg ? `Aus Paket ${origin.pkg} · ${origin.file} — nicht aus deinem Spiel-Code` : `In ${origin.file}`,
            {
              faint: true,
            },
          )
        : null,
      ActionButton(k, {
        key: 'console-open',
        label: 'Konsole öffnen',
        variant: 'link',
        onPress: selectTab($, 'console'),
      }),
    ],
  })
}

function jobGlyph(s: string): Status {
  return s === 'running' ? 'running' : s === 'exited' ? 'ok' : s === 'stopped' ? 'idle' : 'failed'
}

const JOB_STATUS: Record<string, string> = {
  running: 'läuft',
  exited: 'fertig',
  failed: 'fehlgeschlagen',
  stopped: 'gestoppt',
  denied: 'abgelehnt',
  timeout: 'Zeit überschritten',
}

/**
 * One line per job button that needs saying: what "Kompilieren prüfen" does next to a project job of the same kind,
 * and each project job's `description` from .claude/unity.json.
 */
export function jobNotes(
  jobs: { name: string; label?: string; description?: string; batch?: boolean }[],
  allowed: boolean,
): string[] {
  const shown = jobs.filter(j => !j.batch || allowed)
  const notes: string[] = []
  if (allowed && shown.length)
    notes.push(
      '„Kompilieren prüfen“ kompiliert das Projekt im Hintergrund ohne Editor (Unity-Batchmodus). Die anderen Knöpfe sind Projekt-Aufgaben aus .claude/unity.json.',
    )
  for (const j of shown) if (j.description) notes.push(`${j.label ?? j.name}: ${j.description}`)
  return notes
}

/** Batch and custom jobs: start buttons, the last five, the latest log collapsed. */
export function jobsCard($: EngineInterface, k: Kit, m: UnityModel, options: Options): RenderElement | null {
  const cfg = configOf(m)
  const target = batchTarget(m)
  const allowed = batchAllowed({ lock: target.lock, bridgeUp: target.bridgeUp }).ok
  const actions: Action[] = []
  if (allowed) {
    actions.push({
      key: 'batch-compile',
      label: 'Kompilieren prüfen',
      icon: 'hammer',
      variant: 'secondary',
      onPress: run($, 'compile check', () => startBatchJob($, options, 'compile', {})),
    })
    if (cfg.buildMethod)
      actions.push({
        key: 'batch-build',
        label: 'Build',
        icon: 'box',
        variant: 'secondary',
        onPress: run($, 'build', () => startBatchJob($, options, 'build', {})),
      })
  }
  // A project job may start Unity itself (e.g. node tools/unity.mjs): with an editor holding the project, only after a
  // second press. Jobs marked `batch` are hidden then (they always start Unity).
  for (const j of cfg.customJobs ?? [])
    if (!j.batch || allowed)
      actions.push({
        key: `custom-${j.name}`,
        label: j.label ?? j.name,
        icon: 'terminal',
        variant: 'secondary',
        ...(allowed ? {} : { confirm: 'Editor ist offen — trotzdem starten?' }),
        onPress: run($, j.name, () => startBatchJob($, options, 'custom', { custom: j.name })),
      })
  if (!actions.length && !m.jobs.length) return null
  const latest = [...m.jobs].reverse()
  const runningCount = m.jobs.filter(j => j.status === 'running').length
  const head = latest[0]
  return Card(k, {
    key: 'jobs',
    children: [
      CardTitle(k, {
        icon: 'list',
        title: 'Aufgaben',
        pill: runningCount ? { text: `${runningCount} läuft`, tone: 'warn', glyph: '◷' } : undefined,
      }),
      ...latest.slice(0, 5).map(j =>
        ListRow(k, {
          key: `job-${j.key}`,
          status: jobGlyph(j.status),
          title: `${j.name} · ${JOB_STATUS[j.status] ?? j.status}${j.exitCode !== undefined ? ` (Exit ${j.exitCode})` : ''}`,
          meta: j.error ?? undefined,
          actions:
            j.status === 'running'
              ? [
                  {
                    key: `stop-${j.key}`,
                    label: 'Stopp',
                    icon: 'stop',
                    variant: 'secondary',
                    confirm: 'Wirklich stoppen?',
                    onPress: run($, 'stop job', async () => (await stopJob($, j.key)) ?? 'Gestoppt'),
                  },
                ]
              : [],
        }),
      ),
      head?.status === 'failed' && head.failLog?.length
        ? LogBox(k, {
            key: 'job-faillog',
            title: `Letzte ${Math.min(60, head.failLog.length)} Log-Zeilen · ${head.name}`,
            lines: head.failLog,
          })
        : head && head.tail.length
          ? LogBox(k, { key: 'job-log', title: `Log · ${head.name}`, lines: head.tail, collapsed: true })
          : null,
      actions.length ? Actions(k, 'jobs-acts', actions, 3) : null,
      ...jobNotes(cfg.customJobs ?? [], allowed).map(t => Sentence(k, t, { faint: true })),
    ],
  })
}
