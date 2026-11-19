/** Tab Konsole (board Unity-Konsole): filter errors / warnings / all, hand an entry to Claude, clear. */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { ModelConsoleEntry, UnityModel } from '../../types'
import { askAction, Card, EmptyState, ListRow, LogBox, Segment, Sentence, type Action, type Kit } from '../../lib/ui'
import { bridgeCommand, patchModel, type Options } from '../state'
import { ago, collapseConsole, consoleOrigin, consolePrompt, msg, run } from './common'

type Filter = 'error' | 'warning' | 'all'

const isError = (c: ModelConsoleEntry): boolean => c.type === 'Error' || c.type === 'Exception' || c.type === 'Assert'

const stackLines = (c: ModelConsoleEntry): string[] =>
  (c.stack ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

export function consoleTab($: EngineInterface, k: Kit, m: UnityModel, options: Options, now: number): RenderElement {
  if (!m.bridge.up)
    return EmptyState(k, {
      icon: 'terminal',
      title: 'Keine Konsole ohne Editor',
      text: 'Die Konsole kommt direkt aus dem Unity-Editor. Öffne den Editor, dann steht sie hier.',
    })
  const filter: Filter = m.consoleFilter ?? 'error'
  const errors = m.console.filter(isError)
  const warnings = m.console.filter(c => c.type === 'Warning')
  const groups = collapseConsole(filter === 'error' ? errors : filter === 'warning' ? warnings : m.console)
  const shown = groups.slice(-15).reverse()
  const handable = filter === 'all' ? [] : groups
  const kind = filter === 'error' ? 'Fehler' : 'Warnungen'
  // One action row for the whole card. Play control (Stoppen, Screenshot) lives in the overview only.
  const actions: Action[] = []
  if (handable.length > 1)
    actions.push(
      askAction($, k, {
        key: 'console-fix-all',
        label: `${kind} an Claude`,
        text: consolePrompt(handable.slice(-20)),
      }),
    )
  if (m.console.length)
    actions.push({
      key: 'console-clear',
      label: 'Leeren',
      variant: 'secondary',
      danger: true,
      confirm: 'Konsole im Editor leeren? Die Einträge sind danach weg.',
      onPress: run($, 'clear', async () =>
        msg(await bridgeCommand($, options, { cmd: 'clear-console' }), 'Konsole geleert'),
      ),
    })
  return Card(k, {
    key: 'console',
    title: { icon: 'terminal', title: 'Konsole', count: groups.length || undefined },
    filter: Segment<Filter>(k, {
      key: 'con-filter',
      options: [
        { id: 'error', label: 'Fehler', count: errors.length },
        { id: 'warning', label: 'Warnungen', count: warnings.length },
        { id: 'all', label: 'Alles' },
      ],
      active: filter,
      onSelect: f => void patchModel($, { consoleFilter: f }),
      track: true,
    }),
    children: shown.map(({ entry: c, count }) => {
      const origin = consoleOrigin(c)
      const when = c.time ? ago(now, c.time) : undefined
      const stack = stackLines(c)
      return ListRow(k, {
        key: `con-row-${c.seq}`,
        status: isError(c) ? 'failed' : c.type === 'Warning' ? 'warning' : 'idle',
        // the row is one line and cuts a long message with „…“; the whole message is the first thing in the details
        title: c.message.split('\n')[0] ?? '',
        meta: [count > 1 ? `×${count}` : '', when ?? ''].filter(Boolean).join(' · ') || undefined,
        pill: origin?.pkg ? { text: 'Paket', tone: 'info', glyph: false } : undefined,
        actions:
          c.type !== 'Log'
            ? [askAction($, k, { key: `fix-${c.seq}`, label: 'An Claude', text: consolePrompt([{ entry: c, count }]) })]
            : undefined,
        details: () => [
          // wrapped text, not a LogBox: a LogBox cuts each line at the pane width and keeps only the last rows
          ...c.message
            .split('\n')
            .filter(l => l.trim())
            .map(line => Sentence(k, line)),
          origin
            ? Sentence(
                k,
                origin.pkg
                  ? `Aus Paket ${origin.pkg} · ${origin.file} — nicht aus deinem Spiel-Code`
                  : `In ${origin.file}`,
                { faint: true, tone: origin.pkg ? 'info' : undefined },
              )
            : null,
          stack.length ? LogBox(k, { key: `con-stack-${c.seq}`, lines: stack, rows: 8 }) : null,
        ],
      })
    }),
    empty: shown.length
      ? undefined
      : filter === 'error'
        ? 'Keine Fehler seit dem letzten Kompilieren.'
        : filter === 'warning'
          ? 'Keine Warnungen seit dem letzten Kompilieren.'
          : 'Die Konsole ist leer.',
    hint: filter === 'error' ? 'Warnungen und Infos sind ausgeblendet. Claude sieht immer alles.' : undefined,
    actions,
  })
}
