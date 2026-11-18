/** Tab Konsole (board Unity-Konsole): filter errors / warnings / all, hand an entry to Claude, clear. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { ModelConsoleEntry, UnityModel } from '../../types'
import { Actions, Card, EmptyState, ListRow, Sentence, type Action, type Kit } from '../../lib/ui'
import { bridgeCommand, patchModel, type Options } from '../state'
import { FIX_ASK, ago, fixWithClaude, msg, run } from './common'
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
  const shown = (filter === 'error' ? errors : filter === 'warning' ? warnings : m.console).slice(-15).reverse()
  const pick = (f: 'error' | 'warning' | 'all', label: string): Action => ({
    key: `con-filter-${f}`,
    label,
    variant: f === filter ? 'secondary' : 'link',
    onPress: () => void patchModel($, { consoleFilter: f }),
  })
  const tools: Action[] = [
    ...(m.bridge.isPlaying ? playActions($, m, options).filter(a => a.key === 'stop' || a.key === 'shot') : []),
    {
      key: 'console-clear',
      label: 'Leeren',
      variant: 'link',
      onPress: run($, 'clear', async () =>
        msg(await bridgeCommand($, options, { cmd: 'clear-console' }), 'Konsole geleert'),
      ),
    },
  ]
  return (
    <Box flexDirection="column" gap={1}>
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
      {Actions(k, 'con-tools', tools, 3)}
      {shown.length
        ? shown.map(c =>
            Card(k, {
              key: `con-${c.seq}`,
              tone: isError(c) ? 'bad' : undefined,
              children: [
                ListRow(k, {
                  key: `con-row-${c.seq}`,
                  status: isError(c) ? 'failed' : c.type === 'Warning' ? 'warning' : 'idle',
                  title: c.message.split('\n')[0] ?? '',
                  meta: c.time ? ago(now, c.time) : undefined,
                }),
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
                isError(c)
                  ? Actions(k, `con-acts-${c.seq}`, [
                      {
                        key: `fix-${c.seq}`,
                        label: 'An Claude geben',
                        icon: 'claude',
                        variant: 'secondary',
                        onPress: () =>
                          void fixWithClaude($, `${FIX_ASK.console} (${c.type})`, `${c.message}\n${c.stack ?? ''}`),
                      },
                    ])
                  : null,
              ],
            }),
          )
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
