import { expect, test } from "claude-code/testing";

import { themeTokens } from "../lib/theme";
import type { Tokens } from "../lib/theme";

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The pairs a pane draws: text on card and panel, button text on its fill, headings, links, tone pills. */
function pairs(t: Tokens): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (const fg of ["text", "muted", "faint", "link", "accentTintText"] as const)
    for (const bg of ["card", "bg", "well"] as const)
      out.push([`${fg}/${bg}`, t[fg], t[bg]]);
  out.push(["onAccent/accent (primary button)", t.onAccent, t.accent]);
  out.push(["accentTintText/accentTint (active tab, hover)", t.accentTintText, t.accentTint]);
  for (const [k, v] of Object.entries(t.tones)) out.push([`tone ${k}`, v.fg, v.bg]);
  return out;
}

test("D&D tokens: every main text pair reads at 4.5:1 or more, light and dark", () => {
  for (const mode of ["light", "dark"] as const) {
    const low = pairs(themeTokens("dnd", mode))
      .map(([name, fg, bg]) => ({ name, ratio: Math.round(contrast(fg, bg) * 100) / 100 }))
      .filter((p) => p.ratio < 4.5);
    expect({ mode, low }).toEqual({ mode, low: [] });
  }
});

test("D&D light: the brass is dark enough on the panel and the hairline is soft", () => {
  const t = themeTokens("dnd", "light");
  expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(t.line, t.bg)).toBeLessThan(1.5);
});
