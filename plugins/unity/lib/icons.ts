/**
 * Stroke icons of the UI kit (lib/ui.tsx): 24-unit viewBox, stroke 2, round caps, drawn in `currentColor` (which the
 * kit replaces with a concrete color, since a surface draws an `Svg` as an image that inherits no text color).
 * Pure data: copy this file next to ui.tsx when copying the kit into another plugin.
 */
export const ICONS = {
  play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"></path>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"></rect>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path><path d="M21 3v5h-5"></path>',
  rerun: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path>',
  up: '<path d="M12 19V5"></path><path d="m6 11 6-6 6 6"></path>',
  push: '<path d="M12 17V4"></path><path d="m6 10 6-6 6 6"></path><path d="M5 21h14"></path>',
  commit: '<circle cx="12" cy="12" r="3.5"></circle><path d="M3 12h5.5M15.5 12H21"></path>',
  log: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6"></path><path d="M8 13h8M8 17h5"></path>',
  claude:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"></path>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>',
  flag: '<path d="M4 21V4"></path><path d="M4 4h13l-2.5 4.5L17 13H4"></path>',
  gauge: '<path d="M3.5 18a9 9 0 1 1 17 0"></path><path d="m12 14 4-5"></path>',
  external:
    '<path d="M14 4h6v6"></path><path d="M20 4 10 14"></path><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"></path>',
  check: '<path d="M20 6 9 17l-5-5"></path>',
  x: '<path d="M18 6 6 18M6 6l12 12"></path>',
  diff: '<path d="M12 3v18"></path><path d="M5 8h4M7 6v4M15 16h4"></path>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path>',
  download: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M4 19h16"></path>',
  power: '<path d="M12 3v9"></path><path d="M6.3 6.3a8 8 0 1 0 11.4 0"></path>',
  plug: '<path d="M9 3v5M15 3v5"></path><path d="M6 8h12v3a6 6 0 0 1-12 0z"></path><path d="M12 17v4"></path>',
  list: '<path d="M9 5h11M9 12h11M9 19h11"></path><path d="m3 5 1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2"></path>',
  wand: '<path d="m4 20 11-11"></path><path d="M15 4v3M13.5 5.5h3M19 9v2M18 10h2"></path>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  globe:
    '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>',
  branch:
    '<circle cx="6" cy="5" r="2"></circle><circle cx="6" cy="19" r="2"></circle><circle cx="18" cy="7" r="2"></circle><path d="M6 7v10"></path><path d="M18 9c0 5-7 4-12 8"></path>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
  flask:
    '<path d="M9 3h6"></path><path d="M10 3v6L4.6 18.4A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.6L14 9V3"></path><path d="M7 15h10"></path>',
  terminal: '<path d="m4 17 6-5-6-5"></path><path d="M12 19h8"></path>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  server:
    '<rect x="3" y="4" width="18" height="7" rx="1.5"></rect><rect x="3" y="13" width="18" height="7" rx="1.5"></rect><path d="M7 7.5h.01M7 16.5h.01"></path>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"></circle><circle cx="12" cy="12" r="1.6" fill="currentColor"></circle><circle cx="19" cy="12" r="1.6" fill="currentColor"></circle>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"></rect><path d="M11 18h2"></path>',
  app: '<rect x="3" y="3" width="18" height="18" rx="4"></rect><path d="M9 9h6v6H9z"></path>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"></path>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><circle cx="9" cy="9" r="1.2" fill="currentColor"></circle><circle cx="15" cy="15" r="1.2" fill="currentColor"></circle><circle cx="15" cy="9" r="1.2" fill="currentColor"></circle><circle cx="9" cy="15" r="1.2" fill="currentColor"></circle>',
  hammer: '<path d="m14 6 4 4"></path><path d="M10 10 4 16l4 4 6-6"></path><path d="M12 4h5l3 3-3 3-5-5z"></path>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"></path>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4"></path><path d="M16 7v11a2 2 0 0 1-4 0v-1H5V6a2 2 0 0 1 2-2"></path>',
  next: '<path d="m9 6 6 6-6 6"></path><path d="M17 6v12"></path>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"></path><path d="M19 19v2H6"></path>',
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3z"></path><path d="M14 4v12"></path>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"></path><path d="m3 8 9 5 9-5"></path><path d="M12 13v8"></path>',
  container:
    '<rect x="3" y="7" width="18" height="12" rx="2"></rect><path d="M7 7V5h10v2"></path><path d="M8 11v4M12 11v4M16 11v4"></path>',
  alert: '<path d="M12 3 2 21h20z"></path><path d="M12 10v5"></path>',
  tag: '<path d="M20 12 12 20 3 11V3h8z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"></path>',
  sliders:
    '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"></path><circle cx="16" cy="6" r="2"></circle><circle cx="10" cy="12" r="2"></circle><circle cx="18" cy="18" r="2"></circle>',
  translate:
    '<path d="M4 5h8M8 3v2M6 5c0 4 3 7 6 8"></path><path d="M10 5c0 3-3 7-6 8"></path><path d="m13 21 4-9 4 9M14.5 18h5"></path>',
  stethoscope:
    '<path d="M6 3v6a4 4 0 0 0 8 0V3"></path><path d="M10 13v3a4 4 0 0 0 8 0v-2"></path><circle cx="18" cy="12" r="2"></circle>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
  moon: '<path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z"></path>',
  pin: '<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"></path><circle cx="12" cy="10" r="2"></circle>',
  pen: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"></path>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
  chat: '<path d="M4 5h16v11H9l-5 4z"></path>',
  arrow: '<path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path>',
  gear: '<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"></path>',
  music:
    '<path d="M9 18V5l11-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="17" cy="16" r="3"></circle>',
  // kit additions (not in the mockup's icon set): state marks for list rows and pills
  xCircle: '<circle cx="12" cy="12" r="9"></circle><path d="m15 9-6 6M9 9l6 6"></path>',
  checkCircle: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 3 3 5-6"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  circle: '<circle cx="12" cy="12" r="8"></circle>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
} as const

import { schemeSvg } from './theme'

/** Name of a kit icon. */
export type IconName = keyof typeof ICONS

/** Terminal stand-ins (the terminal has no `Svg`): icons not listed here draw nothing there. */
export const TERM_GLYPHS: Partial<Record<IconName, string>> = {
  play: '▶',
  stop: '■',
  refresh: '⟳',
  rerun: '⟳',
  up: '↑',
  push: '↑',
  check: '✓',
  x: '✗',
  alert: '⚠',
  dots: '…',
  external: '↗',
  copy: '⧉',
  arrow: '→',
  next: '→',
  log: '≡',
  list: '≡',
  gear: '⚙',
  xCircle: '✗',
  checkCircle: '✓',
  clock: '◷',
  circle: '○',
  info: 'ℹ',
}

const VS15 = '\uFE0E'

/**
 * Text glyph per icon for the label of a native `Button` (a desktop draws every Button natively and refuses an `Svg`
 * inside one, so a clickable icon is a character in front of its label: "↑ Pushen"). Only icons whose character shows
 * the action unmistakably have one (play, stop, again, push/update, download, copy, ok, cancel, open, edit, report);
 * every other icon (folder, grid, dice, app, branch, …) has none and its button shows the bare label. Tabs and
 * launcher chips never carry a glyph. Characters with an emoji form carry U+FE0E so they stay text, never a color
 * emoji (test "glyphs are text").
 */
export const ICON_GLYPHS: Partial<Record<IconName, string>> = {
  play: `▶${VS15}`,
  stop: '■',
  refresh: '⟳',
  rerun: '⟳',
  up: '↑',
  push: '↑',
  download: '↓',
  copy: '⧉',
  check: '✓',
  checkCircle: '✓',
  x: '✕',
  external: `↗${VS15}`,
  pen: '✎',
  flag: '⚑',
}

/** `"<glyph> <label>"` for a native Button (just `label` without an icon or for an icon without a glyph). */
export function glyphLabel(icon: IconName | undefined, label: string): string {
  const g = icon ? ICON_GLYPHS[icon] : undefined
  return g ? `${g} ${label}` : label
}

/** The `<svg>` markup of an icon in one color (`currentColor` replaced), sized `size` CSS pixels. */
export function iconSvg(name: IconName, color: string, size = 16): string {
  const body = (ICONS[name] ?? '').replace(/currentColor/g, color)
  return schemeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  )
}

/** Whether `name` is a kit icon. */
export function isIconName(name: unknown): name is IconName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(ICONS, name)
}

/**
 * Makes an SVG string a standalone document a desktop can draw as an image: adds `xmlns` (without it the image loader
 * refuses the markup and draws a broken-image placeholder), `xmlns:xlink` when `xlink:href` is used, and `width` /
 * `height` from the `viewBox` when missing. A data-URI `<image href="data:image/webp;base64,…">` inside works then too.
 */
export function svgDocument(source: string): string {
  const src = source.trim()
  const m = /^<svg\b([^>]*)>/i.exec(src)
  if (!m) return src
  let attrs = m[1] ?? ''
  if (!/\sxmlns\s*=/.test(attrs)) attrs = ` xmlns="http://www.w3.org/2000/svg"${attrs}`
  if (/xlink:href/.test(src) && !/\sxmlns:xlink\s*=/.test(attrs))
    attrs = `${attrs} xmlns:xlink="http://www.w3.org/1999/xlink"`
  const vb = /\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/.exec(attrs)
  const w = vb?.[1]
  const hgt = vb?.[2]
  if (w && !/\swidth\s*=/.test(attrs)) attrs = `${attrs} width="${w}"`
  if (hgt && !/\sheight\s*=/.test(attrs)) attrs = `${attrs} height="${hgt}"`
  return schemeSvg(`<svg${attrs}>${src.slice(m[0].length)}`)
}
