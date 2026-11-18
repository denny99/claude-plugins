/**
 * Build look "forge" (stage Fixes): a smithy in pixel art. The hearth glows on the right, sparks spring from the
 * anvil now and then, tools hang on the left wall. The middle of the wall stays plain so chat text reads over it.
 */
import { H, W, group, px, random, scene, sprite } from "../pixel";

/** Stone wall: courses of bricks with a few darker stones, quiet enough to read text over. */
function wall(): string {
  const r = random(11);
  let out = "";
  for (let y = 0; y < 212; y += 8) {
    out += px("mortar", 0, y, W, 1);
    const shift = (y / 8) % 2 === 0 ? 0 : 8;
    for (let x = -shift; x < W; x += 16) {
      out += px("mortar", Math.max(0, x), y + 1, 1, 7);
      if (r() < 0.18) out += px("stone-d", Math.max(0, x + 1), y + 1, 15, 7);
    }
  }
  return out;
}

function floor(): string {
  const r = random(5);
  let out = px("floor", 0, 212, W, H - 212) + px("floor-edge", 0, 212, W, 2);
  for (let i = 0; i < 40; i++) out += px("floor-d", Math.floor(r() * W), 216 + Math.floor(r() * 32), 2 + Math.floor(r() * 4), 1);
  return out;
}

/** The forge: chimney hood, stone hearth, the glowing opening with coals. */
function hearth(): string {
  let out = "";
  // Chimney stack and hood.
  out += px("hood", 318, 0, 44, 70);
  for (let i = 0; i < 40; i++) out += px("hood", 318 - Math.floor(i / 2), 70 + i, 44 + Math.floor(i / 2) * 2, 1);
  out += px("hood-d", 298, 110, 84, 3);
  // Hearth block.
  out += px("stone", 292, 150, 96, 62) + px("stone-l", 292, 150, 96, 3);
  for (let y = 158; y < 212; y += 9) out += px("mortar", 292, y, 96, 1);
  // Opening: dark at the top, warmer toward the coals.
  out += px("pit", 306, 160, 68, 30);
  return out;
}

/** The heat: warm bands in the opening and a soft light on the floor in front; flickers as one block. */
function heat(): string {
  let out = px("heat1", 306, 172, 68, 6) + px("heat2", 306, 178, 68, 7);
  for (let i = 0; i < 8; i++) out += px("floorglow", 300 - i * 6, 212 + i * 2, 80 + i * 12, 2);
  return out;
}

// Two frames of low flames over the coals, swapped in steps.
const FLAMES_A = [
  "......f.........f..........f.........f..........f.......f.......",
  ".....ff....f...fff....f...ff....f...fff...f....ff...f..fff......",
  "....fFf...ff..fFFf...ff..fFf...ff..fFFf..ff...fFf..ff.fFFf..f...",
];
const FLAMES_B = [
  "........f.........f.........f..........f.........f.......f......",
  "...f...fff...f...ff....f...fff....f....ff...f...fff...f..ff.....",
  "..ff..fFFf..ff..fFf...ff..fFFf...ff...fFf..ff..fFFf..ff.fFf..f..",
];

function flames(): string {
  return (
    `<g class="fa">${group(() => sprite(FLAMES_A, 308, 182, { f: "flame", F: "flame-hot" }))}</g>` +
    `<g class="fb">${group(() => sprite(FLAMES_B, 308, 182, { f: "flame", F: "flame-hot" }))}</g>`
  );
}

const COALS = [
  "....c..cc...c.....c..c..cc.....c...c.....c..cc....c..c...c...c..",
  "..ccCcccCcc.cccCccccCcccCCcc.cccCcccccCcccccCCcccccCcccCcccCcc..",
  ".cCCcCCCcCCcCCCcCCCCcCCCCCCcCCCCcCCCCCcCCCCCcCCCCCCcCCCCcCCCcCc.",
  "kCCCkCCCkCCCkCCCCkCCkCCCCkCCCkCCCCkCCCkCCCkCCCCkCCCkCCCCkCCCkCCk",
];

function coals(): string {
  return sprite(COALS, 308, 185, { c: "ember", C: "coal-hot", k: "coal" });
}

/** Anvil 34 x 22 art pixels at scale 2 on the floor, a hammer resting on its face. */
const ANVIL = [
  "..........hh......................",
  "..........hh......................",
  "....wwwwwwwwwwwwwwwwwwwwwwwwwwww..",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ".aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.",
  "...aaaaaaaaaaaaaaaaaaaaaaaaaaaa...",
  ".......dddddddddddddddddddd.......",
  ".........dddddddddddddddd.........",
  ".........dddddddddddddddd.........",
  ".........dddddddddddddddd.........",
  "........dddddddddddddddddd........",
  "......dddddddddddddddddddddd......",
  "....dddddddddddddddddddddddddd....",
  "....bbbbbbbbbbbbbbbbbbbbbbbbbb....",
  "....bbbbbbbbbbbbbbbbbbbbbbbbbb....",
  "....bbbbbbbbbbbbbbbbbbbbbbbbbb....",
  "....bbbbbbbbbbbbbbbbbbbbbbbbbb....",
  "....bbbbbbbbbbbbbbbbbbbbbbbbbb....",
  "....bbbbbbbbbbbbbbbbbbbbbbbbbb....",
  "....bbbbbbbbbbbbbbbbbbbbbbbbbb....",
  "...bbbbbbbbbbbbbbbbbbbbbbbbbbbb...",
  "..bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb..",
];
const HAMMER = ["..........", "MMMMM.....", "MMMMMttttttttt", "MMMMM....."];
const HOT_BAR = ["oooooooooooo"];

function anvil(x: number, y: number): string {
  return (
    sprite(ANVIL, x, y, { a: "iron", w: "iron-l", d: "iron-d", h: "iron-l", b: "block" }, 2) +
    sprite(HAMMER, x + 8, y - 8, { M: "iron-d", t: "handle" }, 2) +
    sprite(HOT_BAR, x + 36, y + 2, { o: "hot-bar" }, 2)
  );
}

/** Tool rack on the left wall: a beam with tongs, hammers and a file hanging from pegs. */
function rack(): string {
  let out = px("beam", 18, 70, 92, 5) + px("beam-d", 18, 75, 92, 1);
  for (const x of [28, 48, 70, 92]) out += px("peg", x, 75, 2, 3);
  // Tongs.
  out += sprite(["t.t", "t.t", "t.t", "t.t", "t.t", "t.t", ".t.", "t.t", "t.t", "t.t", "t.t", "t.t", "t.t"], 27, 78, { t: "iron-d" });
  // Two hammers.
  out += px("handle", 48, 78, 2, 20) + px("iron-d", 44, 96, 10, 5);
  out += px("handle", 70, 78, 2, 16) + px("iron-d", 67, 92, 8, 4);
  // A file.
  out += px("iron", 92, 78, 2, 22) + px("handle", 92, 78, 2, 6);
  return out;
}

/** Quench barrel at the left with a dark water face. */
function barrel(): string {
  let out = px("wood", 30, 182, 34, 30);
  for (const y of [186, 198, 208]) out += px("iron-d", 30, y, 34, 2);
  out += px("water", 32, 180, 30, 3) + px("wood-d", 30, 180, 2, 32) + px("wood-d", 62, 180, 2, 32);
  return out;
}

/** Sparks from the hot bar on the anvil; each takes one of three arcs, staggered, with long rests between. */
function sparks(x: number, y: number): string {
  const r = random(3);
  let out = "";
  for (let i = 0; i < 9; i++) {
    const delay = (Math.floor(r() * 30) * (4.8 / 30)).toFixed(2);
    out += `<rect class="spark a${i % 3}" x="${x + (i % 4) * 2}" y="${y}" width="2" height="2" style="animation-delay:-${delay}s"/>`;
  }
  return out;
}

const STYLE = `
svg{--sky-top:#d9c3a3;--sky-bot:#c8ab86;--mortar:#c4a883;--stone-d:#cfb48f;--stone:#9a8166;--stone-l:#b39a7c;
--hood:#7d6a58;--hood-d:#5e4f42;--pit:#3b2618;--floor:#8a6d52;--floor-edge:#6f5540;--floor-d:#7a5f47;
--iron:#4c4f57;--iron-l:#6c707a;--iron-d:#33353b;--block:#6b4a30;--handle:#8a5a32;--beam:#6b4a30;--beam-d:#4f3522;--peg:#3d2a1c;
--wood:#7a5232;--wood-d:#5a3a22;--water:#3a5368;--glow:#ffb35c;--glow-o:.10;--scan:.03}
@media (prefers-color-scheme: dark){svg{--sky-top:#120c09;--sky-bot:#21160f;--mortar:#0d0907;--stone-d:#1a120d;--stone:#2c2119;--stone-l:#3a2c21;
--hood:#1f1813;--hood-d:#140f0b;--pit:#080504;--floor:#1a120d;--floor-edge:#2a1d14;--floor-d:#140d09;
--iron:#2c2e34;--iron-l:#474a53;--iron-d:#1a1b1f;--block:#2a1c12;--handle:#4a301b;--beam:#2e1f14;--beam-d:#1e140c;--peg:#120c08;
--wood:#33221a;--wood-d:#221610;--water:#16222c;--glow:#ff8a2e;--glow-o:.07;--scan:.09}}
.mortar{fill:var(--mortar)}.stone-d{fill:var(--stone-d)}.stone{fill:var(--stone)}.stone-l{fill:var(--stone-l)}
.hood{fill:var(--hood)}.hood-d{fill:var(--hood-d)}.pit{fill:var(--pit)}
.floor{fill:var(--floor)}.floor-edge{fill:var(--floor-edge)}.floor-d{fill:var(--floor-d)}
.iron{fill:var(--iron)}.iron-l{fill:var(--iron-l)}.iron-d{fill:var(--iron-d)}.block{fill:var(--block)}.handle{fill:var(--handle)}
.beam{fill:var(--beam)}.beam-d{fill:var(--beam-d)}.peg{fill:var(--peg)}.wood{fill:var(--wood)}.wood-d{fill:var(--wood-d)}.water{fill:var(--water)}
.coal{fill:#5a1e0e}.ember{fill:#ff9a3c}.coal-hot{fill:#ffcf5a}.hot-bar{fill:#ffb347}
.heat1{fill:#7a2a10}.heat2{fill:#b8461a}.floorglow{fill:var(--glow);opacity:var(--glow-o)}
.flame{fill:#ff8a2a}.flame-hot{fill:#ffd35a}
.fa{animation:swap 1.2s steps(1) infinite}.fb{animation:swap 1.2s steps(1) infinite;animation-delay:-.6s}
@keyframes swap{0%{opacity:1}50%{opacity:0}}
.glow{animation:glow 3.2s steps(96) infinite}
.coals{animation:flicker 1.6s steps(48) infinite}
.spark{fill:#ffd36b;opacity:0;animation-duration:4.8s;animation-timing-function:steps(144);animation-iteration-count:infinite}
.a0{animation-name:sp0}.a1{animation-name:sp1}.a2{animation-name:sp2}
@keyframes glow{0%,100%{opacity:1}30%{opacity:.82}55%{opacity:.95}75%{opacity:.86}}
@keyframes flicker{0%{opacity:1}35%{opacity:.78}60%{opacity:1}80%{opacity:.88}}
@keyframes sp0{0%{opacity:1;transform:translate(0,0)}12%{opacity:.8;transform:translate(-14px,-18px)}20%{opacity:0;transform:translate(-22px,-10px)}100%{opacity:0}}
@keyframes sp1{0%{opacity:1;transform:translate(0,0)}10%{opacity:.8;transform:translate(6px,-22px)}18%{opacity:0;transform:translate(10px,-14px)}100%{opacity:0}}
@keyframes sp2{0%{opacity:1;transform:translate(0,0)}14%{opacity:.8;transform:translate(18px,-14px)}22%{opacity:0;transform:translate(26px,-4px)}100%{opacity:0}}
`;

/** The whole scene as SVG; under 128 KB, light and dark through prefers-color-scheme. */
export function forgeSvg(): string {
  const body = [
    group(wall),
    group(hearth),
    group(floor),
    `<g class="glow">${group(heat)}</g>`,
    flames(),
    `<g class="coals">${group(coals)}</g>`,
    group(rack),
    group(barrel),
    group(() => anvil(206, 168)),
    sparks(250, 168),
  ].join("\n");
  return scene(STYLE, "", body);
}
