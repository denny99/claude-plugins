/**
 * Table look "table": the live table's standard backdrop (a scene without a picture) and the build's Done look. A
 * wooden game table seen from above in pixel art: a map on parchment top left, a candle top right whose flame
 * flickers and whose light breathes on the wood with dust drifting in it, dice and coins bottom left (one die rolls
 * across now and then), three miniatures bottom right. The middle stays plain wood so chat text reads over it.
 */
import { H, W, group, px, random, scene, sprite } from "../pixel";

const PLANK = 25;

/** Planks across the whole frame: staggered joints, grain lines and a few knots, quiet enough to read text over. */
function planks(): string {
  const r = random(7);
  let out = "";
  for (let y = 0; y < H; y += PLANK) {
    out += px((y / PLANK) % 2 === 0 ? "wood-a" : "wood-b", 0, y, W, PLANK);
    out += px("seam", 0, y, W, 1) + px("seam-l", 0, y + 1, W, 1);
    const joint = 40 + Math.floor(r() * 320);
    out += px("seam", joint, y, 1, PLANK);
    for (let i = 0; i < 9; i++) {
      const gx = Math.floor(r() * W);
      out += px("grain", gx, y + 3 + Math.floor(r() * (PLANK - 6)), 18 + Math.floor(r() * 60), 1);
    }
    if (r() < 0.45) {
      const kx = Math.floor(r() * (W - 20));
      const ky = y + 8 + Math.floor(r() * 10);
      out += px("knot", kx, ky, 6, 3) + px("grain", kx - 8, ky - 1, 22, 1) + px("grain", kx - 6, ky + 3, 18, 1);
    }
  }
  return out;
}

/** One band of the darkening toward the frame's edge; the bands stack, so each is its own path. */
function edge(i: number): string {
  const d = 6 + i * 6;
  return px("vig", 0, 0, W, d) + px("vig", 0, H - d, W, d) + px("vig", 0, d, d, H - 2 * d) + px("vig", W - d, d, d, H - 2 * d);
}

/** The map: ragged parchment between two rolled ends, a coast, mountains, a dotted route to an X, a compass. */
function map(): string {
  const r = random(19);
  const x0 = 24;
  const y0 = 18;
  const w = 112;
  const h = 72;
  let out = px("shade", x0 - 4, y0 + 5, w + 4, h);
  for (let y = 0; y < h; y++) {
    const l = Math.floor(r() * 2);
    const rr = Math.floor(r() * 2);
    out += px("parch", x0 + l, y0 + y, w - l - rr);
    out += px("parch-d", x0 + l, y0 + y, 2) + px("parch-d", x0 + w - rr - 2, y0 + y, 2);
  }
  out += px("parch-d", x0, y0, w, 2) + px("parch-d", x0, y0 + h - 2, w, 2);
  // Rolled ends.
  out += px("roll", x0 - 6, y0 - 2, 8, h + 4) + px("roll-l", x0 - 4, y0 - 2, 2, h + 4) + px("roll-d", x0, y0 - 2, 2, h + 4);
  out += px("roll", x0 + w - 2, y0 - 2, 8, h + 4) + px("roll-l", x0 + w, y0 - 2, 2, h + 4) + px("roll-d", x0 + w + 4, y0 - 2, 2, h + 4);
  // Coast: sea hatching to its left.
  for (let y = y0 + 6; y < y0 + h - 6; y++) {
    const cx = Math.round(x0 + 30 + 7 * Math.sin((y - y0) / 9) + 3 * Math.sin((y - y0) / 4));
    out += px("ink", cx, y, 2, 1);
    if (y % 5 === 0) for (let sx = x0 + 6; sx < cx - 4; sx += 8) out += px("sea", sx + (y % 10 === 0 ? 3 : 0), y, 4, 1);
  }
  // Mountains.
  for (const [mx, my] of [[64, 34], [74, 40], [86, 33]] as const)
    out += sprite(["..i..", ".i.i.", "i...i"], mx, my, { i: "ink" }, 2);
  // Dotted route to the X.
  for (let t = 0; t <= 1.0001; t += 1 / 14) {
    const rx = Math.round(66 + 50 * t);
    const ry = Math.round(58 + 22 * t - 18 * Math.sin(Math.PI * t));
    out += px("route", rx, ry, 2, 2);
  }
  out += sprite(["x...x", ".x.x.", "..x..", ".x.x.", "x...x"], 116, 74, { x: "route" });
  // Compass.
  out += sprite(["...i...", "...i...", "..iii..", "iiiIiii", "..iii..", "...i...", "...i..."], 120, 24, { i: "ink", I: "route" });
  return out;
}

const CX = 350;

/** The candle's light on the wood: three soft rings, each its own path so they stack; it breathes as one block. */
function ring(rad: number): string {
  let out = "";
  for (let y = -rad; y <= rad; y += 2) {
    const hw = Math.floor(Math.sqrt(rad * rad - y * y) * 1.25);
    out += px("glow", CX - hw, 70 + y, hw * 2, 2);
  }
  return out;
}

/** Brass dish, wax body with drips, the wick. */
function candle(): string {
  let out = px("shade", CX - 26, 92, 38, 8);
  out += px("brass-d", CX - 17, 88, 34, 6) + px("brass", CX - 18, 86, 36, 4) + px("brass-l", CX - 14, 86, 20, 1);
  out += px("brass", CX + 18, 84, 8, 3) + px("brass-d", CX + 22, 82, 5, 5);
  out += px("wax", CX - 6, 46, 12, 41) + px("wax-l", CX - 6, 46, 3, 41) + px("wax-d", CX + 4, 46, 2, 41);
  out += px("wax-top", CX - 5, 44, 10, 3);
  out += px("wax", CX - 7, 52, 2, 9) + px("wax", CX + 5, 49, 2, 14) + px("wax-l", CX - 7, 60, 2, 2);
  out += px("wick", CX - 1, 39, 2, 6);
  return out;
}

// Three frames of the flame, swapped in steps.
const FLAME = [
  ["...o....", "...oo...", "..ooo...", "..oyo...", ".ooyyo..", ".oyyyo..", ".oywyo..", "ooywwyo.", "oyywwyo.", "oyywwyo.", ".oywwo..", ".ooyoo..", "..ooo..."],
  ["....o...", "....oo..", "...ooo..", "...oyo..", "..oyyo..", ".ooyyyo.", ".oywwyo.", ".oywwyo.", "ooywwyo.", "oyywwyo.", ".oywwo..", ".ooyoo..", "..ooo..."],
  ["........", "........", "...o....", "..oo....", "..ooo...", ".ooyo...", ".oyyyo..", ".oywyo..", "ooywwyo.", "oyywwyo.", ".oywwo..", ".ooyoo..", "..ooo..."],
];

function flame(): string {
  return FLAME.map(
    (rows, i) => `<g class="fl f${i}">${group(() => sprite(rows, CX - 4, 28, { o: "fl-o", y: "fl-y", w: "fl-w" }))}</g>`,
  ).join("");
}

/** Dust drifting up through the candle light, staggered on the 1/30 s grid. */
function dust(): string {
  const r = random(23);
  let out = "";
  for (let i = 0; i < 12; i++) {
    const x = CX - 60 + Math.floor(r() * 110);
    const y = 60 + Math.floor(r() * 90);
    const delay = (Math.floor(r() * 270) / 30).toFixed(2);
    out += `<rect class="mote" x="${x}" y="${y}" width="1" height="1" style="animation-delay:-${delay}s"/>`;
  }
  return out;
}

const D20 = [
  "...rrrr...",
  "..rrLLrr..",
  ".rrLLLLrr.",
  "rrLLLLLLrr",
  "rLLLLLLLLr",
  "rddddddddr",
  "rdrddddrdr",
  ".rdrddrdr.",
  "..rddddr..",
  "...rrrr...",
];

/** A d6 body 16 x 16 with light top-left and shaded bottom-right edges. */
function d6(x: number, y: number): string {
  return px("die", x, y, 16, 16) + px("die-l", x, y, 16, 2) + px("die-l", x, y, 2, 16) + px("die-d", x, y + 14, 16, 2) + px("die-d", x + 14, y, 2, 16);
}
function pips(x: number, y: number, at: [number, number][]): string {
  return at.map(([a, b]) => px("pip", x + a, y + b, 2, 2)).join("");
}
const FIVE: [number, number][] = [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]];
const ONE: [number, number][] = [[7, 7]];
const THREE: [number, number][] = [[3, 3], [7, 7], [11, 11]];
const SIX: [number, number][] = [[3, 3], [3, 7], [3, 11], [11, 3], [11, 7], [11, 11]];

/** Still things bottom left: a d20, a d6 showing six, two coins. */
function dice(): string {
  let out = px("shade", 14, 202, 20, 18) + sprite(D20, 18, 198, { r: "d20", L: "d20-l", d: "d20-d" }, 2);
  out += px("shade", 42, 222, 16, 14) + d6(46, 218) + pips(46, 218, SIX);
  for (const [cx, cy] of [[74, 196], [80, 202]] as const) {
    out += px("shade", cx - 8, cy - 2, 12, 8) + px("coin-d", cx - 5, cy - 3, 11, 8) + px("coin", cx - 5, cy - 4, 11, 6) + px("coin-l", cx - 3, cy - 3, 4, 1);
  }
  return out;
}

/** The die that rolls: it rests at the right, tumbles left now and then and back later; faces swap while it moves. */
function roller(): string {
  const x = 118;
  const y = 210;
  const face = (cls: string, at: [number, number][]): string => `<g class="${cls}">${group(() => d6(x, y) + pips(x, y, at))}</g>`;
  return (
    `<g class="tumble">${group(() => px("shade", x - 4, y + 4, 16, 14))}` +
    face("face5", FIVE) +
    face("face1", ONE) +
    face("face3", THREE) +
    `</g>`
  );
}

const KNIGHT = ["..mmm...", "..mMm...", "..mmm...", ".mmmmm..", "smmmmmm.", "ssmmmm.m", "ssmmmm.m", ".mmmmm.m", "..m.m...", "..m.m...", ".bbbbbb.", "bbbbbbbb"];
const WIZARD = ["...h....", "..hh....", "..hhh...", ".hhhhh..", "hhHHHhh.", "..fff..t", ".rrrrr.t", ".rrrrr.t", "rrrrrrrt", "rrrrrrrt", ".bbbbbb.", "bbbbbbbb"];
const GOBLIN = ["........", "........", "g.ggg.g.", "ggggggg.", ".gegeg..", "..ggg...", ".GGGGG..", "G.GGG.Gk", "..GGG..k", "..G.G...", ".bbbbbb.", "bbbbbbbb"];

/** Three miniatures on round bases, bottom right, each with its shadow away from the candle. */
function minis(): string {
  const map = { m: "metal", M: "metal-d", s: "shield", b: "base", h: "hat", H: "hat-d", f: "skin", t: "staff", r: "robe", g: "gob", G: "gob-d", e: "eye", k: "staff" };
  let out = "";
  for (const [rows, x, y] of [[KNIGHT, 300, 186], [WIZARD, 330, 200], [GOBLIN, 362, 182]] as const) {
    out += px("shade", x - 4, y + 18, 16, 8) + px("shade", x - 2, y + 8, 6, 12);
    out += sprite(rows as unknown as string[], x, y, map, 2);
  }
  return out;
}

const STYLE = `
svg{--sky-top:#c0905e;--sky-bot:#b88756;--wood-a:#c0905e;--wood-b:#b88756;--seam:#8e6038;--seam-l:#d0a272;--grain:#a97a4a;--knot:#8a5a32;
--vig:#3a2210;--vig-o:.05;--shade:#2a1608;--shade-o:.16;--glow:#ffd88a;--glow-o:.10;
--parch:#efe0b8;--parch-d:#d6bf8e;--roll:#cdb27e;--roll-l:#ead6aa;--roll-d:#a88c5a;--ink:#5a3a1c;--sea:#8aa6ae;--route:#b0302a;
--brass:#c8a040;--brass-l:#ecd07a;--brass-d:#8a6a22;--wax:#f1e8d2;--wax-l:#fffaf0;--wax-d:#d2c4a2;--wax-top:#fbf6e8;--wick:#2a1a10;
--die:#f2ece0;--die-l:#ffffff;--die-d:#c4b9a6;--pip:#2a1f18;--d20:#a8262a;--d20-l:#d24a4e;--d20-d:#7a1a1e;
--coin:#e2b444;--coin-l:#fbe08a;--coin-d:#a77d1c;--metal:#a9adb5;--metal-d:#6c707a;--shield:#8a2a2a;--base:#3a3330;
--hat:#3a4f9a;--hat-d:#24346a;--skin:#e8c09a;--robe:#4a5fb0;--staff:#6b4a2a;--gob:#5e9a3a;--gob-d:#3d6a26;--eye:#f0e050;
--mote:#fff4d0;--scan:.02}
@media (prefers-color-scheme: dark){svg{--sky-top:#3a2617;--sky-bot:#33210f;--wood-a:#3a2617;--wood-b:#33210f;--seam:#1a1009;--seam-l:#47301e;--grain:#2b1b0e;--knot:#20130a;
--vig:#000000;--vig-o:.12;--shade:#000000;--shade-o:.38;--glow:#ffb04a;--glow-o:.10;
--parch:#a8946a;--parch-d:#7d6a48;--roll:#86704a;--roll-l:#a08a62;--roll-d:#5a4a30;--ink:#2a1c10;--sea:#4a5e66;--route:#8a2420;
--brass:#8a6a2a;--brass-l:#b08c40;--brass-d:#4a3a14;--wax:#d8ccb0;--wax-l:#f0e6cc;--wax-d:#a89c80;--wax-top:#e8dec4;--wick:#120a06;
--die:#c9c1b0;--die-l:#e2dbcc;--die-d:#8a8272;--pip:#1a140f;--d20:#7a1a1e;--d20-l:#a8343a;--d20-d:#4f1013;
--coin:#b08a2c;--coin-l:#d8b04a;--coin-d:#6e5414;--metal:#6c707a;--metal-d:#3e4148;--shield:#5a1a1a;--base:#141210;
--hat:#26346a;--hat-d:#18224a;--skin:#b08a6c;--robe:#2f3e7a;--staff:#4a3220;--gob:#3e6a26;--gob-d:#284a18;--eye:#e0d040;
--mote:#ffd890;--scan:.07}}
.wood-a{fill:var(--wood-a)}.wood-b{fill:var(--wood-b)}.seam{fill:var(--seam)}.seam-l{fill:var(--seam-l)}.grain{fill:var(--grain)}.knot{fill:var(--knot)}
.vig{fill:var(--vig);opacity:var(--vig-o)}.shade{fill:var(--shade);opacity:var(--shade-o)}.glow{fill:var(--glow);opacity:var(--glow-o)}
.parch{fill:var(--parch)}.parch-d{fill:var(--parch-d)}.roll{fill:var(--roll)}.roll-l{fill:var(--roll-l)}.roll-d{fill:var(--roll-d)}
.ink{fill:var(--ink)}.sea{fill:var(--sea)}.route{fill:var(--route)}
.brass{fill:var(--brass)}.brass-l{fill:var(--brass-l)}.brass-d{fill:var(--brass-d)}.wax{fill:var(--wax)}.wax-l{fill:var(--wax-l)}.wax-d{fill:var(--wax-d)}
.wax-top{fill:var(--wax-top)}.wick{fill:var(--wick)}
.die{fill:var(--die)}.die-l{fill:var(--die-l)}.die-d{fill:var(--die-d)}.pip{fill:var(--pip)}.d20{fill:var(--d20)}.d20-l{fill:var(--d20-l)}.d20-d{fill:var(--d20-d)}
.coin{fill:var(--coin)}.coin-l{fill:var(--coin-l)}.coin-d{fill:var(--coin-d)}.metal{fill:var(--metal)}.metal-d{fill:var(--metal-d)}.shield{fill:var(--shield)}.base{fill:var(--base)}
.hat{fill:var(--hat)}.hat-d{fill:var(--hat-d)}.skin{fill:var(--skin)}.robe{fill:var(--robe)}.staff{fill:var(--staff)}.gob{fill:var(--gob)}.gob-d{fill:var(--gob-d)}.eye{fill:var(--eye)}
.fl-o{fill:#ff9a2e}.fl-y{fill:#ffd85a}.fl-w{fill:#fff6d8}
.fl{opacity:0;animation:fl 1.2s steps(1) infinite}.f0{animation-delay:0s}.f1{animation-delay:-.4s}.f2{animation-delay:-.8s}
@keyframes fl{0%{opacity:1}33.3333%{opacity:0}100%{opacity:0}}
.breathe{animation:breathe 3.2s steps(96) infinite}
@keyframes breathe{0%,100%{opacity:1}30%{opacity:.78}55%{opacity:.94}75%{opacity:.84}}
.mote{fill:var(--mote);opacity:0;animation:mote 9s steps(270) infinite}
@keyframes mote{0%{opacity:0;transform:translate(0,0)}20%{opacity:.8}80%{opacity:.5;transform:translate(-8px,-24px)}100%{opacity:0;transform:translate(-10px,-30px)}}
.tumble{animation:tumble 10s steps(300) infinite}
@keyframes tumble{0%,100%{transform:translate(0,0)}3%{transform:translate(-12px,-4px)}6%{transform:translate(-26px,0)}8%{transform:translate(-34px,-2px)}10%,50%{transform:translate(-40px,2px)}53%{transform:translate(-28px,-3px)}56%{transform:translate(-14px,0)}58%{transform:translate(-5px,-2px)}60%{transform:translate(0,0)}}
.face5,.face1,.face3{animation-duration:10s;animation-timing-function:steps(1);animation-iteration-count:infinite}
.face5{animation-name:face5}.face1{animation-name:face1}.face3{animation-name:face3}
@keyframes face5{0%{opacity:1}2%{opacity:0}4%{opacity:1}6%{opacity:0}58%{opacity:1}100%{opacity:1}}
@keyframes face1{0%{opacity:0}2%{opacity:1}4%{opacity:0}6%{opacity:1}8%{opacity:0}50%{opacity:1}52%{opacity:0}54%{opacity:1}56%{opacity:0}100%{opacity:0}}
@keyframes face3{0%{opacity:0}8%{opacity:1}50%{opacity:0}52%{opacity:1}54%{opacity:0}56%{opacity:1}58%{opacity:0}100%{opacity:0}}
`;

/** The whole scene as SVG; under 128 KB, light and dark through prefers-color-scheme. */
export function tableSvg(): string {
  const body = [
    group(planks),
    `<g class="breathe">${group(() => ring(80))}${group(() => ring(56))}${group(() => ring(32))}</g>`,
    group(map),
    group(dice),
    roller(),
    group(minis),
    group(candle),
    flame(),
    dust(),
    ...[0, 1, 2, 3].map((i) => group(() => edge(i))),
  ].join("\n");
  return scene(STYLE, "", body);
}
