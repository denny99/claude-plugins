/**
 * Pixel-art helpers for the build looks.
 *
 * Copied from ds-seasons (deltastone marketplace, plugins/ds-seasons/hooks/pixel.ts, 2026-11-18) and trimmed:
 * no `Season` type, no `loopLayer` (it needs `<use href>`, which the dnd-studio scene test forbids).
 * Keep the two copies in step by hand when one learns something.
 */
// Every scene is drawn on a 400x250 grid, one unit per art pixel.
export const W = 400
export const H = 250

/**
 * Every change in the scene repaints the whole window and the app's frosted panels over it.
 * So moving layers move as one block, and every animation steps on one shared 1/30 s grid:
 * durations, keyframe offsets and delays are multiples of 1/30 s, and steps() counts are
 * (interval seconds x 30). Then the window repaints at most 30 times a second.
 */
export const STEPS_PER_SECOND = 30

/** Seeded so a scene is identical on every render. */
export function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Inside group(), pixels collect into one path per class, which keeps the markup small.
let sink: Map<string, string> | undefined

/** One art pixel (or a w x h block) of a CSS class. */
export function px(cls: string, x: number, y: number, w = 1, h = 1): string {
  if (sink === undefined) return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`
  sink.set(cls, `${sink.get(cls) ?? ''}M${x} ${y}h${w}v${h}h${-w}z`)
  return ''
}

/** Runs `draw` and merges every px() it made into one <path> per class. */
export function group(draw: () => string): string {
  const outer = sink
  const own = new Map<string, string>()
  sink = own
  const rest = draw()
  sink = outer
  let out = ''
  for (const [cls, d] of own) out += `<path class="${cls}" d="${d}"/>`
  return out + rest
}

/** Rows of characters, one per pixel; '.' is empty. Horizontal runs merge into one block. */
export function sprite(rows: string[], x0: number, y0: number, map: Record<string, string>, scale = 1): string {
  let out = ''
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x] ?? '.'
      let run = 1
      while (row[x + run] === c) run++
      const cls = map[c]
      if (cls !== undefined) out += px(cls, x0 + x * scale, y0 + y * scale, run * scale, scale)
      x += run
    }
  })
  return out
}

/** A rolling hill line filled down to the bottom edge. */
export function hill(cls: string, base: number, amp: number, phase: number): string {
  let out = ''
  for (let x = 0; x < W; x += 4) {
    const y = Math.round(base + amp * Math.sin(x / 41 + phase) + (amp / 2) * Math.sin(x / 17 + phase * 2))
    out += px(cls, x, y, 4, H - y)
  }
  return out
}

/** A filled pixel disc. */
export function disc(cls: string, cx: number, cy: number, r: number): string {
  let out = ''
  for (let y = -r; y <= r; y++) {
    const hw = Math.floor(Math.sqrt(r * r - y * y))
    out += px(cls, cx - hw, cy + y, hw * 2 + 1)
  }
  return out
}

/** Shared CSS every scene ends with: crisp pixels, a faint scanline, and a stop for reduced motion. */
export const BASE_CSS = `rect,path{shape-rendering:crispEdges}
@media (prefers-reduced-motion: reduce){*{animation-play-state:paused!important}}`

/**
 * Wraps a scene. `style` holds the scene's own CSS: colors as custom properties on `svg`,
 * redefined under `@media (prefers-color-scheme: dark)`, so the scene follows the mode.
 * The sky is a vertical gradient from --sky-top to --sky-bot; --scan sets the scanline strength.
 */
export function scene(style: string, defs: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<style>${style}
${BASE_CSS}</style>
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky-top)"/><stop offset="1" style="stop-color:var(--sky-bot)"/></linearGradient>
<pattern id="scan" width="4" height="2" patternUnits="userSpaceOnUse"><rect width="4" height=".5" style="fill:#000;opacity:var(--scan)"/></pattern>
${defs}
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${body}
<rect width="${W}" height="${H}" fill="url(#scan)"/>
</svg>`
}
