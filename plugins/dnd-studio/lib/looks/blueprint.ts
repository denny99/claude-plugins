/**
 * Build look "blueprint" (stage Plan): a drafting table seen from above in pixel art. A blueprint with a faint grid is
 * pinned at its corners; on the right lies a castle plan, and a compass slowly strikes the round keep, segment by
 * segment, rests, and starts again. Ruler, pencil and a set square lie at the left. The middle stays plain.
 */
import { H, W, disc, group, px, scene, sprite } from "../pixel";

const B = 6; // board border around the sheet

/** Drafting board rim, the faint grid, and the four thumbtacks. */
function sheet(): string {
  let out = px("board", 0, 0, W, B) + px("board", 0, H - B, W, B) + px("board", 0, 0, B, H) + px("board", W - B, 0, B, H);
  out += px("board-d", B, B, W - 2 * B, 1) + px("board-d", B, B, 1, H - 2 * B);
  for (let x = B + 10; x < W - B; x += 10) out += px((x - B) % 50 === 0 ? "grid-m" : "grid", x, B, 1, H - 2 * B);
  for (let y = B + 10; y < H - B; y += 10) out += px((y - B) % 50 === 0 ? "grid-m" : "grid", B, y, W - 2 * B, 1);
  return out;
}

function tacks(): string {
  let out = "";
  for (const [x, y] of [[14, 14], [W - 15, 14], [14, H - 15], [W - 15, H - 15]] as const) {
    out += disc("shadow", x + 2, y + 2, 4) + disc("tack", x, y, 4) + px("tack-l", x - 2, y - 2, 2, 2);
  }
  return out;
}

/** Pixels as runs along rows or along columns, whichever needs fewer blocks; keeps slanted lines small. */
function runs(cls: string, cells: Set<string>): string {
  const pts = [...cells].map((c) => c.split(",").map(Number) as [number, number]);
  const emit = (vertical: boolean): [number, number, number, number][] => {
    const lanes = new Map<number, number[]>();
    for (const [x, y] of pts) {
      const [k, v] = vertical ? [x, y] : [y, x];
      lanes.set(k, [...(lanes.get(k) ?? []), v]);
    }
    const out: [number, number, number, number][] = [];
    for (const [k, list] of lanes) {
      const vs = list.sort((a, b) => a - b);
      let start = vs[0];
      for (let i = 1; i <= vs.length; i++) {
        if (i === vs.length || vs[i] !== vs[i - 1] + 1) {
          const len = vs[i - 1] - start + 1;
          out.push(vertical ? [k, start, 1, len] : [start, k, len, 1]);
          start = vs[i];
        }
      }
    }
    return out;
  };
  const a = emit(false);
  const b = emit(true);
  return (a.length <= b.length ? a : b).map(([x, y, w, h]) => px(cls, x, y, w, h)).join("");
}

/** A pixel line between two points, w x w pixels per step. */
function line(cls: string, ax: number, ay: number, bx: number, by: number, w = 1): string {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
  const cells = new Set<string>();
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / n);
    const y = Math.round(ay + ((by - ay) * i) / n);
    for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) cells.add(`${x + dx},${y + dy}`);
  }
  return runs(cls, cells);
}

function box(cls: string, x: number, y: number, w: number, h: number): string {
  return px(cls, x, y, w, 1) + px(cls, x, y + h - 1, w, 1) + px(cls, x, y, 1, h) + px(cls, x + w - 1, y, 1, h);
}

function ring(cls: string, cx: number, cy: number, r: number): string {
  let out = "";
  const seen = new Set<string>();
  for (let a = 0; a < 360; a += 1) {
    const x = Math.round(cx + r * Math.cos((a * Math.PI) / 180));
    const y = Math.round(cy + r * Math.sin((a * Math.PI) / 180));
    if (!seen.has(`${x},${y}`)) {
      seen.add(`${x},${y}`);
      out += px(cls, x, y);
    }
  }
  return out;
}

// The castle plan on the right.
const X0 = 258;
const Y0 = 88;
const X1 = 378;
const Y1 = 214;
const C: [number, number] = [318, 148]; // centre of the round keep
const R = 22;

function plan(): string {
  let out = "";
  // Curtain wall: a double line with a gap for the gate at the bottom.
  for (const i of [0, 4]) {
    const x0 = X0 + i, y0 = Y0 + i, x1 = X1 - 1 - i, y1 = Y1 - 1 - i;
    out += px("line", x0, y0, x1 - x0 + 1, 1) + px("line", x0, y0, 1, y1 - y0 + 1) + px("line", x1, y0, 1, y1 - y0 + 1);
    out += px("line", x0, y1, 308 - x0, 1) + px("line", 328, y1, x1 - 328 + 1, 1);
  }
  out += box("line", 300, Y1 - 6, 8, 12) + box("line", 328, Y1 - 6, 8, 12);
  // Square towers at the corners.
  for (const [x, y] of [[X0 - 6, Y0 - 6], [X1 - 8, Y0 - 6], [X0 - 6, Y1 - 8], [X1 - 8, Y1 - 8]] as const) {
    out += box("line", x, y, 14, 14) + box("line-l", x + 3, y + 3, 8, 8);
  }
  // Buildings along the walls: hall on the right, stables at the left.
  out += box("line", 350, 108, 22, 56);
  for (let y = 112; y < 162; y += 4) out += line("line-l", 352, y, 356, y - 4);
  out += box("line", 264, 160, 26, 40) + px("line", 264, 180, 26, 1);
  // Well and a path from the gate.
  out += ring("line", 286, 112, 4);
  for (let y = Y1 - 10; y > C[1] + R + 2; y -= 4) out += px("line-l", 318, y, 1, 2);
  // Construction lines through the keep's centre.
  for (let x = X0 + 8; x < X1 - 8; x += 3) out += px("line-l", x, C[1], 1, 1);
  for (let y = Y0 + 8; y < Y1 - 8; y += 3) out += px("line-l", C[0], y, 1, 1);
  // Dimension line above the plan.
  out += px("line-l", X0, Y0 - 14, X1 - X0, 1) + px("line-l", X0, Y0 - 18, 1, 9) + px("line-l", X1 - 1, Y0 - 18, 1, 9);
  out += line("line-l", X0 + 1, Y0 - 14, X0 + 4, Y0 - 17) + line("line-l", X0 + 1, Y0 - 14, X0 + 4, Y0 - 11);
  out += line("line-l", X1 - 2, Y0 - 14, X1 - 5, Y0 - 17) + line("line-l", X1 - 2, Y0 - 14, X1 - 5, Y0 - 11);
  out += px("line", 312, Y0 - 17, 12, 1) + px("line", 312, Y0 - 12, 12, 1);
  // A small north arrow at top right.
  out += line("line", 368, 30, 368, 48) + line("line", 368, 30, 364, 38) + line("line", 368, 30, 372, 38);
  out += px("line", 365, 52, 1, 6) + px("line", 371, 52, 1, 6) + line("line", 365, 52, 371, 57);
  return out;
}

/** Ruler, pencil and a set square at the bottom left. */
function tools(): string {
  let out = px("shadow", 22, 226, 150, 12);
  out += px("ruler", 18, 222, 150, 12) + px("ruler-d", 18, 233, 150, 1);
  for (let x = 22; x < 166; x += 4) out += px("tick", x, 222, 1, (x - 22) % 20 === 0 ? 5 : 3);
  // Pencil lying above the ruler, point to the right.
  out += px("shadow", 40, 212, 96, 4);
  out += px("eraser", 36, 208, 6, 5) + px("ferrule", 42, 208, 4, 5);
  out += px("pencil", 46, 208, 80, 5) + px("pencil-d", 46, 212, 80, 1);
  out += sprite(["ww...", "wwww.", "wwwwl", "wwww.", "ww..."], 126, 208, { w: "wood", l: "lead" });
  // Set square: a right triangle outline in the top left corner.
  for (let i = 0; i < 64; i++) {
    const w = 64 - i;
    if (i < 8) out += px("tri", 22, 22 + i, w, 1);
    else out += px("tri", 22, 22 + i, Math.min(w, 8), 1) + (w > 8 ? px("tri", 22 + Math.max(8, w - 8), 22 + i, Math.min(8, w - 8), 1) : "");
  }
  return out;
}

// The compass strikes the keep in STEPS segments, one each STEP seconds, holds, then the lines vanish.
const STEPS = 16;
const STEP = 0.4;
const CYCLE = 10;
const pct = (t: number): string => `${+((t / CYCLE) * 100).toFixed(3)}%`;

function arcPath(k: number): string {
  const seen = new Set<string>();
  let d = "";
  for (let a = (k * 360) / STEPS; a <= ((k + 1) * 360) / STEPS; a += 0.5) {
    const rad = ((a - 90) * Math.PI) / 180;
    const x = Math.round(C[0] + R * Math.cos(rad));
    const y = Math.round(C[1] + R * Math.sin(rad));
    if (!seen.has(`${x},${y}`)) {
      seen.add(`${x},${y}`);
      d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}

/** The compass seen from above: needle at the centre, the hinge lifted toward the viewer, the pencil leg on the arc. */
function compass(angle: number): string {
  const rad = ((angle - 90) * Math.PI) / 180;
  const p: [number, number] = [Math.round(C[0] + R * Math.cos(rad)), Math.round(C[1] + R * Math.sin(rad))];
  const h: [number, number] = [Math.round((C[0] + p[0]) / 2) - 10, Math.round((C[1] + p[1]) / 2) - 26];
  return group(
    () =>
      line("shadow", C[0] + 2, C[1] + 2, h[0] + 12, h[1] + 16, 2) +
      line("shadow", h[0] + 12, h[1] + 16, p[0] + 2, p[1] + 2, 2) +
      line("metal-d", C[0], C[1], h[0], h[1], 2) +
      line("metal", p[0], p[1], h[0], h[1], 2) +
      px("lead", p[0], p[1], 2, 2) +
      disc("metal-d", h[0] + 1, h[1] + 1, 4) +
      disc("metal-l", h[0] + 1, h[1] + 1, 2) +
      px("metal-d", h[0], h[1] - 9, 3, 6) + px("metal-l", h[0] - 1, h[1] - 12, 5, 4),
  );
}

function strike(): { svg: string; css: string } {
  const end = STEPS * STEP + 2.5;
  let svg = "";
  let css = "";
  for (let k = 0; k < STEPS; k++) {
    const t = (k + 1) * STEP;
    svg += `<path class="arc a${k}" d="${arcPath(k)}"/>`;
    css += `.a${k}{animation-name:a${k}}@keyframes a${k}{0%{opacity:0}${pct(t)}{opacity:1}${pct(end)},100%{opacity:0}}`;
  }
  // One frame of the compass per step; the last one stays through the rest.
  for (let k = 0; k <= STEPS; k++) {
    const on = k * STEP;
    const off = k === STEPS ? CYCLE : (k + 1) * STEP;
    svg += `<g class="arc c${k}">${compass((k * 360) / STEPS)}</g>`;
    const show = k === 0 ? `0%{opacity:1}${pct(off)},100%{opacity:0}` : `0%{opacity:0}${pct(on)}{opacity:1}${off === CYCLE ? "100%{opacity:1}" : `${pct(off)},100%{opacity:0}`}`;
    css += `.c${k}{animation-name:c${k}}@keyframes c${k}{${show}}`;
  }
  return { svg, css };
}

const STYLE = `
svg{--sky-top:#d8e2ec;--sky-bot:#c9d6e4;--grid:#3a6ab0;--grid-o:.05;--grid-m-o:.09;--line:#2f5a96;--line-l:#7f9cc2;
--board:#a8916e;--board-d:#8a7656;--tack:#b04a3e;--tack-l:#d88a7e;--shadow:#1e3050;--shadow-o:.16;
--ruler:#e4d6b4;--ruler-d:#bba57c;--tick:#6a5838;--pencil:#d2a944;--pencil-d:#a8832e;--wood:#e6c890;--lead:#3a3f48;
--eraser:#c78282;--ferrule:#9aa0a8;--tri:#7fa2d0;--tri-o:.22;--metal:#7a8594;--metal-l:#b6c0cc;--metal-d:#4e5866;--scan:.03}
@media (prefers-color-scheme: dark){svg{--sky-top:#0e1a2e;--sky-bot:#132743;--grid:#9cc0ec;--grid-o:.05;--grid-m-o:.09;--line:#b4cbe6;--line-l:#4b6a92;
--board:#1c1712;--board-d:#120e0a;--tack:#6a2a22;--tack-l:#8c4a3e;--shadow:#000;--shadow-o:.35;
--ruler:#4a4232;--ruler-d:#352e22;--tick:#1e190f;--pencil:#6a5424;--pencil-d:#4c3c18;--wood:#6e5e40;--lead:#14171c;
--eraser:#5e3a3a;--ferrule:#4a4f56;--tri:#5a80b0;--tri-o:.16;--metal:#8492a6;--metal-l:#b8c4d4;--metal-d:#56616f;--scan:.09}}
.board{fill:var(--board)}.board-d{fill:var(--board-d)}
.grid{fill:var(--grid);opacity:var(--grid-o)}.grid-m{fill:var(--grid);opacity:var(--grid-m-o)}
.line{fill:var(--line)}.line-l{fill:var(--line-l)}.tack{fill:var(--tack)}.tack-l{fill:var(--tack-l)}
.shadow{fill:var(--shadow);opacity:var(--shadow-o)}
.ruler{fill:var(--ruler)}.ruler-d{fill:var(--ruler-d)}.tick{fill:var(--tick)}
.pencil{fill:var(--pencil)}.pencil-d{fill:var(--pencil-d)}.wood{fill:var(--wood)}.lead{fill:var(--lead)}
.eraser{fill:var(--eraser)}.ferrule{fill:var(--ferrule)}.tri{fill:var(--tri);opacity:var(--tri-o)}
.metal{fill:var(--metal)}.metal-l{fill:var(--metal-l)}.metal-d{fill:var(--metal-d)}
path.arc{fill:var(--line)}
.arc{opacity:0;animation-duration:${CYCLE}s;animation-timing-function:steps(1,end);animation-iteration-count:infinite}
`;

/** The whole scene as SVG; under 128 KB, light and dark through prefers-color-scheme. */
export function blueprintSvg(): string {
  const s = strike();
  const body = [group(sheet), group(plan), group(tools), s.svg, group(tacks)].join("\n");
  return scene(STYLE + s.css, "", body);
}
