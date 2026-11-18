/** Tab Konsole (board Unity-Konsole): filter errors / warnings / all, hand an entry to Claude, clear. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { ModelConsoleEntry, UnityModel } from '../../types'
import { ActionButton, Actions, Card, EmptyState, ListRow, Sentence, type Action, type Kit } from '../../lib/ui'
import { bridgeCommand, patchModel, type Options } from '../state'
import { ago, collapseConsole, consoleOrigin, consolePrompt, msg, run } from './common'
import { playActions } from './overview'

const isError = (c: ModelConsoleEntry): boolean => c.type === 'Error' || c.type === 'Exception' || c.type === 'Assert'

export function consoleTab($: EngineInterface, k: Kit, m: UnityModel, options: Options, now: number): RenderElement {
  const { Box } = k
  if (!m.bridge.up)
    return EmptyState(k, {
      icon: 'terminal',
      title: 'Keine Konsole ohne Editor',
      text: 'Die Konsole kommt direkt aus dem Unity-Editor. Öffne den Editor, dann steht sie hier.',
    })
  const filter = m.consoleFilter ?? 'error'
  const errors = m.console.filter(isError)
  const warnings = m.console.filter(c => c.type === 'Warning')
  const groups = collapseConsole(filter === 'error' ? errors : filter === 'warning' ? warnings : m.console)
  const shown = groups.slice(-15).reverse()
  const pick = (f: 'error' | 'warning' | 'all', label: string): Action => ({
    key: `con-filter-${f}`,
    label,
    variant: f === filter ? 'secondary' : 'link',
    onPress: () => void patchModel($, { consoleFilter: f }),
  })
  const clear: Action = {
    key: 'console-clear',
    label: 'Leeren',
    icon: 'trash',
    variant: 'secondary',
    onPress: run($, 'clear', async () =>
      msg(await bridgeCommand($, options, { cmd: 'clear-console' }), 'Konsole geleert'),
    ),
  }
  const tools: Action[] = m.bridge.isPlaying
    ? playActions($, m, options).filter(a => a.key === 'stop' || a.key === 'shot')
    : []
  const handable = filter === 'all' ? [] : groups
  const kind = filter === 'error' ? 'Fehler' : 'Warnungen'
  if (handable.length > 1)
    tools.push({
      key: 'console-fix-all',
      label: `Alle ${handable.length} ${kind} an Claude geben`,
      icon: 'claude',
      variant: 'secondary',
      onPress: () =>
        void $.prompt.submit({ text: consolePrompt(handable.slice(-20)) }),
    })
  return (
    <Box flexDirection="column" gap={1}>
      <Box key="con-filter-row" flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
        {Actions(
          k,
          'con-filter',
          [
            pick('error', `Fehler · ${errors.length}`),
            pick('warning', `Warnungen · ${warnings.length}`),
            pick('all', 'Alles'),
          ],
          3,
        )}
        <Box flexGrow={1} />
        {ActionButton(k, clear)}
      </Box>
      {tools.length ? Actions(k, 'con-tools', tools, 3) : null}
      {shown.length
        ? shown.map(({ entry: c, count }) => {
            const origin = consoleOrigin(c)
            const fromPackage = !!origin?.pkg
            const when = c.time ? ago(now, c.time) : undefined
            return Card(k, {
              key: `con-${c.seq}`,
              tone: isError(c) && !fromPackage ? 'bad' : undefined,
              children: [
                ListRow(k, {
                  key: `con-row-${c.seq}`,
                  status: isError(c) ? 'failed' : c.type === 'Warning' ? 'warning' : 'idle',
                  title: c.message.split('\n')[0] ?? '',
                  meta: [count > 1 ? `×${count}` : '', when ?? ''].filter(Boolean).join(' · ') || undefined,
                }),
                origin
                  ? Sentence(
                      k,
                      origin.pkg
                        ? `Aus Paket ${origin.pkg} · ${origin.file} — nicht aus deinem Spiel-Code`
                        : `In ${origin.file}`,
                      { faint: true, tone: origin.pkg ? 'info' : undefined },
                    )
                  : null,
                c.message.includes('\n')
                  ? Sentence(k, c.message.split('\n').slice(1).join(' ').trim(), { faint: true })
                  : null,
                c.stack
                  ? Sentence(
                      k,
                      c.stack
                        .split('\n')
                        .map(l => l.trim())
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(' · '),
                      { faint: true },
                    )
                  : null,
                k.narrow && (count > 1 || when)
                  ? Sentence(k, [count > 1 ? `×${count}` : '', when ?? ''].filter(Boolean).join(' · '), { faint: true })
                  : null,
                c.type !== 'Log'
                  ? Actions(k, `con-acts-${c.seq}`, [
                      {
                        key: `fix-${c.seq}`,
                        label: 'An Claude geben',
                        icon: 'claude',
                        variant: 'secondary',
                        onPress: () => void $.prompt.submit({ text: consolePrompt([{ entry: c, count }]) }),
                      },
                    ])
                  : null,
              ],
            })
          })
        : EmptyState(k, {
            icon: 'check',
            title: filter === 'error' ? 'Keine Fehler' : filter === 'warning' ? 'Keine Warnungen' : 'Konsole ist leer',
            text: 'Seit dem letzten Kompilieren ist nichts dazugekommen.',
          })}
      {filter === 'error'
        ? Sentence(k, 'Warnungen und Infos sind ausgeblendet. Claude sieht immer alles.', { faint: true })
        : null}
    </Box>
  )
}
