import { expect, test } from "claude-code/testing";

import { boxPaint, schemeColors, schemeSvg, themeTokens, windowTokens } from "../lib/theme";
import type { Tokens } from "../lib/theme";
import { toggleSvg } from "../features/dnd-ui";

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

// The desktop window may be light while the engine's `theme` says dark: graphical surfaces follow the window.
const WINDOW = { light: ["#ffffff", "#faf9f5", "#f4efe2"], dark: ["#1f1e1d", "#262624", "#0b1a15"] };

test("window mode: cards paint no fill of their own, text and borders are theme keys", () => {
  const t = windowTokens("dnd");
  expect([t.card, t.bg, t.well, t.accentTint].map(boxPaint)).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(boxPaint(t.tones.ok.bg)).toBeUndefined();
  expect([t.text, t.faint, t.tones.ok.fg, t.tones.bad.fg]).toEqual([
    "text",
    "inactive",
    "success",
    "error",
  ]);
});

test("window mode: every Svg color reads at 4.5:1 on a light and a dark window, and on its own pill", () => {
  const c = schemeColors("dnd");
  const low: string[] = [];
  for (const mode of ["light", "dark"] as const) {
    for (const key of ["text", "inactive", "claude", "success", "warning", "error", "suggestion"])
      for (const bg of WINDOW[mode])
        if (contrast(c[key]![mode], bg) < 4.5) low.push(`${mode} ${key} on ${bg}`);
    for (const [tone, fg] of [
      ["ok", "success"],
      ["warn", "warning"],
      ["bad", "error"],
      ["info", "suggestion"],
      ["neutral", "inactive"],
      ["accent", "claude"],
    ] as const)
      if (contrast(c[fg]![mode], c[`tone-${tone}-bg`]![mode]) < 4.5)
        low.push(`${mode} pill ${tone}`);
    // the header hairline stays soft
    for (const bg of WINDOW[mode].slice(0, 2))
      if (contrast(c.subtle![mode], bg) >= 2) low.push(`${mode} hairline too hard on ${bg}`);
  }
  expect(low).toEqual([]);
});

test("window mode: a Svg names its colors once and switches them with prefers-color-scheme", () => {
  const svg = schemeSvg('<svg viewBox="0 0 10 10"><rect fill="tone-ok-bg"/><text fill="success">x</text></svg>');
  expect(svg).toContain('[fill="success"]{fill:#3f6b2e}');
  expect(svg).toContain("@media (prefers-color-scheme: dark){");
  expect(svg).toContain('[fill="success"]{fill:#9bb48a}');
  expect(schemeSvg('<svg><rect fill="#123456"/></svg>')).toBe('<svg><rect fill="#123456"/></svg>');
});

test("switch: a calm toggle beside a secondary button; on in the accent, off dimmed, both readable light and dark", () => {
  const k = { t: windowTokens("dnd") } as never;
  const on = toggleSvg(k, true);
  const off = toggleSvg(k, false);
  // theme keys, switched with the window's scheme; no fill of its own on the off track
  expect(on).toContain('fill="claude"');
  expect(on).toContain('fill="inverseText"');
  expect(on).toContain("@media (prefers-color-scheme: dark){");
  expect(off).toContain('fill="none"');
  expect(off).toContain('stroke="inactive"');
  expect(off).not.toContain('fill="claude"');
  // the knob sits right when on, left when off
  const cx = (svg: string) => Number(/<circle cx="([\d.]+)"/.exec(svg)?.[1]);
  expect(cx(on)).toBeGreaterThan(cx(off));
  const c = schemeColors("dnd");
  const low: string[] = [];
  for (const mode of ["light", "dark"] as const) {
    if (contrast(c.inverseText![mode], c.claude![mode]) < 3) low.push(`${mode} knob on track`);
    // a control's shape needs 3:1 against the window (WCAG 1.4.11)
    for (const bg of WINDOW[mode]) {
      if (contrast(c.claude![mode], bg) < 3) low.push(`${mode} on-track on ${bg}`);
      if (contrast(c.inactive![mode], bg) < 3) low.push(`${mode} off-track on ${bg}`);
    }
  }
  expect(low).toEqual([]);
});
