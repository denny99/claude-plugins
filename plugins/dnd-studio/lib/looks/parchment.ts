/**
 * Build look "parchment" (stage Lore): a study desk seen from above in pixel art. On the right lies an unrolled map
 * (coast, mountains, forest, a compass rose, a wax seal); a quill draws the dotted route stroke by stroke, rests, and
 * starts again. Books and a candle with a quiet flicker sit on the left. The middle of the desk stays plain.
 */
import { H, W, disc, group, px, random, scene, sprite } from "../pixel";

/** Desk planks: faint grain and seams, the front edge darker at the bottom. */
function desk(): string {
  const r = random(7);
  let out = "";
  for (const y of [48, 98, 148, 198]) out += px("seam", 0, y, W, 1);
  for (let i = 0; i < 70; i++) {
    out += px("grain", Math.floor(r() * W), Math.floor(r() * 236), 8 + Math.floor(r() * 30), 1);
  }
  out += px("edge", 0, 238, W, H - 238) + px("edge-l", 0, 238, W, 1);
  return out;
}

// The map sheet and its two rolls.
const PX0 = 244;
const PX1 = 382;
const PY0 = 56;
const PY1 = 222;

function sheet(): string {
  const r = random(21);
  let out = px("shadow", PX0 + 2, PY1, PX1 - PX0, 4) + px("shadow", PX1 + 10, PY0 + 4, 3, PY1 - PY0);
  out += px("parch", PX0, PY0, PX1 - PX0, PY1 - PY0);
  // Ragged top and bottom edges, a few stains.
  for (let x = PX0; x < PX1; x += 2) {
    if (r() < 0.35) out += px("parch-e", x, PY0, 2, 1);
    if (r() < 0.35) out += px("parch-e", x, PY1 - 1, 2, 1);
  }
  for (let i = 0; i < 9; i++) {
    out += px("parch-d", PX0 + 4 + Math.floor(r() * 120), PY0 + 4 + Math.floor(r() * 150), 6 + Math.floor(r() * 10), 2 + Math.floor(r() * 3));
  }
  // Rolls at both ends: a cylinder in three tones.
  for (const x of [PX0 - 8, PX1]) {
    out += px("roll", x, PY0 - 4, 10, PY1 - PY0 + 8);
    out += px("roll-l", x + 2, PY0 - 4, 2, PY1 - PY0 + 8) + px("roll-d", x + 8, PY0 - 4, 2, PY1 - PY0 + 8);
    out += px("roll-d", x, PY0 - 5, 10, 1) + px("roll-d", x, PY1 + 4, 10, 1);
  }
  return out;
}

/** The coast runs down the sheet; sea to the west with wave marks, land to the east. */
function coastX(y: number): number {
  return Math.round(296 + 14 * Math.sin(y / 19) + 6 * Math.sin(y / 7));
}

const MOUNTAIN = ["...k...", "..kLk..", ".kLLLk.", "kLLLLLk"];
const ROSE = [
  ".....k.....",
  ".....k.....",
  "....kRk....",
  "....kRk....",
  "..k.kRk.k..",
  "kkkkRoRkkkk",
  "..k.kRk.k..",
  "....kRk....",
  "....kRk....",
  ".....k.....",
  ".....k.....",
];
const TREE = [".t.", "ttt", ".k."];
const CASTLE = ["k.k.k", "kkkkk", "k...k", "k.k.k", "kkkkk"];

function map(): string {
  const r = random(33);
  let out = "";
  let prev = coastX(PY0 + 6);
  for (let y = PY0 + 6; y < PY1 - 6; y++) {
    const x = coastX(y);
    out += px("sea", PX0 + 4, y, x - PX0 - 4, 1);
    out += px("ink", Math.min(x, prev), y, Math.abs(x - prev) + 1, 1);
    prev = x;
  }
  // Wave marks in the sea.
  for (let i = 0; i < 14; i++) {
    const y = PY0 + 12 + Math.floor(r() * 140);
    const x = PX0 + 8 + Math.floor(r() * Math.max(4, coastX(y) - PX0 - 20));
    out += px("ink-l", x, y, 2, 1) + px("ink-l", x + 2, y - 1, 2, 1) + px("ink-l", x + 4, y, 2, 1);
  }
  // Mountains along a ridge, a forest of dots, a river down to the coast.
  for (const [x, y] of [
    [324, 112], [338, 120], [352, 108], [316, 128], [344, 134], [360, 124], [332, 98],
  ] as const) out += sprite(MOUNTAIN, x, y, { k: "ink", L: "ink-l" }, 2);
  for (let i = 0; i < 14; i++) out += sprite(TREE, 322 + Math.floor(r() * 48), 166 + Math.floor(r() * 32), { t: "ink-l", k: "ink" });
  for (let y = 146; y < 186; y++) out += px("ink", Math.round(334 - (y - 146) * 0.8 + 3 * Math.sin(y / 5)), y, 1, 1);
  out += sprite(ROSE, 258, 68, { k: "ink", R: "ink-l", o: "seal" });
  // Town at the start of the route, castle at its end.
  out += px("ink", 302, 196, 5, 5) + px("parch", 303, 197, 3, 3);
  out += sprite(CASTLE, 356, 80, { k: "ink" }, 2);
  // Border line around the map.
  out += px("ink-l", PX0 + 3, PY0 + 3, PX1 - PX0 - 6, 1) + px("ink-l", PX0 + 3, PY1 - 4, PX1 - PX0 - 6, 1);
  out += px("ink-l", PX0 + 3, PY0 + 3, 1, PY1 - PY0 - 6) + px("ink-l", PX1 - 4, PY0 + 3, 1, PY1 - PY0 - 6);
  return out;
}

/** Wax seal with two ribbon tails, bottom left of the sheet. */
function seal(): string {
  let out = px("ribbon", 252, 206, 3, 14) + px("ribbon", 258, 206, 3, 12);
  out += disc("seal", 256, 204, 7) + disc("seal-l", 255, 203, 4) + px("seal-d", 254, 202, 3, 3);
  return out;
}

// The route: a polyline from the town to the castle, cut into dashes that appear one by one.
const ROUTE: [number, number][] = [
  [306, 194], [314, 182], [312, 168], [320, 156], [316, 144], [326, 138], [334, 148], [348, 146], [356, 134], [372, 120], [368, 104], [362, 92],
];
const DASH = 3;
const GAP = 3;
const STEP = 0.3;
const CYCLE = 13;

function dashes(): { x: number; y: number; d: string }[] {
  const out: { x: number; y: number; d: string }[] = [];
  let travelled = 0;
  let cur: string[] = [];
  let tip = ROUTE[0];
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax, ay] = ROUTE[i - 1];
    const [bx, by] = ROUTE[i];
    const len = Math.hypot(bx - ax, by - ay);
    for (let s = 0; s < len; s++) {
      const x = Math.round(ax + ((bx - ax) * s) / len);
      const y = Math.round(ay + ((by - ay) * s) / len);
      const on = travelled % (DASH + GAP) < DASH;
      if (on) {
        cur.push(`M${x} ${y}h2v2h-2z`);
        tip = [x, y];
      } else if (cur.length > 0) {
        out.push({ x: tip[0], y: tip[1], d: cur.join("") });
        cur = [];
      }
      travelled++;
    }
  }
  if (cur.length > 0) out.push({ x: tip[0], y: tip[1], d: cur.join("") });
  return out;
}

const pct = (t: number): string => `${+((t / CYCLE) * 100).toFixed(3)}%`;

/** Each dash fades in at its own frame and all vanish together near the end of the cycle. */
function route(): { svg: string; css: string } {
  const list = dashes();
  const end = list.length * STEP + 3;
  let svg = "";
  let css = "";
  const quill: string[] = [];
  list.forEach((dash, i) => {
    const t = (i + 1) * STEP;
    svg += `<path class="route dash r${i}" d="${dash.d}"/>`;
    css += `.r${i}{animation-name:r${i}}@keyframes r${i}{0%{opacity:0}${pct(t)}{opacity:1}${pct(end)},100%{opacity:0}}`;
    quill.push(`${pct(t)}{transform:translate(${dash.x + 2}px,${dash.y + 1}px)}`);
  });
  const first = list[0];
  const last = list[list.length - 1];
  css +=
    `@keyframes quill{0%{transform:translate(${first.x}px,${first.y}px)}${quill.join("")}` +
    `${pct(end - 2)}{transform:translate(${last.x + 10}px,${last.y - 10}px)}` +
    `${pct(end)}{transform:translate(${first.x + 14}px,${first.y - 4}px)}100%{transform:translate(${first.x}px,${first.y}px)}}`;
  return { svg, css };
}

// Quill with its tip at the origin, pointing down left.
const QUILL = [
  "...........vv",
  "..........vvv",
  ".........vvVv",
  "........vvVvv",
  ".......vvVvv.",
  "......vvVvv..",
  ".....wvVvv...",
  "....wvVvv....",
  "....wVvv.....",
  "...wVvv......",
  "...wVv.......",
  "..sV.........",
  ".ss..........",
  ".s...........",
  "t............",
];

function quill(): string {
  const shadow = QUILL.map((row) => row.replace(/[^.]/g, "q"));
  return (
    group(() => sprite(shadow, 3, -24, { q: "shadow" }, 2)) +
    group(() => sprite(QUILL, 0, -28, { v: "vane", w: "vane-d", V: "shaft", s: "shaft", t: "ink" }, 2))
  );
}

/** Inkwell beside the sheet. */
function inkwell(): string {
  return disc("shadow", 220, 214, 9) + disc("glass", 218, 211, 9) + disc("glass-l", 216, 209, 4) + disc("ink", 218, 211, 4);
}

/** Two books stacked at the left, one with a ribbon bookmark. */
function books(): string {
  let out = px("shadow", 18, 166, 70, 56);
  out += px("book-a", 14, 162, 70, 56) + px("book-a-d", 14, 162, 6, 56);
  out += px("pages", 84, 164, 3, 52) + px("pages", 16, 218, 68, 3);
  out += px("shadow", 32, 148, 58, 46);
  out += px("book-b", 28, 144, 58, 46) + px("book-b-d", 28, 144, 5, 46);
  out += px("pages", 86, 146, 3, 42) + px("pages", 30, 190, 56, 3);
  out += px("gilt", 44, 160, 30, 1) + px("gilt", 44, 176, 30, 1) + px("gilt", 52, 165, 14, 7);
  out += px("ribbon", 70, 190, 3, 14) + px("ribbon", 71, 204, 2, 2);
  return out;
}

/** Candle in a brass dish, seen from above. */
function candle(): string {
  return disc("shadow", 52, 84, 13) + disc("brass-d", 50, 80, 13) + disc("brass", 50, 80, 11) + disc("wax-d", 50, 80, 6) + disc("wax", 50, 80, 5);
}

const FLAME_A = ["...f...", "..fFf..", ".fFFFf.", ".fFFFf.", "..fFf..", "...k..."];
const FLAME_B = ["..f....", "..fFf..", ".fFFf..", ".fFFFf.", "..fFf..", "...k..."];

function flame(): string {
  return (
    `<g class="fa">${group(() => sprite(FLAME_A, 47, 75, { f: "flame", F: "flame-hot", k: "wick" }))}</g>` +
    `<g class="fb">${group(() => sprite(FLAME_B, 47, 75, { f: "flame", F: "flame-hot", k: "wick" }))}</g>`
  );
}

function glow(): string {
  return disc("glow", 50, 80, 34) + disc("glow", 50, 80, 22);
}

const STYLE = `
svg{--sky-top:#dcc7a5;--sky-bot:#ceb38d;--grain:#d2ba95;--seam:#c9ad86;--edge:#a3825d;--edge-l:#b8986f;
--parch:#f1e5c8;--parch-d:#e8d8b6;--parch-e:#dcc79e;--roll:#e0cda6;--roll-l:#f4ead2;--roll-d:#bfa278;
--sea:#e6d7b6;--ink:#6e4c2c;--ink-l:#b49470;--route:#9a6a2a;--shadow:#5a3e22;--shadow-o:.16;
--seal:#a33a2c;--seal-l:#c25a48;--seal-d:#7c241a;--ribbon:#8c2e24;
--vane:#f6f1e6;--vane-d:#d4c9b4;--shaft:#8f6c46;--glass:#5a5f66;--glass-l:#8d949c;
--book-a:#7c4434;--book-a-d:#5e3024;--book-b:#4a5f4c;--book-b-d:#364838;--pages:#efe4c9;--gilt:#c9a24c;
--brass:#b48c42;--brass-d:#8a6a2c;--wax:#f3ebd8;--wax-d:#ddd0b4;--wick:#3a2a1a;--glow:#ffc770;--glow-o:.10;--scan:.03}
@media (prefers-color-scheme: dark){svg{--sky-top:#150f0a;--sky-bot:#1f160f;--grain:#1a130d;--seam:#120d09;--edge:#0c0805;--edge-l:#1a120c;
--parch:#4f4431;--parch-d:#483d2c;--parch-e:#3c3225;--roll:#3f3526;--roll-l:#564a36;--roll-d:#2a2219;
--sea:#463c2b;--ink:#1f160d;--ink-l:#342a1d;--route:#b07e3e;--shadow:#000;--shadow-o:.35;
--seal:#6a2219;--seal-l:#843426;--seal-d:#4a150f;--ribbon:#561a13;
--vane:#9a9384;--vane-d:#6e685c;--shaft:#4e3a26;--glass:#23262a;--glass-l:#3a3f45;
--book-a:#3a2018;--book-a-d:#2a160f;--book-b:#223024;--book-b-d:#18221a;--pages:#5c523f;--gilt:#6e5a2e;
--brass:#5e4a26;--brass-d:#3e3018;--wax:#7a7262;--wax-d:#5e5748;--wick:#120c06;--glow:#ff9a3c;--glow-o:.08;--scan:.09}}
.seam{fill:var(--seam)}.grain{fill:var(--grain)}.edge{fill:var(--edge)}.edge-l{fill:var(--edge-l)}
.parch{fill:var(--parch)}.parch-d{fill:var(--parch-d)}.parch-e{fill:var(--parch-e)}
.roll{fill:var(--roll)}.roll-l{fill:var(--roll-l)}.roll-d{fill:var(--roll-d)}
.sea{fill:var(--sea)}.ink{fill:var(--ink)}.ink-l{fill:var(--ink-l)}.route{fill:var(--route)}
.shadow{fill:var(--shadow);opacity:var(--shadow-o)}
.seal{fill:var(--seal)}.seal-l{fill:var(--seal-l)}.seal-d{fill:var(--seal-d)}.ribbon{fill:var(--ribbon)}
.vane{fill:var(--vane)}.vane-d{fill:var(--vane-d)}.shaft{fill:var(--shaft)}.glass{fill:var(--glass)}.glass-l{fill:var(--glass-l)}
.book-a{fill:var(--book-a)}.book-a-d{fill:var(--book-a-d)}.book-b{fill:var(--book-b)}.book-b-d{fill:var(--book-b-d)}
.pages{fill:var(--pages)}.gilt{fill:var(--gilt)}
.brass{fill:var(--brass)}.brass-d{fill:var(--brass-d)}.wax{fill:var(--wax)}.wax-d{fill:var(--wax-d)}.wick{fill:var(--wick)}
.flame{fill:#ff9a3c}.flame-hot{fill:#ffe08a}.glow{fill:var(--glow);opacity:var(--glow-o)}
.fa{animation:swap 1.6s steps(1) infinite}.fb{animation:swap 1.6s steps(1) infinite;animation-delay:-.8s}
@keyframes swap{0%{opacity:1}50%{opacity:0}}
.halo{animation:halo 3.2s steps(96) infinite}
@keyframes halo{0%,100%{opacity:1}40%{opacity:.8}70%{opacity:.92}}
.dash{opacity:0;animation-duration:${CYCLE}s;animation-timing-function:steps(1,end);animation-iteration-count:infinite}
.quill{animation:quill ${CYCLE}s steps(1,end) infinite}
`;

/** The whole scene as SVG; under 128 KB, light and dark through prefers-color-scheme. */
export function parchmentSvg(): string {
  const r = route();
  const body = [
    group(desk),
    `<g class="halo">${group(glow)}</g>`,
    group(sheet),
    group(map),
    r.svg,
    group(seal),
    group(inkwell),
    group(books),
    group(candle),
    flame(),
    `<g class="quill">${quill()}</g>`,
  ].join("\n");
  return scene(STYLE + r.css, "", body);
}
