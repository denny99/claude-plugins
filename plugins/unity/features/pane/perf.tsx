/**
 * Tab Leistung (board Unity-Performance): record frame times in the running game (bridge perf_record), show the
 * series as an Svg line against the 16.6 ms budget, the costs inside the hitches, jump back to the spot.
 */
import type { EngineInterface, RenderElement } from 'claude-code'

import type { ModelPerf, UnityModel } from '../../types'
import { versionOlder } from '../../lib/bridge'
import { canFront, FRONT_HINT } from '../../lib/front'
import { knownPlatform } from '../../lib/host'
import { isPlayError } from '../../lib/play'
import { schemeSvg } from '../../lib/theme'
import { Actions, askAction, Card, type Action, CardTitle, ProblemCard, Sentence, sanitize, truncate, type Kit } from '../../lib/ui'
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

/** Top of the chart's y axis: the worst frame, but at most 4× the budget so the budget line stays readable. */
export function chartTop(p: Pick<ModelPerf, 'worst' | 'budgetMs'>): number {
  return Math.min(Math.max(p.worst, p.budgetMs * 1.5, 1), Math.max(p.budgetMs * 4, 1))
}

/**
 * The frame-time series as a line chart: worst frame per bucket, the budget as a dashed line with its value, the y
 * axis capped at {@link chartTop}; frames above it are drawn at the top with a mark and the worst one's value.
 */
export function chartSvg(k: Kit, p: ModelPerf, W = 300): string {
  const H = 96
  const left = 34 // room for the axis labels
  const top = chartTop(p)
  const pts = p.series.length ? p.series : [p.avgMs]
  const xOf = (i: number) => left + (pts.length === 1 ? (W - left) / 2 : (i / (pts.length - 1)) * (W - left - 2))
  const yOf = (v: number) => H - 2 - (Math.min(v, top) / top) * (H - 14)
  const line = pts.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
  const by = yOf(p.budgetMs).toFixed(1)
  const stroke = p.hitches ? k.t.tones.warn.fg : k.t.tones.ok.fg
  const font = `font-family="-apple-system, Segoe UI, sans-serif" font-size="9" fill="${k.t.faint}"`
  const over = pts.map((v, i) => ({ v, i })).filter(x => x.v > top)
  const worst = over.reduce<{ v: number; i: number } | undefined>((w, x) => (!w || x.v > w.v ? x : w), undefined)
  const marks = over
    .map(
      x =>
        `<path d="M${(xOf(x.i) - 3).toFixed(1)},9 L${xOf(x.i).toFixed(1)},4 L${(xOf(x.i) + 3).toFixed(1)},9 z" fill="${k.t.tones.bad.fg}"/>`,
    )
    .join('')
  const worstLabel = worst
    ? `<text x="${Math.min(W - 2, xOf(worst.i) + 5).toFixed(1)}" y="10" ${font} text-anchor="${xOf(worst.i) > W - 60 ? 'end' : 'start'}">${dec(worst.v, 0)} ms</text>`
    : ''
  return schemeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
      `<line x1="${left}" y1="${H - 2}" x2="${W}" y2="${H - 2}" stroke="${k.t.line}" stroke-width="1"/>` +
      `<text x="${left - 4}" y="${H - 2}" ${font} text-anchor="end">0</text>` +
      `<text x="${left - 4}" y="${(H - 2 - (H - 14) + 4).toFixed(1)}" ${font} text-anchor="end">${dec(top, 0)} ms</text>` +
      `<line x1="${left}" y1="${by}" x2="${W}" y2="${by}" stroke="${k.t.muted}" stroke-width="1.5" stroke-dasharray="5 3"/>` +
      `<text x="${left - 4}" y="${(Number(by) + 3).toFixed(1)}" ${font} text-anchor="end">${dec(p.budgetMs)}</text>` +
      `<polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>` +
      marks +
      worstLabel +
      `</svg>`,
  )
}

/** Terminal fallback of the chart: one row of block characters. */
function sparkline(p: ModelPerf, width: number): string {
  const bars = '▁▂▃▄▅▆▇█'
  const pts = p.series.length ? p.series : [p.avgMs]
  const n = Math.max(1, Math.min(width, pts.length))
  const top = chartTop(p)
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
        <Text size="footnote" color={k.t.text} wrap="wrap">
          {sanitize(name)}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text size="footnote" color={k.t.muted} tabular>
          {value}
        </Text>
      </Box>
    </Box>
  )
}

/** The chart across the card: the body's width in CSS px (about 7.5 px per column) less the card's padding. */
function chartWidth(k: Kit): number {
  return Math.round(Math.min(1400, Math.max(160, k.cols * 7.5 - 32)))
}

/** Under this many frames per second a background recording counts as throttled. */
export const THROTTLED_FPS = 20

export const THROTTLED_TEXT = 'Unity lag im Hintergrund und lief gedrosselt – Werte nicht aussagekräftig'
export const KEPT_TEXT = 'Unity lag im Hintergrund, lief aber ungedrosselt weiter – Werte gelten.'

/**
 * Bridge 0.4+: how Unity ran while it was not in front. `throttled` under {@link THROTTLED_FPS} frames per second of
 * wall clock, or clearly shorter than asked (under 80 %, not aborted); `kept` it ran on at normal speed; undefined
 * when Unity was in front (or the bridge does not say).
 */
export function perfBackground(
  p: Pick<ModelPerf, 'background' | 'frames' | 'seconds' | 'wallSeconds' | 'requestedSeconds' | 'aborted'>,
): 'throttled' | 'kept' | undefined {
  if (!p.background) return undefined
  const wall = p.wallSeconds ?? p.seconds
  const fps = wall > 0 ? p.frames / wall : 0
  const short = !p.aborted && p.requestedSeconds > 0 && wall < p.requestedSeconds * 0.8
  return fps < THROTTLED_FPS || short ? 'throttled' : 'kept'
}

/** „9 Bilder/s · 1 s von 10 s“: what made a background recording count as throttled. */
function throttleDetail(p: ModelPerf): string {
  const wall = p.wallSeconds ?? p.seconds
  const fps = wall > 0 ? p.frames / wall : 0
  return `${dec(fps, 0)} Bilder/s · ${dec(wall, 1)} s von ${dec(p.requestedSeconds, 0)} s`
}

/** „Unity vorn messen“ (macOS only): Unity to the front, record, the focus back to the app that was in front. */
export function frontMeasureAction(
  $: EngineInterface,
  options: Options,
  seconds: number,
  variant: Action['variant'] = 'link',
): Action {
  return {
    key: variant === 'link' ? 'perf-front' : 'perf-front-run',
    label: 'Unity vorn messen',
    ...(variant === 'link' ? {} : { icon: 'gauge' as const }),
    variant,
    onPress: () => void measure($, options, Math.max(1, Math.round(seconds)), false, true),
  }
}

function runCard(
  $: EngineInterface,
  k: Kit,
  options: Options,
  at: number,
  p: ModelPerf,
  bridgeVersion?: string,
): RenderElement {
  const { Svg, Box } = k
  const where = spotLine(p.spot)
  const costs = p.costs.slice(0, 5)
  const bg = perfBackground(p)
  const throttled = bg === 'throttled'
  const front = canFront(knownPlatform())
  return Card(k, {
    key: 'perf-run',
    children: [
      CardTitle(k, {
        icon: 'gauge',
        title: `Messung ${clockTime(at)}`,
        pill: throttled
          ? { text: 'nicht aussagekräftig', tone: 'bad' }
          : p.hitches
            ? { text: `${p.hitches} ${p.hitches === 1 ? 'Ruckler' : 'Ruckler'}`, tone: 'warn' }
            : { text: 'flüssig', tone: 'ok' },
      }),
      throttled ? Sentence(k, `${THROTTLED_TEXT} (${throttleDetail(p)}).`, { tone: 'bad' }) : null,
      throttled && !front ? Sentence(k, `${FRONT_HINT} und neu messen.`, { faint: true }) : null,
      bg === 'kept' ? Sentence(k, KEPT_TEXT, { faint: true }) : null,
      Sentence(
        k,
        `${where ? `${where} · ` : ''}${perfLength(p, bridgeVersion)} · ${thousands(p.frames)} Frames${p.aborted ? ` · abgebrochen: ${p.aborted}` : ''}`,
        { faint: true },
      ),
      outlierNote(p) ? Sentence(k, outlierNote(p)!, { faint: true }) : null,
      Sentence(
        k,
        `${throttled ? 'Gedrosselt gemessen: ' : ''}${dec(p.p50)} ms Median · ${dec(p.p95)} ms p95 · ${dec(p.worst)} ms schlimmster`,
        throttled ? { faint: true } : {},
      ),
      k.graphical && Svg ? (
        <Box key="perf-chart" flexDirection="column">
          <Svg
            source={chartSvg(k, p, chartWidth(k))}
            alt={`Frame-Zeiten: Median ${dec(p.p50)} ms, schlimmster ${dec(p.worst)} ms`}
            width={chartWidth(k)}
            height={96}
          />
        </Box>
      ) : (
        Sentence(k, sparkline(p, Math.max(8, k.cols - 2)))
      ),
      Sentence(
        k,
        `Gestrichelt: ${dec(p.budgetMs)} ms (60 Bilder/s) · y-Achse bis ${dec(chartTop(p), 0)} ms${p.worst > chartTop(p) ? ', höhere Frames als ▲ oben' : ''}`,
        { faint: true },
      ),
      costs.length ? Sentence(k, 'Was kostet in den Rucklern', { faint: true }) : null,
      ...costs.map((c, i) => costRow(k, `cost-${i}`, c.name, p.hitches ? c.hitchAvgMs : c.avgMs)),
      !costs.length ? Sentence(k, noCostsText(p), { faint: true }) : null,
      Actions(k, 'perf-run-acts', [
        ...(throttled && front ? [frontMeasureAction($, options, p.requestedSeconds || 10, 'primary')] : []),
        askAction($, k, {
          key: 'perf-ask',
          label: 'Claude analysieren lassen',
          text: perfPrompt(at, p),
          ...(throttled ? { variant: 'secondary' as const } : {}),
        }),
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
      p.spot ? null : Sentence(k, NO_SPOT, { faint: true }),
    ],
  })
}

export const NO_SPOT = 'Stelle unbekannt: das Projekt meldet bei der Messung keine Stelle, darum kein Hinspringen.'

/**
 * The recording's length; says when it ran clearly shorter than asked (under 95 %, so 9,5 of 10 s stays quiet). Only a
 * bridge older than 0.3.0 (or one that does not name its version) gets the advice to update: those ended on summed
 * frame times. A current bridge measures real time, so a gap there is named neutrally.
 */
export function perfLength(
  p: Pick<ModelPerf, 'seconds' | 'requestedSeconds' | 'wallSeconds' | 'aborted'>,
  bridgeVersion?: string,
): string {
  const s = p.wallSeconds ?? p.seconds
  const short = !p.aborted && p.requestedSeconds > 0 && s < p.requestedSeconds * 0.95
  if (!short) return `${dec(s, 0)} s`
  const of = `${dec(s, 0)} s von ${dec(p.requestedSeconds, 0)} s`
  const old = !bridgeVersion || versionOlder(bridgeVersion, REALTIME_PERF_SINCE)
  return old
    ? `${of} (die Bridge zählte Frame-Zeiten statt Echtzeit; Bridge aktualisieren)`
    : `${of} (kürzer als angefragt)`
}

/** First bridge whose perf_record ends on real time. */
const REALTIME_PERF_SINCE = '0.3.0'

/** A frame far above the rest (≥ 4× p99 and over 100 ms) counts as an outlier. */
export function hasOutlier(p: Pick<ModelPerf, 'worst' | 'p99'>): boolean {
  return p.worst >= 100 && p.worst >= p.p99 * 4
}

/** Seconds after Play start under which a hitch is likely loading. */
const WARMUP_S = 10

/** Where the outlier sits and whether the recording started right after Play (loading hitches); '' without one. */
export function outlierNote(p: Pick<ModelPerf, 'worst' | 'p99' | 'sincePlay' | 'worstAt'>): string {
  const parts: string[] = []
  if (hasOutlier(p))
    parts.push(
      `Ausreißer: ${dec(p.worst)} ms${p.worstAt !== undefined ? ` bei ${dec(p.worstAt)} s der Messung` : ''}${outlierEarly(p) ? ', vermutlich Lade-/Startruckler' : ''}`,
    )
  if (p.sincePlay !== undefined && p.sincePlay < WARMUP_S)
    parts.push(`Messung begann ${dec(p.sincePlay)} s nach Play-Start`)
  return parts.join(' · ')
}

function outlierEarly(p: Pick<ModelPerf, 'sincePlay' | 'worstAt'>): boolean {
  return p.sincePlay !== undefined && p.sincePlay + (p.worstAt ?? 0) < WARMUP_S
}

/** Why a recording has no named costs: no source registered, the source gave nothing, or the bridge does not say. */
export function noCostsText(p: Pick<ModelPerf, 'sources'>): string {
  if (p.sources === 0) return 'Das Projekt hat keine Kostenquelle registriert.'
  if (p.sources !== undefined) return 'Die Kostenquelle lieferte keine Werte.'
  return 'Keine Kosten gemeldet (diese Version des Unity-Pakets sagt nicht, ob eine Kostenquelle registriert ist).'
}

/** The prompt behind "Claude analysieren lassen". */
export function perfPrompt(at: number, p: ModelPerf): string {
  return [
    `Analysiere diese Frame-Zeit-Messung aus Unity (${clockTime(at)}, ${dec(p.seconds, 0)} s, ${p.frames} Frames, Budget ${p.budgetMs} ms):`,
    `Schnitt ${dec(p.avgMs)} ms, p50 ${dec(p.p50)}, p95 ${dec(p.p95)}, p99 ${dec(p.p99)}, schlimmster ${dec(p.worst)}, ${p.hitches} Ruckler.`,
    p.costs.length
      ? `Kosten (Schnitt / Max / Schnitt in Rucklern / Anteil an der Ruckelzeit):\n${p.costs
          .map(
            c =>
              `- ${c.name}: ${dec(c.avgMs, 2)} / ${dec(c.maxMs)} / ${dec(c.hitchAvgMs)} ms / ${Math.round(c.hitchShare * 100)} %`,
          )
          .join('\n')}`
      : noCostsText(p),
    p.spot ? `Stelle: ${JSON.stringify(p.spot)}` : '',
    p.sincePlay !== undefined
      ? `Die Messung begann ${dec(p.sincePlay)} s nach dem Play-Start.`
      : 'Wie lange nach dem Play-Start gemessen wurde, ist unbekannt.',
    hasOutlier(p)
      ? `${outlierNote(p)}. ${outlierEarly(p) ? 'Der Ausreißer liegt in der Ladephase: getrennt bewerten und nicht als Laufzeit-Problem behandeln, außer er wiederholt sich.' : 'Prüfe, ob der Ausreißer ein einmaliger Lade-Ruckler ist, bevor du ihn als Laufzeit-Problem behandelst.'}`
      : '',
    perfBackground(p) === 'throttled'
      ? `Achtung: Unity lag während der Messung im Hintergrund und lief gedrosselt (${throttleDetail(p)}). Die Werte sind nicht aussagekräftig; bewerte sie nicht als Leistungsproblem des Spiels und sag mir, dass ich mit Unity im Vordergrund neu messen soll.`
      : perfBackground(p) === 'kept'
        ? 'Unity lag während der Messung im Hintergrund, lief aber ungedrosselt weiter (Run In Background); die Werte gelten.'
        : '',
    perfBackground(p) === 'throttled' ? '' : 'Finde die wahrscheinliche Ursache im Code und schlag eine Lösung vor.',
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
                  ? playActions($, k, m, options).find(a => a.key === 'play')
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
                      ...(canFront(knownPlatform()) ? [frontMeasureAction($, options, 10)] : []),
                    ]
                  : m.bridge.up
                    ? playActions($, k, m, options).filter(a => a.key === 'play')
                    : [],
              ),
        ],
      })}
      {runs[0] ? runCard($, k, options, runs[0].at, runs[0].perf, m.bridge.version ?? m.bridgeInstalled) : null}
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
