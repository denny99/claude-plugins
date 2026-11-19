/** Setup state (board Unity-Setup): no editor bridge — two steps, batch runs without an editor, install elsewhere. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { UnityModel } from '../../types'
import { batchAllowed } from '../../lib/unity'
import { Card, KeyValue, openAction, Sentence, Stepper, type Kit } from '../../lib/ui'
import { batchTarget, bridgeOutdated, bridgeOutdatedTitle, editorBusyWithTests, type Options } from '../state'
import { BRIDGE_GIT_URL_TAGGED, BRIDGE_README, bridgeUpdateCard, selectTab, type Extra } from './common'
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
  const where = m.project?.label
  const installed = await bridgeInManifest($, root)
  const stale = m.bridge.why === 'stale'
  const target = batchTarget(m)
  const batchOk = batchAllowed({ lock: target.lock, bridgeUp: false }).ok
  const old = bridgeOutdated(m)
  const busy = editorBusyWithTests(m)
  const away = m.editorElsewhere
  return (
    <Box flexDirection="column" gap={1}>
      {away
        ? Card(k, {
            key: 'setup-elsewhere-editor',
            tone: 'info',
            title: { icon: 'info', title: 'Editor in anderem Checkout', tone: 'info' },
            children: [
              Sentence(
                k,
                `Der Editor läuft für ${away.name}${away.main ? ' (Haupt-Checkout)' : ''}, diese Session ist ${away.hereMain ? 'im Haupt-Checkout' : 'im Worktree'} ${away.here}.`,
              ),
              KeyValue(k, {
                key: 'setup-elsewhere-kv',
                bare: true,
                rows: [{ label: 'Projekt', value: away.project, copy: true }],
              }),
            ],
            hint: 'Claude sieht nur den Editor dieses Checkouts. Öffne diesen Ordner in Unity, oder arbeite im Checkout, den der Editor offen hat. Tests ohne Editor laufen hier trotzdem im Hintergrund.',
          })
        : null}
      {old ? bridgeUpdateCard($, k, m, options) : null}
      {Card(k, {
        key: 'setup',
        tone: 'warn',
        title: { icon: 'plug', title: 'Claude sieht den Unity-Editor nicht', tone: 'warn' },
        children: [
          Sentence(
            k,
            busy
              ? 'Editor beschäftigt (Tests laufen) — gleich wieder da. Solange die Tests laufen, antwortet er nicht.'
              : stale
                ? 'Der Editor antwortet nicht mehr: geschlossen, abgestürzt oder gerade beschäftigt (Import, Kompilieren).'
                : 'Ohne die Verbindung kann Claude nicht kompilieren lassen, die Konsole lesen oder Screenshots machen. Zwei Schritte:',
            { faint: true },
          ),
          Stepper(k, {
            key: 'setup-steps',
            steps: [
              {
                title: old
                  ? bridgeOutdatedTitle(m)
                  : 'Bridge-Paket ist im Projekt',
                detail: old
                  ? 'Bridge aktualisieren (Karte oben)'
                  : installed
                    ? 'steht in Packages/manifest.json'
                    : 'fehlt noch in Packages/manifest.json',
                state: old ? 'failed' : installed ? 'done' : 'active',
              },
              {
                title: where ? `Projekt ${where} im Unity-Editor öffnen` : 'Projekt im Unity-Editor öffnen',
                detail: 'Sobald er fertig importiert hat, wird der Status hier grün.',
                state: installed ? 'active' : 'todo',
              },
            ],
          }),
        ],
      })}
      {Card(k, {
        key: 'setup-batch',
        title: { icon: 'info', title: 'Geht auch ohne Editor', tone: 'info' },
        children: [
          Sentence(
            k,
            batchOk
              ? 'Tests laufen dann im Hintergrund ohne Fenster. Das dauert länger, blockiert aber nichts.'
              : 'Gerade nicht: ein Editor hat das Projekt offen. Schließ ihn oder nimm einen Worktree.',
            { faint: true },
          ),
        ],
        hint: batchOk ? 'Die ganze Suite kann ohne Library 30–60 min dauern, ein Bereich geht schneller.' : undefined,
        actions: batchOk
          ? [{ key: 'setup-choose-tests', label: 'Zu Tests', variant: 'link', onPress: selectTab($, 'tests') }]
          : [],
      })}
      {m.tests ? testsCard($, k, m, options, now) : null}
      {jobsCard($, k, m, options)}
      {/* Only while this project has no bridge: once installed here, the card is noise. */}
      {installed
        ? null
        : Card(k, {
            key: 'setup-elsewhere',
            title: { icon: 'download', title: 'Bridge in einem anderen Projekt einrichten' },
            // Unity's own menu names stay English: that is what the editor shows.
            hint: 'In Unity fügst du die Adresse im Package Manager unter „Add package from git URL“ ein.',
            actions: [
              {
                key: 'copy-bridge-url',
                label: 'Adresse kopieren',
                variant: 'link',
                // the press event names the surface the clipboard belongs to
                onPress: ((e?: { surface?: string }) => k.copy(BRIDGE_GIT_URL_TAGGED, e?.surface)) as () => void,
              },
              openAction(k, { key: 'bridge-readme', href: BRIDGE_README, label: 'Anleitung' }),
            ],
          })}
    </Box>
  )
}
