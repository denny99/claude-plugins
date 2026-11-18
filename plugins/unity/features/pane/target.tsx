/** Ziel und Einstellungen (board Unity-Ziel): where batch runs go, worktree, project config, guards. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel } from '../../types'
import { batchAllowed } from '../../lib/unity'
import { Actions, Card, CardTitle, KeyValue, ListRow, ProblemCard, Sentence, type Action, type Kit } from '../../lib/ui'
import { batchTarget, configOf, createWorktree, useMainTarget, type Options } from '../state'
import { run } from './common'

export function targetTab($: EngineInterface, k: Kit, m: UnityModel, options: Options): RenderElement {
  const { Box } = k
  const target = batchTarget(m)
  const allowed = batchAllowed({ lock: target.lock, bridgeUp: target.bridgeUp })
  const cfg = configOf(m)
  const wt = m.worktree
  const editorState = m.bridge.up
    ? 'Editor offen und verbunden'
    : m.lock === 'held'
      ? 'Editor offen, ohne Bridge'
      : m.lock === 'stale'
        ? 'alte Sperrdatei, kein Editor'
        : 'kein Editor'
  const acts: Action[] = []
  if (!wt || wt.status === 'failed')
    acts.push({
      key: 'worktree-new',
      label: 'Worktree anlegen',
      icon: 'branch',
      variant: 'secondary',
      onPress: run($, 'worktree', async () => {
        const stamp = new Date(await $.clock.now()).toISOString().slice(0, 16).replace(/[-:T]/g, '')
        return createWorktree($, options, `batch-${stamp}`)
      }),
    })
  if (wt)
    acts.push({
      key: 'worktree-main',
      label: 'Hauptprojekt nutzen',
      icon: 'folder',
      variant: 'secondary',
      onPress: run($, 'main target', async () => {
        await useMainTarget($)
        return 'Hintergrund-Läufe gehen wieder ins Hauptprojekt.'
      }),
    })
  const onOff = (v: boolean | undefined) =>
    v === false ? { text: 'aus', tone: 'neutral' as const, glyph: false as const } : { text: 'an', tone: 'ok' as const }
  return (
    <Box flexDirection="column" gap={1}>
      {m.editorPath
        ? null
        : ProblemCard(k, {
            key: 'no-editor',
            tone: 'warn',
            title: `Unity ${m.project?.version ?? ''} nicht gefunden`,
            cause:
              'Im Unity-Hub-Ordner liegt diese Version nicht. Hintergrund-Läufe brauchen sie; trag den Pfad in den Plugin-Einstellungen ein (Unity editor path).',
          })}
      {Card(k, {
        key: 'target',
        children: [
          CardTitle(k, { icon: 'folder', title: 'Worauf Claude arbeitet' }),
          ListRow(k, {
            key: 'target-main',
            status: target.worktree ? 'idle' : allowed.ok || m.bridge.up ? 'ok' : 'warning',
            title: `Hauptprojekt${target.worktree ? '' : ' (aktiv)'}`,
            meta: editorState,
          }),
          wt
            ? ListRow(k, {
                key: 'target-wt',
                status: wt.status === 'copying' ? 'running' : wt.status === 'failed' ? 'failed' : 'ok',
                title: `Worktree ${wt.name}${target.worktree ? ' (aktiv)' : ''}`,
                meta:
                  wt.status === 'copying'
                    ? 'kopiert Library …'
                    : wt.status === 'failed'
                      ? (wt.error ?? 'fehlgeschlagen')
                      : allowed.ok
                        ? 'kein Editor · Tests laufen im Hintergrund'
                        : 'gesperrt: ein anderer Editor hat es offen',
              })
            : null,
          !allowed.ok && allowed.reason ? Sentence(k, allowed.reason, { faint: true }) : null,
          KeyValue(k, {
            key: 'target-kv',
            rows: [
              { label: 'Pfad', value: target.root, copy: true },
              ...(cfg.worktreeDir ? [{ label: 'Worktrees', value: `${cfg.worktreeDir}/` }] : []),
            ],
          }),
          acts.length ? Actions(k, 'target-acts', acts) : null,
        ],
      })}
      {m.configFound
        ? Card(k, {
            key: 'config',
            children: [
              CardTitle(k, { icon: 'sliders', title: 'Projekt-Einstellungen', pill: { text: 'da', tone: 'ok' } }),
              KeyValue(k, {
                key: 'config-kv',
                rows: [
                  { label: 'Test-Bereiche', value: String(m.presets.length) },
                  { label: 'Werkzeuge', value: String(cfg.customJobs?.length ?? 0) },
                  ...(cfg.restoreBeforeCommit?.length
                    ? [{ label: 'Vor Commit zurück', value: cfg.restoreBeforeCommit.join(', ') }]
                    : []),
                ],
              }),
            ],
          })
        : Card(k, {
            key: 'config',
            children: [
              CardTitle(k, { icon: 'sliders', title: 'Projekt-Einstellungen', pill: { text: 'fehlt', tone: 'warn' } }),
              Sentence(
                k,
                'Mit einer .claude/unity.json kennt das Panel eure Test-Bereiche und Werkzeuge. Claude schreibt einen Entwurf aus der Code-Karte; du entscheidest, ob er gespeichert wird.',
                { faint: true },
              ),
              Actions(k, 'config-acts', [
                {
                  key: 'config-draft',
                  label: 'Entwurf erstellen',
                  icon: 'wand',
                  variant: 'primary',
                  onPress: () =>
                    void $.prompt.submit({
                      text: 'Run /unity-init, show me the drafted .claude/unity.json and write it only after I approve.',
                    }),
                },
              ]),
            ],
          })}
      {Card(k, {
        key: 'guards',
        children: [
          CardTitle(k, { icon: 'heart', title: 'Schutz' }),
          ListRow(k, {
            key: 'guard-compile',
            icon: 'hammer',
            title: 'Nach C#-Änderung kompilieren',
            meta: 'Fehler landen direkt bei Claude',
            pill: onOff(options.compileGate),
          }),
          ListRow(k, {
            key: 'guard-meta',
            icon: 'folder',
            title: '.meta-Dateien mitnehmen',
            meta: 'Verschieben ohne .meta wird abgelehnt',
            pill: onOff(options.metaGuard),
          }),
          ListRow(k, {
            key: 'guard-commit',
            icon: 'commit',
            title: 'Vor Commit zurücksetzen',
            meta: 'z. B. Dateien, die Unity selbst ändert',
            pill: onOff(options.commitGuard),
          }),
          Sentence(k, 'Umschalten in den Plugin-Einstellungen.', { faint: true }),
        ],
      })}
    </Box>
  )
}
