/**
 * Tab Leistung (board Unity-Performance): record frame times in the running game (bridge perf_record), show the
 * series as an Svg line against the 16.6 ms budget, the costs inside the hitches, jump back to the spot.
 */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { ModelPerf, UnityModel } from '../../types'
import { isPlayError } from '../../lib/play'
import { Actions, Card, CardTitle, ProblemCard, Sentence, sanitize, truncate, type Kit } from '../../lib/ui'
import { gotoSpot, patchModel, type Options } from '../state'
import { bridgeUpdateAction, clockTime, dec, thousands } from './common'
import { measure, measuringSeconds } from './measure'
import { playActions } from './overview'

/** A spot as one short line: the provider's own `line`, else place / clock, else nothing. */
export function spotLine(spot: Record<string, unknown> | undefined): string | undefined {
  if (!spot) return undefined
  const place = spot.place as { name?: unknown } | null | undefined
  const parts = [
    typeof place?.name === 'string' ? place.name : undefined,
    typeof spot.x === 'number' && typeof spot.z === 'number'
      ? `${Math.round(spot.x)} / ${Math.round(spot.z)}`
      : undefined,
    [spot.season, spot.weather].filter(v => typeof v === 'string').join(', ') || undefined,
  ].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return typeof spot.line === 'string' ? spot.line : undefined
}

/** The frame-time series as a line chart: worst frame per bucket, dashed budget line. */
function chartSvg(k: Kit, p: ModelPerf): string {
  const W = 300
  const H = 80
  const top = Math.max(p.worst, p.budgetMs * 1.5, 1)
  const pts = p.series.length ? p.series : [p.avgMs]
  const xOf = (i: number) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W)
  const yOf = (v: number) => H - 2 - (Math.min(v, top) / top) * (H - 4)
  const line = pts.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
  const by = yOf(p.budgetMs).toFixed(1)
  const stroke = p.hitches ? k.t.tones.warn.fg : k.t.tones.ok.fg
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">` +
    `<line x1="0" y1="${by}" x2="${W}" y2="${by}" stroke="${k.t.faint}" stroke-width="1" stroke-dasharray="4 4"/>` +
    `<polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`
  )
}

/** Terminal fallback of the chart: one row of block characters. */
function sparkline(p: ModelPerf, width: number): string {
  const bars = '▁▂▃▄▅▆▇█'
  const pts = p.series.length ? p.series : [p.avgMs]
  const n = Math.max(1, Math.min(width, pts.length))
  const top = Math.max(p.worst, p.budgetMs * 1.5, 1)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const slice = pts.slice(Math.floor((i * pts.length) / n), Math.floor(((i + 1) * pts.length) / n) || undefined)
    const v = Math.max(...(slice.length ? slice : [0]))
    out.push(bars[Math.min(bars.length - 1, Math.floor((v / top) * bars.length))] ?? '▁')
  }
  return out.join('')
}

function costRow(k: Kit, key: string, name: string, ms: number): RenderElement {
  const { Box, Text } = k
  const value = `${dec(ms)} ms`
  if (!k.graphical) return Sentence(k, truncate(`${name} · ${value}`, k.cols))
  return (
    <Box key={key} flexDirection="row" gap={1}>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text size="footnote" color={k.t.text} wrap="truncate-end">
          {sanitize(name)}
        </Text>
      </Box>
      <Text size="footnote" color={k.t.muted} tabular>
        {value}
      </Text>
    </Box>
  )
}

function runCard($: EngineInterface, k: Kit, options: Options, at: number, p: ModelPerf): RenderElement {
  const { Svg, Box } = k
  const where = spotLine(p.spot)
  const costs = p.costs.slice(0, 5)
  return Card(k, {
    key: 'perf-run',
    children: [
      CardTitle(k, {
        icon: 'gauge',
        title: `Messung ${clockTime(at)}`,
        pill: p.hitches
          ? { text: `${p.hitches} ${p.hitches === 1 ? 'Ruckler' : 'Ruckler'}`, tone: 'warn' }
          : { text: 'flüssig', tone: 'ok' },
      }),
      Sentence(
        k,
        `${where ? `${where} · ` : ''}${dec(p.seconds, 0)} s · ${thousands(p.frames)} Frames${p.aborted ? ` · abgebrochen: ${p.aborted}` : ''}`,
        { faint: true },
      ),
      Sentence(k, `${dec(p.p50)} ms Median · ${dec(p.p95)} ms p95 · ${dec(p.worst)} ms schlimmster`),
      k.graphical && Svg ? (
        <Box key="perf-chart" flexDirection="column">
          <Svg
            source={chartSvg(k, p)}
            alt={`Frame-Zeiten: Median ${dec(p.p50)} ms, schlimmster ${dec(p.worst)} ms`}
            width={Math.min(560, Math.max(160, k.cols * 7))}
            height={80}
          />
        </Box>
      ) : (
        Sentence(k, sparkline(p, Math.max(8, k.cols - 2)))
      ),
      Sentence(k, `Gestrichelt: ${dec(p.budgetMs)} ms (60 Bilder/s)`, { faint: true }),
      costs.length ? Sentence(k, 'Was kostet in den Rucklern', { faint: true }) : null,
      ...costs.map((c, i) => costRow(k, `cost-${i}`, c.name, p.hitches ? c.hitchAvgMs : c.avgMs)),
      !costs.length
        ? Sentence(k, 'Das Projekt meldet keine Kosten (kein IClaudePerfSource registriert).', { faint: true })
        : null,
      Actions(k, 'perf-run-acts', [
        {
          key: 'perf-ask',
          label: 'Claude analysieren lassen',
          icon: 'claude',
          variant: 'secondary',
          onPress: () => void $.prompt.submit({ text: perfPrompt(at, p) }),
        },
        ...(p.spot
          ? [
              {
                key: 'perf-goto',
                label: 'Hinspringen',
                icon: 'pin' as const,
                variant: 'secondary' as const,
                onPress: () =>
                  void gotoSpot($, options, p.spot ?? {}).then(r =>
                    $.ui.toast(isPlayError(r) ? `Hinspringen ging nicht: ${r.error}` : 'Hingesprungen'),
                  ),
              },
            ]
          : []),
      ]),
    ],
  })
}

function perfPrompt(at: number, p: ModelPerf): string {
  return [
    `Analyse this Unity frame-time recording (${clockTime(at)}, ${dec(p.seconds, 0)} s, ${p.frames} frames, budget ${p.budgetMs} ms):`,
    `avg ${dec(p.avgMs)} ms, p50 ${dec(p.p50)}, p95 ${dec(p.p95)}, p99 ${dec(p.p99)}, worst ${dec(p.worst)}, ${p.hitches} hitches.`,
    p.costs.length
      ? `Costs (avg / max / avg in hitches / share of hitch time):\n${p.costs
          .map(
            c =>
              `- ${c.name}: ${dec(c.avgMs, 2)} / ${dec(c.maxMs)} / ${dec(c.hitchAvgMs)} ms / ${Math.round(c.hitchShare * 100)} %`,
          )
          .join('\n')}`
      : 'No named costs (no IClaudePerfSource).',
    p.spot ? `Spot: ${JSON.stringify(p.spot)}` : '',
    'Find the likely cause in the code and propose a fix.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function perfTab($: EngineInterface, k: Kit, m: UnityModel, options: Options): RenderElement {
  const { Box } = k
  const secs = measuringSeconds(m.busy)
  const measuring = secs !== undefined
  const playing = m.bridge.up && m.bridge.isPlaying
  const runs = m.perfRuns ?? []
  const err = m.perfError
  return (
    <Box flexDirection="column" gap={1}>
      {err
        ? ProblemCard(k, {
            key: 'perf-error',
            tone: err.code === 'no-provider' ? 'warn' : 'bad',
            title: err.code === 'not-playing' ? 'Messen geht nur im Play-Modus' : 'Messung ging nicht',
            cause: err.error,
            action:
              err.code === 'outdated'
                ? bridgeUpdateAction($, options)
                : err.code === 'not-playing' && m.bridge.up && !m.bridge.isPlaying
                  ? playActions($, m, options).find(a => a.key === 'play')
                  : undefined,
            more: [
              {
                key: 'perf-error-ok',
                label: 'Ausblenden',
                onPress: () => void patchModel($, { perfError: undefined }),
              },
            ],
          })
        : null}
      {Card(k, {
        key: 'perf-start',
        children: [
          CardTitle(k, {
            icon: 'activity',
            title: 'Es ruckelt gerade?',
            pill: measuring ? { text: `Messe ${secs} s …`, tone: 'warn', glyph: '◷' } : undefined,
          }),
          Sentence(
            k,
            measuring
              ? `Messe ${secs} s Leistung … Spiel einfach weiter, das Ergebnis erscheint hier.`
              : playing
              ? 'Lauf einfach weiter. Das Panel misst die nächsten Sekunden im laufenden Spiel und merkt sich, wo du warst.'
              : 'Messen geht im Play-Modus: starte das Spiel, lauf zur Stelle, dann messen.',
            { faint: true },
          ),
          measuring
            ? null
            : Actions(
                k,
                'perf-start-acts',
                playing
                  ? [
                      {
                        key: 'perf-10',
                        label: '10 s messen',
                        icon: 'gauge',
                        variant: 'primary',
                        primary: true,
                        onPress: () => void measure($, options, 10),
                      },
                      { key: 'perf-30', label: '30 s', variant: 'link', onPress: () => void measure($, options, 30) },
                    ]
                  : m.bridge.up
                    ? playActions($, m, options).filter(a => a.key === 'play')
                    : [],
              ),
        ],
      })}
      {runs[0] ? runCard($, k, options, runs[0].at, runs[0].perf) : null}
      {runs.length > 1
        ? Card(k, {
            key: 'perf-history',
            children: [
              CardTitle(k, { icon: 'list', title: 'Frühere Messungen', count: runs.length - 1 }),
              ...runs
                .slice(1)
                .map(r =>
                  Sentence(
                    k,
                    `${clockTime(r.at)}${spotLine(r.perf.spot) ? ` · ${spotLine(r.perf.spot)}` : ''} · p95 ${dec(r.perf.p95)} ms`,
                    { faint: true },
                  ),
                ),
            ],
          })
        : null}
    </Box>
  )
}
