/** Ziel und Einstellungen (board Unity-Ziel): where batch runs go, worktree, project config, guards. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel } from '../../types'
import { batchAllowed } from '../../lib/unity'
import { askAction, Card, KeyValue, ListRow, ProblemCard, type Action, type Kit } from '../../lib/ui'
import { batchTarget, configOf, createWorktree, useCheckout, useMainTarget, type Options } from '../state'
import { localStamp, run } from './common'

export function targetTab($: EngineInterface, k: Kit, m: UnityModel, options: Options): RenderElement {
  const { Box } = k
  const target = batchTarget(m)
  const allowed = batchAllowed({ lock: target.lock, bridgeUp: target.bridgeUp })
  const cfg = configOf(m)
  const wt = m.worktree
  const editorState = m.bridge.up
    ? 'Editor offen und verbunden'
    : m.lock === 'held'
      ? 'Editor offen, aber nicht verbunden'
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
        const stamp = localStamp(await $.clock.now())
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
              'Im Unity-Hub-Ordner liegt diese Version nicht. Hintergrund-Läufe brauchen sie; trag den Pfad zum Unity-Editor in den Plugin-Einstellungen ein.',
          })}
      {Card(k, {
        key: 'target',
        title: { icon: 'folder', title: 'Worauf Claude arbeitet' },
        children: [
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
          ...(m.checkouts ?? [])
            .filter(c => c.path !== wt?.path)
            .slice(0, 6)
            .map((c, i) =>
              ListRow(k, {
                key: `target-co-${i}`,
                status: 'idle',
                title: `${c.main ? 'Haupt-Checkout' : 'Worktree'} ${c.name}`,
                meta: c.branch ?? 'ohne Branch',
                actions: [
                  {
                    key: `target-use-${i}`,
                    label: 'Nutzen',
                    icon: 'branch',
                    variant: 'secondary',
                    onPress: run($, 'worktree', () => useCheckout($, options, c.path)),
                  },
                ],
              }),
            ),
          KeyValue(k, {
            key: 'target-kv',
            bare: true,
            rows: [
              { label: 'Pfad', value: target.root, copy: true },
              ...(cfg.worktreeDir ? [{ label: 'Worktrees', value: `${cfg.worktreeDir}/` }] : []),
            ],
          }),
        ],
        hint: !allowed.ok && allowed.reason ? allowed.reason : undefined,
        actions: acts,
      })}
      {m.configFound
        ? Card(k, {
            key: 'config',
            title: { icon: 'sliders', title: 'Projekt-Einstellungen', pill: { text: 'vorhanden', tone: 'ok' } },
            children: [
              KeyValue(k, {
                key: 'config-kv',
                bare: true,
                rows: [
                  { label: 'Test-Bereiche', value: String(m.presets.length) },
                  { label: 'Aufgaben', value: String(cfg.customJobs?.length ?? 0) },
                  ...(cfg.restoreBeforeCommit?.length
                    ? [{ label: 'Vor Commit zurück', value: cfg.restoreBeforeCommit.join(', '), wrap: true }]
                    : []),
                ],
              }),
            ],
          })
        : Card(k, {
            key: 'config',
            title: { icon: 'sliders', title: 'Projekt-Einstellungen', pill: { text: 'fehlt', tone: 'warn' } },
            hint: 'Mit einer .claude/unity.json kennt das Panel eure Test-Bereiche und Aufgaben. Claude schreibt einen Entwurf aus der Code-Karte; du entscheidest, ob er gespeichert wird.',
            actions: [
              askAction($, k, {
                key: 'config-draft',
                label: 'Entwurf erstellen',
                icon: 'wand',
                variant: 'primary',
                text: 'Führe /unity-init aus, zeig mir den Entwurf der .claude/unity.json und schreib ihn erst, wenn ich zustimme.',
              }),
            ],
          })}
      {Card(k, {
        key: 'guards',
        title: { icon: 'heart', title: 'Schutz' },
        children: [
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
        ],
        // Plugin options (userConfig): shown here, changed in the plugin's own settings.
        hint: 'Das sind Plugin-Einstellungen von unity; geändert werden sie unter /plugin.',
      })}
    </Box>
  )
}
