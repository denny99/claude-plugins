/** Tab Übersicht (board Unity-Bereit): editor + compile with Play, tests at a glance, console, jobs, target. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel } from '../../types'
import { batchAllowed, countResults, formatMessage, rankResults, testErrorLine } from '../../lib/unity'
import {
  askAction,
  Card,
  ListRow,
  LogBox,
  Sentence,
  type Action,
  type Kit,
  type PillProps,
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
  fixAction,
  msg,
  run,
  selectTab,
  stopTestsAction,
  targetSentence,
  testsProgress,
} from './common'
import { shotUiNote, shotUiPrompt, type ShotUi } from '../../lib/play'

export function overviewTab($: EngineInterface, k: Kit, m: UnityModel, options: Options, now: number): RenderElement {
  const { Box } = k
  const target = targetSentence(m)
  const jobs = jobsCard($, k, m, options)
  return (
    <Box flexDirection="column" gap={1}>
      {bridgeOutdated(m) ? bridgeUpdateCard($, k, m, options) : null}
      {editorCard($, k, m, options, now)}
      {testsCard($, k, m, options, now)}
      {consoleCard($, k, m)}
      {jobs}
      {/* Where runs go: the hint of the tasks card (R7: never a loose sentence at the tab end); without tasks only a
          warning is worth a line of its own, the header's „Ziel“ tab says the rest. */}
      {!jobs && !target.ok ? Sentence(k, target.text, { faint: true, tone: 'warn' }) : null}
    </Box>
  )
}

/** "Problem melden" from the overview: switch to the Review tab, where the report card shows, and capture. */
async function reportFromOverview($: EngineInterface, options: Options): Promise<void> {
  await patchModel($, { tab: 'review' })
  await openReport($, options)
}

/**
 * Editor actions: start/stop (the one primary), pause, screenshot to Claude, report a problem. `crowded` (the caller
 * adds a secondary of its own): „Problem melden“ becomes a text action, so never more than two secondary stand beside
 * the primary (R1). Measuring lives in the Leistung tab.
 */
export function playActions($: EngineInterface, k: Kit, m: UnityModel, options: Options, crowded = false): Action[] {
  const b = m.bridge
  const acts: Action[] = b.isPlaying
    ? [
        {
          key: 'stop',
          label: 'Stoppen',
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
          label: 'Starten',
          icon: 'play',
          variant: 'primary',
          primary: true,
          onPress: run($, 'play', async () => msg(await bridgeCommand($, options, { cmd: 'play' }), 'Play läuft')),
        },
      ]
  acts.push(
    // The prompt exists only after the capture: the lock is taken first, a failed capture frees it again.
    askAction($, k, {
      key: 'shot',
      label: 'Screenshot an Claude',
      icon: 'camera',
      toast: 'Screenshot an Claude geschickt.',
      text: async () => {
        await patchModel($, { busy: 'screenshot' })
        try {
          const r = await screenshot($, options)
          if ('error' in r) {
            void $.ui.toast(`Screenshot fehlgeschlagen: ${r.error}`)
            return undefined
          }
          const note = shotUiNote(r.ui)
          if (note) void $.ui.toast(note, { timeoutMs: 8000 })
          return shotPrompt(m, r.path, r.ui)
        } catch (e) {
          await patchModel($, { error: e instanceof Error ? e.message : String(e) })
          return undefined
        } finally {
          await patchModel($, { busy: undefined })
        }
      },
    }),
    {
      key: 'report',
      label: 'Problem melden',
      icon: 'flag',
      variant: b.isPlaying || crowded ? 'link' : 'secondary',
      onPress: () => void reportFromOverview($, options),
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
export function shotPrompt(m: UnityModel, path: string, ui?: ShotUi): string {
  const b = m.bridge
  const scene = sceneLabel(b)
  const state = b.isPlaying ? 'Play-Modus' : 'Edit-Modus'
  const note = shotUiPrompt(ui)
  return [
    `Screenshot aus dem Unity-Editor (${state}${scene ? `, Szene ${scene}` : ''}): ${path}`,
    ...(note ? [note] : []),
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
        ? `Kompiliert mit ${warnings} ${warnings === 1 ? 'Compiler-Warnung' : 'Compiler-Warnungen'}`
        : 'Kompiliert ohne Fehler'
  // While compiling, the last compile's age would contradict "gerade".
  const when = m.compile && !compiling ? `${ago(now, m.compile.at)} · ` : ''
  const shot = m.lastShot?.split('/').pop()
  const facts = `${when}${state} · Unity ${b.unityVersion ?? m.project?.version ?? ''}${scene ? ` · Szene ${scene}` : ''}`
  const acts = playActions($, k, m, options, noScene && !!start)
  if (noScene && start)
    acts.splice(1, 0, {
      key: 'open-start-scene',
      label: 'Startszene öffnen',
      variant: 'secondary',
      onPress: run($, 'open-scene', async () =>
        msg(await bridgeCommand($, options, { cmd: 'open-scene', path: start }), 'Startszene geöffnet'),
      ),
    })
  return Card(k, {
    key: 'editor',
    tone: errors.length ? 'bad' : undefined,
    title: {
      icon: errors.length ? 'xCircle' : compiling ? 'clock' : 'checkCircle',
      title,
      tone: errors.length ? 'bad' : compiling ? 'warn' : 'ok',
    },
    children: [
      Sentence(k, shot ? `${facts} · letzter Screenshot ${shot}` : facts, { faint: true }),
      ...errors.slice(0, 5).map((x, i) =>
        ListRow(k, {
          key: `cerr-${i}`,
          status: 'failed',
          title: compileTitle(x),
          // the row cuts its title: the whole compiler line (path, position, code) stands behind „Details“
          details: () => [LogBox(k, { key: `cerr-${i}-log`, lines: [formatMessage(x)] })],
          actions: [fixAction($, k, `cfix-${i}`, FIX_ASK.compile, formatMessage(x))],
        }),
      ),
    ],
    status: noScene
      ? {
          text: start
            ? `Keine Szene offen · Startszene: ${start.split('/').pop()?.replace(/\.unity$/, '')}`
            : 'Keine Szene offen · in den Build Settings ist keine Startszene eingetragen',
          tone: 'warn',
        }
      : undefined,
    actions: acts,
    maxActions: 4,
    keepOrder: true,
  })
}

/** A compile message as a row title: `Datei.cs:12 · CS0103 · text` when it has a place, else its text. */
export function compileTitle(x: Parameters<typeof formatMessage>[0]): string {
  const line = formatMessage(x)
  const hit = /^(.*?)\((\d+),\d+\):\s*(?:error|warning)\s+([A-Z]+\d+)\s*:\s*(.*)$/.exec(line.split('\n')[0] ?? '')
  if (!hit) return line.split('\n')[0] ?? line
  return `${hit[1]!.split('/').pop()}:${hit[2]} · ${hit[3]} · ${hit[4]}`
}

export function testsCard($: EngineInterface, k: Kit, m: UnityModel, options: Options, now: number): RenderElement {
  const t = m.tests
  if (!t)
    return Card(k, {
      key: 'tests-card',
      title: { icon: 'flask', title: 'Tests' },
      empty: 'Noch kein Lauf in dieser Sitzung.',
      actions: [{ key: 'tests-open', label: 'Zu Tests', variant: 'link', onPress: selectTab($, 'tests') }],
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
  acts.push({ key: 'tests-open', label: 'Zu Tests', variant: 'link', onPress: selectTab($, 'tests') })
  return Card(k, {
    key: 'tests-card',
    title: { icon: 'flask', title: `${mode}-Tests`, pill },
    children: [
      Sentence(k, sentence, { faint: true }),
      ...ranked.slice(0, 3).map((r, i) =>
        ListRow(k, {
          key: `ov-tf-${i}`,
          status: 'failed',
          title: r.fullName.split('.').slice(-2).join('.'),
          pill: compared && r.newlyRed ? { text: 'neu', tone: 'info', glyph: false } : undefined,
        }),
      ),
    ],
    actions: acts,
  })
}

/**
 * What the console's warning count is made of. The compile card counts each compiler warning once (parsed and
 * deduplicated from the compile); Unity's console can hold the same compiler warning several times (seen live: 72
 * lines for 36 compiler warnings). Said in words instead of two unexplained numbers.
 */
export function consoleWarningsLine(entries: { type: string; message: string }[]): string | undefined {
  const warnings = entries.filter(c => c.type === 'Warning')
  if (!warnings.length) return undefined
  const compiler = warnings.filter(c => /\(\d+,\d+\)\s*:\s*warning\s+[A-Z]+\d+\s*:/.test(c.message))
  const distinct = new Set(compiler.map(c => c.message.split('\n')[0]!.trim())).size
  const head = `${warnings.length} ${warnings.length === 1 ? 'Warnung' : 'Warnungen'} in der Konsole`
  if (!compiler.length) return `${head}.`
  if (distinct < compiler.length)
    return `${head}, davon ${compiler.length} vom Compiler (${distinct} verschiedene, Unity meldet sie mehrfach).`
  return `${head}, davon ${compiler.length} vom Compiler.`
}

function consoleCard($: EngineInterface, k: Kit, m: UnityModel): RenderElement {
  const errors = m.console.filter(c => c.type === 'Error' || c.type === 'Exception' || c.type === 'Assert')
  const warnings = m.console.filter(c => c.type === 'Warning').length
  const warnLine = consoleWarningsLine(m.console)
  const last = errors[errors.length - 1]
  const origin = last ? consoleOrigin(last) : undefined
  return Card(k, {
    key: 'console-card',
    title: {
      icon: 'terminal',
      title: 'Konsole',
      pill: errors.length
        ? { text: `${errors.length} ${errors.length === 1 ? 'Fehler' : 'Fehler'}`, tone: 'bad' }
        : warnings
          ? { text: `${warnings} ${warnings === 1 ? 'Warnung' : 'Warnungen'}`, tone: 'warn' }
          : undefined,
    },
    children: [
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
      warnLine ? Sentence(k, warnLine, { faint: true }) : null,
    ],
    actions: [{ key: 'console-open', label: 'Zur Konsole', variant: 'link', onPress: selectTab($, 'console') }],
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

/** Known project task names (tools/unity.mjs and friends) in the panel's words: label and what the task does. */
const KNOWN_JOBS: Record<string, { label: string; description: string }> = {
  setup: { label: 'Einrichten', description: 'richtet das Projekt ein (Render-Pipeline, Projektdaten, Eingabesystem).' },
  compile: { label: 'Kompilieren', description: 'öffnet und schließt das Projekt ohne Editor und meldet Kompilierfehler.' },
  scene: { label: 'Szene anlegen', description: 'legt die Startszene (neu) an und setzt sie an den Anfang der Build-Liste.' },
  texts: { label: 'Texte übernehmen', description: 'liest die Sprachdateien in die Texttabelle des Spiels.' },
  sound: { label: 'Klänge einrichten', description: 'setzt die Import-Einstellungen der Klänge und den Mixer.' },
  smoke: { label: 'Smoke-Test', description: 'startet die Welt und prüft alles, was nicht von Zeit abhängt.' },
  'smoke-timing': {
    label: 'Smoke: Zeiten',
    description: 'misst die Ladezeiten beim Lauf durch die Welt; wird nie wegen der Zeit rot.',
  },
  'smoke-all': { label: 'Smoke komplett', description: 'beide Smoke-Läufe in einem Start (letzte Prüfung vor dem Landen).' },
  editmode: { label: 'Edit-Mode-Tests', description: 'führt die Edit-Mode-Tests aus und listet rote Tests.' },
  playmode: { label: 'Play-Mode-Tests', description: 'führt die Play-Mode-Tests aus und listet rote Tests.' },
  test: { label: 'Tests', description: 'führt die Tests des Projekts aus.' },
  tests: { label: 'Tests', description: 'führt die Tests des Projekts aus.' },
  build: { label: 'Build', description: 'baut das Spiel als lauffähigen Player.' },
  probe: { label: 'Replay-Probe', description: 'nimmt die Replay-Probe für die Tests außerhalb von Unity auf.' },
  warm: {
    label: 'Warmen Editor starten',
    description: 'startet einen Editor im Hintergrund, der spätere Aufgaben ohne Kaltstart ausführt.',
  },
  'warm-stop': { label: 'Warmen Editor beenden', description: 'beendet den Editor im Hintergrund.' },
  'warm-status': { label: 'Warmer Editor: Status', description: 'zeigt, ob der Editor im Hintergrund läuft und was er tut.' },
}

/** "smoke-timing" → "Smoke timing": a raw task name made readable. */
export function readableName(name: string): string {
  const words = name.split(/[-_.\s]+/).filter(Boolean)
  if (!words.length) return name
  const text = words.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * How a project task is named in the panel: its `label` from .claude/unity.json, else a known name in German
 * (setup, smoke-timing, warm-stop …), else the name made readable; `build-…`/`test-…` keep their family's word.
 */
export function jobLabel(j: { name: string; label?: string }): string {
  if (j.label) return j.label
  const known = KNOWN_JOBS[j.name]
  if (known) return known.label
  const family = /^(build|test|tests)[-_](.+)$/.exec(j.name)
  if (family) return `${KNOWN_JOBS[family[1]!]!.label} ${readableName(family[2]!)}`
  return readableName(j.name)
}

/** What a project task does: its `description`, else the known one, else which command it runs. */
export function jobDescription(j: { name: string; description?: string; command?: string }): string {
  if (j.description) return j.description
  const known = KNOWN_JOBS[j.name]
  if (known) return known.description
  const command = (j.command ?? '').replace(/\s+/g, ' ').trim()
  return command ? `führt „${command.length > 80 ? `${command.slice(0, 79)}…` : command}“ aus.` : 'Projekt-Aufgabe aus .claude/unity.json.'
}

/** A task's description as a row's meta: a sentence of its own, so it starts with a capital. */
export function jobMeta(j: { name: string; description?: string; command?: string }): string {
  const text = jobDescription(j)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** What the card „Aufgaben“ lists: the built-in background jobs (only without an open editor), then the project's. */
export function jobTasks(
  cfg: {
    buildMethod?: string
    customJobs?: { name: string; label?: string; description?: string; command?: string; batch?: boolean }[]
  },
  allowed: boolean,
): { key: string; title: string; meta: string; kind: 'compile' | 'build' | 'custom'; name?: string }[] {
  const tasks: ReturnType<typeof jobTasks> = []
  if (allowed) {
    tasks.push({
      key: 'batch-compile',
      title: 'Kompilieren prüfen',
      meta: 'Kompiliert das Projekt im Hintergrund ohne Editor.',
      kind: 'compile',
    })
    if (cfg.buildMethod)
      tasks.push({ key: 'batch-build', title: 'Build', meta: jobMeta({ name: 'build' }), kind: 'build' })
  }
  // Jobs marked `batch` always start Unity: hidden while an editor holds the project.
  for (const j of cfg.customJobs ?? [])
    if (!j.batch || allowed)
      tasks.push({ key: `custom-${j.name}`, title: jobLabel(j), meta: jobMeta(j), kind: 'custom', name: j.name })
  return tasks
}

/** A run's name in the list: a project task by its label, the built-in jobs by their name. */
function jobTitle(cfg: { customJobs?: { name: string; label?: string }[] }, j: { kind?: string; name: string }): string {
  const custom = j.kind === 'custom' ? cfg.customJobs?.find(c => c.name === j.name) : undefined
  return custom ? jobLabel(custom) : j.name
}

const JOB_TONE: Record<string, PillProps['tone']> = {
  running: 'warn',
  exited: 'ok',
  failed: 'bad',
  denied: 'bad',
  timeout: 'bad',
}

/**
 * Tasks as list rows (name, what it does, „Starten“ on the right), then the last five runs (name, status as a pill,
 * error text behind „Details“) and the latest log.
 */
export function jobsCard($: EngineInterface, k: Kit, m: UnityModel, options: Options): RenderElement | null {
  const cfg = configOf(m)
  const target = batchTarget(m)
  const allowed = batchAllowed({ lock: target.lock, bridgeUp: target.bridgeUp }).ok
  const tasks = jobTasks(cfg, allowed)
  if (!tasks.length && !m.jobs.length) return null
  const latest = [...m.jobs].reverse()
  const runningCount = m.jobs.filter(j => j.status === 'running').length
  const head = latest[0]
  const where = targetSentence(m)
  return Card(k, {
    key: 'jobs',
    hint: where.text,
    title: {
      icon: 'list',
      title: 'Aufgaben',
      pill: runningCount ? { text: `${runningCount} läuft`, tone: 'warn', glyph: '◷' } : undefined,
    },
    children: [
      ...tasks.map(t =>
        ListRow(k, {
          key: `task-${t.key}`,
          icon: t.kind === 'compile' ? 'hammer' : t.kind === 'build' ? 'box' : 'terminal',
          title: t.title,
          meta: t.meta,
          actions: [
            {
              key: t.key,
              label: 'Starten',
              icon: 'play',
              variant: 'secondary',
              // A project job may start Unity itself (e.g. node tools/unity.mjs): with an editor holding the project,
              // only after a second press.
              ...(t.kind === 'custom' && !allowed ? { confirm: 'Editor ist offen — trotzdem starten?' } : {}),
              onPress:
                t.kind === 'custom'
                  ? run($, t.name ?? '', () => startBatchJob($, options, 'custom', { custom: t.name }))
                  : t.kind === 'build'
                    ? run($, 'build', () => startBatchJob($, options, 'build', {}))
                    : run($, 'compile check', () => startBatchJob($, options, 'compile', {})),
            },
          ],
        }),
      ),
      tasks.length && latest.length ? Sentence(k, 'Letzte Läufe', { faint: true }) : null,
      ...latest.slice(0, 5).map(j =>
        ListRow(k, {
          key: `job-${j.key}`,
          status: jobGlyph(j.status),
          title: jobTitle(cfg, j),
          pill: {
            text: `${JOB_STATUS[j.status] ?? j.status}${j.exitCode !== undefined ? ` · Exit ${j.exitCode}` : ''}`,
            tone: JOB_TONE[j.status],
            glyph: false,
          },
          details: j.error ? () => [LogBox(k, { key: `job-${j.key}-error`, lines: [j.error ?? ''] })] : undefined,
          actions:
            j.status === 'running'
              ? [
                  {
                    key: `stop-${j.key}`,
                    label: 'Stoppen',
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
    ],
  })
}
