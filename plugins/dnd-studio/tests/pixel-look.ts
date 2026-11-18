/** Shared checks for a pixel build look; each look has its own test file that calls checkPixelLook. */
import { expect } from 'claude-code/testing'

import { LOOKS } from '../lib/looks'
import type { LookId } from '../lib/looks'
import { PIXEL_LOOKS } from '../lib/looks/index'

export function checkPixelLook(id: LookId): void {
  const own = PIXEL_LOOKS[id]?.() ?? ''
  // It renders: a whole 400 x 250 pixel scene, and LOOKS uses it instead of the plain vector scene.
  expect(own.startsWith('<svg')).toBe(true)
  expect(own.trimEnd().endsWith('</svg>')).toBe(true)
  expect(own.includes('viewBox="0 0 400 250"')).toBe(true)
  expect(own.includes('crispEdges')).toBe(true)
  expect(LOOKS[id].svg).toBe(own)
  // Small, pure vector, no links.
  expect(own.length < 131072).toBe(true)
  expect(/<image|href|<!--|<script|<text|<foreignObject/i.test(own)).toBe(false)
  // A light and a dark variant: custom properties on svg, redefined for the dark scheme.
  const dark = /@media \(prefers-color-scheme: dark\)\{svg\{([^}]*)\}\}/.exec(own)?.[1] ?? ''
  const light = /(?:^|\n)svg\{([^}]*)\}/.exec(own)?.[1] ?? ''
  expect(light.includes('--sky-top')).toBe(true)
  expect(dark.includes('--sky-top')).toBe(true)
  expect(dark).not.toBe(light)
  // Calm motion, and it stops for reduced motion.
  expect(/@keyframes/.test(own)).toBe(true)
  expect(own.includes('prefers-reduced-motion')).toBe(true)
}
