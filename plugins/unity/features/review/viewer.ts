/**
 * The picture viewer's drawing, pure: one SVG with the frame as a data-URI image and the marks (pen strokes, arrows)
 * painted over it in normalized coordinates. Desktop draws it as an `Svg`; the same markup, with the image referenced
 * by file, is what an answer saves beside the PNG so the marks travel with the picture.
 */
import type { ReviewMark } from '../../types'

/** An `Svg` source is capped at 131072 characters; leave room for the marks. */
export const SVG_IMAGE_LIMIT = 120000

export const MARK_COLORS: Record<ReviewMark['color'], string> = { red: '#ef4444', yellow: '#facc15', blue: '#3b82f6' }
export const COLOR_NAMES: Record<ReviewMark['color'], string> = { red: 'rot', yellow: 'gelb', blue: 'blau' }

const f = (n: number) => String(Math.round(n * 10) / 10)

function markSvg(m: ReviewMark, w: number, h: number): string {
  const color = MARK_COLORS[m.color]
  const stroke = Math.max(2, Math.round(Math.min(w, h) / 120))
  const pts = m.pts.map(([x, y]) => [x * w, y * h] as const)
  if (pts.length === 0) return ''
  if (m.tool === 'arrow' && pts.length >= 1) {
    const [x1, y1] = pts[0]!
    const [x2, y2] = pts[pts.length - 1]!
    const a = Math.atan2(y2 - y1, x2 - x1)
    const len = stroke * 5
    const hx = (d: number) => x2 - len * Math.cos(a + d)
    const hy = (d: number) => y2 - len * Math.sin(a + d)
    return (
      `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>` +
      `<polygon points="${f(x2)},${f(y2)} ${f(hx(0.45))},${f(hy(0.45))} ${f(hx(-0.45))},${f(hy(-0.45))}" fill="${color}"/>`
    )
  }
  if (pts.length === 1)
    return `<circle cx="${f(pts[0]![0])}" cy="${f(pts[0]![1])}" r="${stroke * 3}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`
  return `<polyline points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`
}

/** The marked picture as SVG markup; `href` is a data URI (pane) or a file name (saved copy). */
export function markedSvg(href: string, size: { width: number; height: number }, marks: ReviewMark[]): string {
  const { width: w, height: h } = size
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<image href="${href}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>` +
    marks.map(m => markSvg(m, w, h)).join('') +
    `</svg>`
  )
}

/** The marks in words for Claude: tool, colour and where (percent of width/height). */
export function describeMarks(marks: ReviewMark[]): string[] {
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return marks.map((m, i) => {
    const xs = m.pts.map(p => p[0])
    const ys = m.pts.map(p => p[1])
    const box = `x ${pct(Math.min(...xs))}–${pct(Math.max(...xs))}, y ${pct(Math.min(...ys))}–${pct(Math.max(...ys))}`
    if (m.tool === 'arrow') {
      const a = m.pts[0]!
      const b = m.pts[m.pts.length - 1]!
      return `${i + 1}. Pfeil ${COLOR_NAMES[m.color]} von (${pct(a[0])}, ${pct(a[1])}) nach (${pct(b[0])}, ${pct(b[1])})`
    }
    return `${i + 1}. Markierung ${COLOR_NAMES[m.color]} im Bereich ${box}`
  })
}

/** Normalizes a pointer position over a region of `columns`×`rows` cells into 0..1. */
export function normPoint(x: number, y: number, columns: number, rows: number): [number, number] {
  const c = (v: number) => Math.max(0, Math.min(1, Math.round(v * 1000) / 1000))
  return [c(columns > 0 ? x / columns : 0), c(rows > 0 ? y / rows : 0)]
}
