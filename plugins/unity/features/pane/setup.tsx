/** Setup state (board Unity-Setup): no editor bridge — two steps, batch runs without an editor, install elsewhere. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel } from '../../types'
import { batchAllowed } from '../../lib/unity'
import { Actions, Card, CardTitle, CopyButton, Sentence, Stepper, type Kit } from '../../lib/ui'
import { batchTarget, runTests, type Options } from '../state'
import { BRIDGE_GIT_URL, BRIDGE_README, run, type Extra } from './common'
import { jobsCard, testsCard } from './overview'

const BRIDGE_PACKAGE = 'com.denny99.claude-bridge'

async function bridgeInManifest($: EngineInterface, root: string): Promise<boolean> {
  try {
    return (await $.fs.read(`${root}/Packages/manifest.json`)).includes(BRIDGE_PACKAGE)
  } catch {
    return false
  }
}

export async function setupView(
  $: EngineInterface,
  k: Kit,
  x: Extra,
  m: UnityModel,
  options: Options,
  now: number,
): Promise<RenderElement> {
  const { Box } = k
  const root = m.project?.root ?? ''
  const name = m.project?.name ?? 'dem Projekt'
  const installed = await bridgeInManifest($, root)
  const stale = m.bridge.why === 'stale'
  const target = batchTarget(m)
  const batchOk = batchAllowed({ lock: target.lock, bridgeUp: false }).ok
  return (
    <Box flexDirection="column" gap={1}>
      {Card(k, {
        key: 'setup',
        tone: 'warn',
        children: [
          CardTitle(k, { icon: 'plug', title: 'Claude sieht den Unity-Editor nicht', tone: 'warn' }),
          Sentence(
            k,
            stale
              ? 'Der Editor antwortet nicht mehr: geschlossen, abgestürzt oder gerade beschäftigt (Import, Kompilieren).'
              : 'Ohne die Verbindung kann Claude nicht kompilieren lassen, die Konsole lesen oder Screenshots machen. Zwei Schritte:',
            { faint: true },
          ),
          Stepper(k, {
            key: 'setup-steps',
            steps: [
              {
                title: 'Bridge-Paket ist im Projekt',
                detail: installed
                  ? 'steht in Packages/manifest.json'
                  : 'Package Manager → + → Add package from git URL',
                state: installed ? 'done' : 'active',
              },
              {
                title: `Unity-Editor mit ${name} öffnen`,
                detail: 'Sobald er fertig importiert hat, wird der Status hier grün.',
                state: installed ? 'active' : 'todo',
              },
            ],
          }),
        ],
      })}
      {Card(k, {
        key: 'setup-batch',
        children: [
          CardTitle(k, { icon: 'info', title: 'Geht auch ohne Editor', tone: 'info' }),
          Sentence(
            k,
            batchOk
              ? 'Tests laufen dann im Hintergrund ohne Fenster. Das dauert länger, blockiert aber nichts.'
              : 'Gerade nicht: ein Editor hält das Projekt (Temp/UnityLockfile). Schließ ihn oder nimm einen Worktree.',
            { faint: true },
          ),
          batchOk
            ? Actions(k, 'setup-batch-acts', [
                {
                  key: 'edit-tests',
                  label: 'EditMode-Tests',
                  icon: 'play',
                  variant: 'secondary',
                  onPress: run($, 'EditMode tests', () => runTests($, options, 'EditMode', undefined, 0)),
                },
                {
                  key: 'play-tests',
                  label: 'PlayMode-Tests',
                  icon: 'play',
                  variant: 'secondary',
                  onPress: run($, 'PlayMode tests', () => runTests($, options, 'PlayMode', undefined, 0)),
                },
              ])
            : null,
        ],
      })}
      {m.tests ? testsCard($, k, m, options, now) : null}
      {jobsCard($, k, m, options)}
      {Card(k, {
        key: 'setup-elsewhere',
        children: [
          CardTitle(k, { icon: 'download', title: 'Bridge in einem anderen Projekt einrichten' }),
          Sentence(
            k,
            'Package Manager → + → Add package from git URL. Die Adresse liegt in der Zwischenablage, wenn du kopierst.',
            { faint: true },
          ),
          <Box key="setup-links" flexDirection="row" gap={1} flexWrap="wrap">
            {CopyButton(k, { key: 'copy-bridge-url', text: BRIDGE_GIT_URL, label: 'Paket-Adresse kopieren' })}
            <x.Link href={BRIDGE_README} label="Anleitung" />
          </Box>,
        ],
      })}
    </Box>
  )
}
