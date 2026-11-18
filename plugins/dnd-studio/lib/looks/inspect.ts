/**
 * Build look "inspect" (stage Review): a reviewer's table in pixel art. A scroll lies unrolled on the table at the
 * lower right; a big magnifying glass glides slowly along its lines, row by row, and after each pass a check mark
 * appears in the margin. Pigeonholes full of rolled scrolls stand at the left edge; the middle of the wall stays plain.
 */
import { H, W, group, px, random, scene, sprite } from "../pixel";

/** One review cycle in seconds. */
const CYCLE = 18;
/** The table and everything on it sit this many pixels higher than drawn. */
const LIFT = 22;
const pct = (t: number): string => ((t / CYCLE) * 100).toFixed(4);

/** Cool plastered wall with faint wide panels and a picture rail. */
function wall(): string {
  const r = random(41);
  let out = "";
  for (let x = 0; x < W; x += 40) out += px("seam", x, 0, 1, 212);
  for (let i = 0; i < 30; i++) out += px("patch", Math.floor(r() * W), Math.floor(r() * 200), 3 + Math.floor(r() * 8), 1);
  out += px("rail", 0, 40, W, 2) + px("base", 0, 204, W, 8) + px("base-l", 0, 204, W, 1);
  return out;
}

function floor(): string {
  const r = random(43);
  let out = px("floor", 0, 212, W, H - 212) + px("floor-edge", 0, 212, W, 2);
  for (let i = 0; i < 34; i++) out += px("floor-d", Math.floor(r() * W), 216 + Math.floor(r() * 32), 3 + Math.floor(r() * 5), 1);
  return out;
}

/** Pigeonholes at the left edge, each with a rolled scroll or two showing their ends. */
function pigeonholes(): string {
  let out = px("shelf-d", 0, 70, 58, 142) + px("shelf", 0, 70, 56, 142);
  const r = random(47);
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 3; col++) {
      const x = 3 + col * 18;
      const y = 74 + row * 22;
      out += px("hole", x, y, 16, 19);
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const sx = x + 2 + k * 5;
        out += px("roll", sx, y + 12, 5, 5) + px("roll-d", sx + 2, y + 14, 1, 1) + px("roll-l", sx, y + 12, 5, 1);
      }
    }
  }
  return out;
}

/** The table seen from a little above: its top, front edge and legs. */
function table(): string {
  let out = px("table-top", 196, 150, 204, 50) + px("table-l", 196, 150, 204, 1);
  out += px("table-front", 196, 200, 204, 8) + px("table-d", 196, 208, 204, 1);
  // Legs reach the floor: the whole table group is lifted by LIFT.
  out += px("table-d", 202, 209, 8, LIFT + 3) + px("table-d", 388, 209, 8, LIFT + 3) + px("table-front", 210, 226, 178, 3);
  return out;
}

/** The scroll unrolled across the table, rolls at both ends, lines of text and a margin for the checks. */
function scroll(): string {
  const r = random(53);
  let out = px("parch", 226, 156, 150, 40) + px("parch-d", 226, 194, 150, 2) + px("parch-d", 226, 156, 150, 1);
  for (const x of [218, 374]) {
    out += px("roll", x, 152, 10, 48) + px("roll-l", x + 2, 152, 2, 48) + px("roll-d", x + 7, 152, 3, 48);
    out += px("knob", x + 3, 148, 4, 4) + px("knob", x + 3, 200, 4, 4);
  }
  out += px("parch-d", 352, 160, 1, 32);
  for (let k = 0; k < 8; k++) {
    const y = 161 + k * 4;
    let x = 236;
    const end = k === 7 ? 300 : 346;
    while (x < end) {
      const w = Math.min(end - x, 3 + Math.floor(r() * 7));
      out += px("ink", x, y, w, 1);
      x += w + 2;
    }
  }
  out += px("seal", 234, 190, 5, 4) + px("seal", 235, 189, 3, 6) + px("seal-d", 236, 191, 1, 2);
  return out;
}

/** A stack of books at the back corner of the table. */
function props(): string {
  let out = px("book-a", 380, 124, 20, 9) + px("book-b", 384, 133, 16, 8) + px("book-a", 382, 141, 18, 9);
  out += px("page-edge", 380, 126, 20, 1) + px("page-edge", 384, 135, 16, 1) + px("page-edge", 382, 143, 18, 1);
  return out;
}

/** Lens path: [time s, center x, center y]; segments step at 30 per second. */
const PATH: [number, number, number][] = [
  [0, 250, 166],
  [1, 250, 166],
  [5, 340, 166],
  [6, 340, 178],
  [10, 250, 178],
  [11, 250, 190],
  [15, 340, 190],
  [15.5, 340, 190],
  [17.5, 250, 166],
  [18, 250, 166],
];
const START = { x: 250, y: 166 };
const CHECKS: [number, number][] = [[5, 162], [10, 174], [15, 186]];
const CLEAR_AT = 17;

/** Ring of a circle between radius r0 and r1, as pixel rows. */
function ring(cls: string, cx: number, cy: number, r0: number, r1: number): string {
  let out = "";
  for (let y = -r1; y <= r1; y++) {
    const outer = Math.floor(Math.sqrt(r1 * r1 - y * y));
    const inner = Math.abs(y) < r0 ? Math.floor(Math.sqrt(r0 * r0 - y * y)) : -1;
    if (inner < 0) out += px(cls, cx - outer, cy + y, outer * 2 + 1);
    else out += px(cls, cx - outer, cy + y, outer - inner) + px(cls, cx + inner + 1, cy + y, outer - inner);
  }
  return out;
}

/** The magnifier drawn at START: brass rim, tinted glass with big bold strokes inside, glint, wooden handle. */
function lens(): string {
  const { x: cx, y: cy } = START;
  let out = ring("glass", cx, cy, -1, 9);
  for (const dy of [-5, -1, 3]) {
    const hw = Math.floor(Math.sqrt(81 - (dy + 1) * (dy + 1))) - 1;
    for (let x = -hw; x < hw; x += 7) out += px("big-ink", cx + x, cy + dy, Math.min(5, hw - x), 2);
  }
  out += ring("rim", cx, cy, 9, 11) + px("rim-l", cx - 4, cy - 11, 9, 1);
  out += px("glint", cx - 5, cy - 6, 3, 1) + px("glint", cx - 6, cy - 5, 1, 2);
  for (let i = 0; i < 14; i++) out += px(i < 3 ? "brass" : "grip", cx + 8 + i, cy + 8 + i, 3, 2);
  return out;
}

function lensCss(): string {
  let k = "";
  PATH.forEach(([t, x, y], i) => {
    const next = PATH[i + 1];
    const move = next !== undefined && (next[1] !== x || next[2] !== y);
    const steps = next === undefined ? 1 : move ? Math.round((next[0] - t) * 30) : 1;
    k += `${pct(t)}%{transform:translate(${x - START.x}px,${y - START.y}px);animation-timing-function:steps(${steps})}`;
  });
  return `@keyframes lens{${k}}.lens{animation:lens ${CYCLE}s infinite}`;
}

const CHECK = ["......c", ".....cc", "c...cc.", "cc.cc..", ".ccc...", "..c...."];

function checks(): { body: string; css: string } {
  let body = "";
  let css = "";
  CHECKS.forEach(([t, y], i) => {
    body += `<g class="ck" style="animation-name:ck${i}">${group(() => sprite(CHECK, 358, y, { c: "check" }))}</g>`;
    css += `@keyframes ck${i}{0%{opacity:0}${pct(t)}%{opacity:1}${pct(CLEAR_AT)}%{opacity:0}100%{opacity:0}}`;
  });
  return { body, css };
}

const STYLE = `
svg{--sky-top:#dde6e7;--sky-bot:#d0dbdc;--seam:#d3dedf;--patch:#d8e2e3;--rail:#b5c4c6;--base:#9fb0b2;--base-l:#b4c3c5;
--floor:#7d7b74;--floor-edge:#64625c;--floor-d:#716f69;
--shelf:#a7b5b7;--shelf-d:#96a5a8;--hole:#8d9da0;--roll:#e2d6bc;--roll-l:#efe6d2;--roll-d:#c4b597;--knob:#4e5a5c;
--table-top:#8a7c6c;--table-l:#a09180;--table-front:#6e6254;--table-d:#544a3f;
--parch:#efe5cf;--parch-d:#d9cbad;--ink:#40463f;--seal:#a8473a;--seal-d:#7e3328;
--book-a:#2a7a8a;--book-b:#6a7f72;--page-edge:#e6dcc6;--brass:#a8894c;--grip:#5a4232;
--glass:#cfe8ec;--glass-o:.45;--big-ink:#40463f;--rim:#a8894c;--rim-l:#c8ab6c;--glint:#ffffff;--check:#2a7a8a;--scan:.03}
@media (prefers-color-scheme: dark){svg{--sky-top:#0d1416;--sky-bot:#141c1e;--seam:#0b1113;--patch:#10181a;--rail:#1b2628;--base:#162022;--base-l:#1f2b2e;
--floor:#151615;--floor-edge:#232524;--floor-d:#111211;
--shelf:#1c2628;--shelf-d:#141c1e;--hole:#0c1214;--roll:#6a6352;--roll-l:#7a7260;--roll-d:#504a3c;--knob:#151c1e;
--table-top:#2a241e;--table-l:#352e26;--table-front:#1e1915;--table-d:#15110e;
--parch:#8c8470;--parch-d:#71695a;--ink:#262a26;--seal:#5c261e;--seal-d:#401a15;
--book-a:#17434b;--book-b:#2e3a33;--page-edge:#5e584a;--brass:#5c4a2a;--grip:#2a1f17;
--glass:#6e9aa2;--glass-o:.28;--big-ink:#1c201c;--rim:#6a5530;--rim-l:#84693c;--glint:#c8dadc;--check:#3d9aab;--scan:.09}}
.seam{fill:var(--seam)}.patch{fill:var(--patch)}.rail{fill:var(--rail)}.base{fill:var(--base)}.base-l{fill:var(--base-l)}
.floor{fill:var(--floor)}.floor-edge{fill:var(--floor-edge)}.floor-d{fill:var(--floor-d)}
.shelf{fill:var(--shelf)}.shelf-d{fill:var(--shelf-d)}.hole{fill:var(--hole)}.roll{fill:var(--roll)}.roll-l{fill:var(--roll-l)}.roll-d{fill:var(--roll-d)}.knob{fill:var(--knob)}
.table-top{fill:var(--table-top)}.table-l{fill:var(--table-l)}.table-front{fill:var(--table-front)}.table-d{fill:var(--table-d)}
.parch{fill:var(--parch)}.parch-d{fill:var(--parch-d)}.ink{fill:var(--ink)}.seal{fill:var(--seal)}.seal-d{fill:var(--seal-d)}
.book-a{fill:var(--book-a)}.book-b{fill:var(--book-b)}.page-edge{fill:var(--page-edge)}.brass{fill:var(--brass)}.grip{fill:var(--grip)}
.glass{fill:var(--glass);opacity:var(--glass-o)}.big-ink{fill:var(--big-ink)}.rim{fill:var(--rim)}.rim-l{fill:var(--rim-l)}.glint{fill:var(--glint)}.check{fill:var(--check)}
.ck{opacity:0;animation-duration:${CYCLE}s;animation-timing-function:steps(1);animation-iteration-count:infinite}
`;

/** The whole scene as SVG; under 128 KB, light and dark through prefers-color-scheme. */
export function inspectSvg(): string {
  const c = checks();
  const body = [
    group(wall),
    group(floor),
    group(pigeonholes),
    `<g transform="translate(0,-${LIFT})">`,
    group(table),
    group(props),
    group(scroll),
    c.body,
    `<g class="lens">${group(lens)}</g>`,
    "</g>",
  ].join("\n");
  return scene(STYLE + c.css + lensCss(), "", body);
}
