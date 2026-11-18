/**
 * Build look "stage" (stage Voices): a small theatre stage in pixel art. Red curtains gathered at both sides, a
 * scalloped valance on top, plank boards with footlights along the edge. A spotlight hangs at the right and its soft
 * cone sways slowly over a stool with a mask. The backdrop in the middle stays plain so chat text reads over it.
 */
import { H, W, group, px, random, scene, sprite } from "../pixel";

const FOLDS = ["cur-l", "cur", "cur-d", "cur", "cur-l", "cur-d"];

/** One curtain: vertical folds, gathered by a tieback, flaring to the floor. `left` mirrors it. */
function curtain(left: boolean): string {
  let out = "";
  for (let y = 16; y < 222; y += 3) {
    // Width in art pixels: 62 at the top, 34 at the tieback (y 150), 50 at the floor.
    const w = y < 150 ? Math.round(62 - (28 * (y - 16)) / 134) : Math.round(34 + (16 * (y - 150)) / 72);
    const fold = w / FOLDS.length;
    FOLDS.forEach((cls, i) => {
      const a = Math.round(i * fold);
      const b = Math.round((i + 1) * fold);
      out += px(cls, left ? a : W - b, y, b - a, 3);
    });
  }
  // Tieback.
  out += left ? px("gold", 0, 148, 36, 4) + px("gold-d", 34, 146, 5, 8) : px("gold", W - 36, 148, 36, 4) + px("gold-d", W - 39, 146, 5, 8);
  return out;
}

/** Valance across the top with scalloped hem and a gold fringe. */
function valance(): string {
  let out = px("cur", 0, 0, W, 16) + px("cur-d", 0, 0, W, 2);
  for (let x = 0; x < W; x += 40) {
    for (let i = 0; i < 40; i++) {
      const d = Math.round(8 * Math.sqrt(Math.max(0, 1 - ((i - 19.5) / 20) ** 2)));
      if (d > 0) out += px("cur", x + i, 16, 1, d);
      out += px("gold", x + i, 16 + d, 1, 2);
    }
  }
  return out;
}

/** Faint backdrop cloth: a few vertical seams. */
function backdrop(): string {
  let out = "";
  for (let x = 40; x < W; x += 64) out += px("seam", x, 24, 1, 184);
  return out;
}

/** Plank floor, the stage lip, and the dark apron in front. */
function boards(): string {
  const r = random(13);
  let out = px("board", 0, 208, W, 26) + px("board-l", 0, 208, W, 1);
  for (let y = 214; y < 234; y += 6) {
    out += px("board-d", 0, y, W, 1);
    for (let i = 0; i < 5; i++) out += px("board-d", Math.floor(r() * W), y - 5, 1, 5);
  }
  out += px("lip", 0, 234, W, 3) + px("apron", 0, 237, W, H - 237);
  return out;
}

function footlights(): string {
  let out = "";
  for (let x = 72; x < 330; x += 32) out += px("hood", x, 229, 10, 5) + px("bulb", x + 3, 227, 4, 2);
  return out;
}

function footglow(): string {
  let out = px("fglow", 60, 224, 280, 5);
  for (let x = 72; x < 330; x += 32) out += px("fglow", x - 3, 220, 16, 4) + px("fglow", x, 216, 10, 4);
  return out;
}

/** The spotlight hangs from a bar under the valance. */
function lamp(): string {
  return px("iron", 286, 20, 30, 2) + px("iron", 299, 22, 2, 4) + px("iron", 294, 26, 12, 9) + px("iron-l", 294, 26, 12, 1) + px("lens", 296, 35, 8, 2);
}

/** The cone and its pool on the boards; drawn straight down, the CSS sways it around the lamp. */
function cone(): string {
  let out = "";
  for (let y = 37; y < 210; y += 2) {
    const hw = Math.round(4 + ((y - 37) * 40) / 173);
    out += px("beam", 300 - hw, y, hw * 2, 2);
  }
  for (let dy = -6; dy <= 6; dy += 2) {
    const hw = Math.round(48 * Math.sqrt(1 - (dy / 7) ** 2));
    out += px("pool", 300 - hw, 214 + dy, hw * 2, 2);
  }
  return out;
}

const MASK = [
  "..mmmmmmmm..",
  ".mmmmmmmmmm.",
  "mmmmmmmmmmmm",
  "mmeemmmmeemm",
  "mmmemmmmemmm",
  "mmmmmmmmmmmm",
  "mmmmmmmmmmmm",
  ".memmmmmmem.",
  "..meeeeeem..",
  "...mmmmmm...",
];

function stool(): string {
  let out = px("wood", 278, 186, 44, 4) + px("wood-l", 278, 186, 44, 1);
  out += px("wood-d", 282, 190, 3, 20) + px("wood-d", 315, 190, 3, 20) + px("wood-d", 285, 200, 30, 2);
  out += sprite(MASK, 288, 166, { m: "mask", e: "mask-e" }, 2) + px("ribbon", 286, 172, 2, 14) + px("ribbon", 312, 172, 2, 12);
  return out;
}

const STYLE = `
svg{--sky-top:#e6d8da;--sky-bot:#dac8cc;--seam:#d6c2c6;--cur:#b25a66;--cur-l:#c4727c;--cur-d:#93424f;--gold:#c8a464;--gold-d:#a4844a;
--board:#a88870;--board-l:#bea088;--board-d:#937560;--lip:#6e5444;--apron:#5a4236;--hood:#4a3a36;--bulb:#fff0c8;--fglow:#ffe2a0;--fglow-o:.16;
--iron:#4a4048;--iron-l:#6a5e66;--lens:#fff4d8;--beam:#fff6e4;--beam-o:.24;--pool:#fff6e4;--pool-o:.36;
--wood:#7a5a4a;--wood-l:#947060;--wood-d:#5e4438;--mask:#f2e8de;--mask-e:#5a3a44;--ribbon:#a03a4a;--scan:.03}
@media (prefers-color-scheme: dark){svg{--sky-top:#140b0e;--sky-bot:#1e1115;--seam:#1a0f13;--cur:#4e1a24;--cur-l:#5e2430;--cur-d:#3a121a;--gold:#6a5430;--gold-d:#4e3e22;
--board:#2c1f1c;--board-l:#3a2a25;--board-d:#211714;--lip:#1a1210;--apron:#120c0b;--hood:#1a1414;--bulb:#ffd88a;--fglow:#ffc870;--fglow-o:.10;
--iron:#221c20;--iron-l:#342b31;--lens:#ffe8b0;--beam:#ffe6b8;--beam-o:.07;--pool:#ffe6b8;--pool-o:.12;
--wood:#33241e;--wood-l:#42302a;--wood-d:#231814;--mask:#8a8078;--mask-e:#1e1216;--ribbon:#6a2230;--scan:.09}}
.seam{fill:var(--seam)}.cur{fill:var(--cur)}.cur-l{fill:var(--cur-l)}.cur-d{fill:var(--cur-d)}.gold{fill:var(--gold)}.gold-d{fill:var(--gold-d)}
.board{fill:var(--board)}.board-l{fill:var(--board-l)}.board-d{fill:var(--board-d)}.lip{fill:var(--lip)}.apron{fill:var(--apron)}
.hood{fill:var(--hood)}.bulb{fill:var(--bulb)}.fglow{fill:var(--fglow);opacity:var(--fglow-o)}
.iron{fill:var(--iron)}.iron-l{fill:var(--iron-l)}.lens{fill:var(--lens)}
.beam{fill:var(--beam);opacity:var(--beam-o)}.pool{fill:var(--pool);opacity:var(--pool-o)}
.wood{fill:var(--wood)}.wood-l{fill:var(--wood-l)}.wood-d{fill:var(--wood-d)}.mask{fill:var(--mask)}.mask-e{fill:var(--mask-e)}.ribbon{fill:var(--ribbon)}
.sway{transform-origin:300px 36px;animation:sway 12s steps(180) infinite}
.pulse{animation:pulse 4s steps(60) infinite}
.foot{animation:pulse 6s steps(90) infinite;animation-delay:-1s}
@keyframes sway{0%,100%{transform:skewX(-7deg)}50%{transform:skewX(7deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.8}}
`;

/** The whole scene as SVG; under 128 KB, light and dark through prefers-color-scheme. */
export function stageSvg(): string {
  const body = [
    group(backdrop),
    group(boards),
    group(stool),
    `<g class="sway"><g class="pulse">${group(cone)}</g></g>`,
    group(lamp),
    `<g class="foot">${group(footglow)}</g>`,
    group(footlights),
    group(() => curtain(true)),
    group(() => curtain(false)),
    group(valance),
  ].join("\n");
  return scene(STYLE, "", body);
}
