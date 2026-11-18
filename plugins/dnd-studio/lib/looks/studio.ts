/**
 * Build look "studio" (stage Pictures): a painter's workshop in pixel art. An easel on the right holds a small
 * landscape; a brush travels over it and sets dabs one after another (clouds, a bird, flowers), then the canvas rests
 * and starts over. A stool with palette and brush jar stands beside it, daylight falls in through a window on the left.
 */
import { H, W, disc, group, px, random, scene, sprite } from "../pixel";

/** One painting cycle in seconds. */
const CYCLE = 12;
const pct = (t: number): string => ((t / CYCLE) * 100).toFixed(4);

/** Warm plaster wall with a few hairline cracks and a baseboard. */
function wall(): string {
  const r = random(17);
  let out = "";
  for (let i = 0; i < 40; i++) out += px("patch", Math.floor(r() * W), Math.floor(r() * 200), 4 + Math.floor(r() * 10), 1);
  out += sprite(["c.....", ".c....", ".cc...", "...c..", "...cc.", ".....c"], 150, 30, { c: "crack" }, 1);
  out += sprite(["...c", "..c.", "cc..", "c..."], 214, 150, { c: "crack" }, 1);
  out += px("base", 0, 204, W, 8) + px("base-l", 0, 204, W, 1);
  return out;
}

function floor(): string {
  const r = random(23);
  let out = px("floor", 0, 212, W, H - 212) + px("floor-edge", 0, 212, W, 2);
  for (let y = 220; y < H; y += 8) out += px("floor-d", 0, y, W, 1);
  for (let i = 0; i < 14; i++) out += px("floor-d", Math.floor(r() * W), 214 + Math.floor(r() * 4) * 8, 1, 7);
  // A few old paint drips under the easel.
  const drips: [number, number, string][] = [[312, 224, "p-red"], [340, 230, "p-blue"], [356, 222, "p-yellow"], [298, 236, "p-green"], [326, 242, "p-red"]];
  for (const [x, y, cls] of drips) out += px(cls, x, y, 2, 1) + px(cls, x + 1, y + 1, 1, 1);
  return out;
}

/** The window on the left with four panes of sky. */
function casement(): string {
  let out = px("frame", 22, 32, 64, 92) + px("pane", 26, 36, 56, 84);
  out += px("pane-l", 26, 36, 56, 30);
  for (let x = 26; x < 82; x += 2) {
    const y = Math.round(104 + 4 * Math.sin(x / 7));
    out += px("pane-d", x, y, 2, 120 - y);
  }
  out += px("cloud", 34, 50, 10, 2) + px("cloud", 36, 48, 5, 2) + px("cloud", 62, 58, 8, 2);
  out += px("mullion", 52, 36, 4, 84) + px("mullion", 26, 76, 56, 4);
  out += px("sill", 18, 122, 72, 4) + px("frame-d", 18, 126, 72, 2);
  return out;
}

/** The daylight that falls from the window across the wall onto the floor. */
function beam(): string {
  let out = "";
  for (let y = 126; y < 236; y += 2) {
    const s = Math.floor((y - 126) * 0.7);
    out += px("beam", 26 + s, y, 56, 2);
  }
  return out;
}

/** Easel: two front legs leaning together, a back leg, a ledge, a top clamp. */
function easel(): string {
  let out = "";
  for (let y = 58; y < 212; y++) {
    const t = (y - 58) / 154;
    out += px("wood-d", 329, y, 3, 1);
    out += px("wood", Math.round(322 - t * 26), y, 3, 1);
    out += px("wood", Math.round(336 + t * 26), y, 3, 1);
  }
  out += px("wood", 326, 72, 10, 8) + px("wood-l", 326, 72, 10, 1);
  out += px("wood", 284, 152, 92, 4) + px("wood-l", 284, 152, 92, 1) + px("wood-d", 284, 156, 92, 1);
  out += px("wood-d", 300, 190, 60, 2);
  return out;
}

/** The small landscape on the canvas: sky, sun, two hill lines, a tree and a meadow. */
function painting(): string {
  let out = px("canvas-edge", 288, 80, 84, 72) + px("canvas", 290, 82, 80, 68);
  out += px("c-sky2", 292, 84, 76, 12) + px("c-sky", 292, 96, 76, 26);
  out += disc("c-sun", 356, 96, 5);
  for (let x = 292; x < 368; x += 2) {
    const far = Math.round(116 + 4 * Math.sin(x / 9));
    const near = Math.round(127 + 3 * Math.sin(x / 13 + 1));
    out += px("c-far", x, far, 2, near - far) + px("c-near", x, near, 2, 138 - near);
  }
  out += px("c-meadow", 292, 138, 76, 10) + px("c-near", 292, 138, 76, 1);
  out += px("c-trunk", 341, 116, 2, 14) + disc("c-tree", 342, 112, 6) + px("c-tree-d", 338, 114, 9, 3);
  return out;
}

/** Each dab: where the brush tip touches, and the pixels it leaves. */
const DABS: { x: number; y: number; rows: string[]; cls: string }[] = [
  { x: 300, y: 90, rows: [".ww....", "wwwwww.", ".wwwwww"], cls: "p-white" },
  { x: 326, y: 94, rows: ["..ww...", ".wwwww.", "wwwwwwww"], cls: "p-white" },
  { x: 314, y: 104, rows: ["b...b", ".b.b.", "..b.."], cls: "p-dark" },
  { x: 345, y: 110, rows: [".y.", "y.y", ".y."], cls: "p-yellow" },
  { x: 298, y: 141, rows: [".r.", "rrr", ".r."], cls: "p-red" },
  { x: 309, y: 143, rows: [".r.", "rrr", ".r."], cls: "p-red" },
  { x: 322, y: 140, rows: [".y.", "yyy", ".y."], cls: "p-yellow" },
  { x: 356, y: 142, rows: [".r.", "rrr", ".r."], cls: "p-red" },
];
const DAB_AT = DABS.map((_, i) => 1.2 + i * 1.2);
const CLEAR_AT = 11.2;

function dabs(): { body: string; css: string } {
  let body = "";
  let css = "";
  DABS.forEach((d, i) => {
    const map = { w: d.cls, b: d.cls, y: d.cls, r: d.cls };
    body += `<g class="dab" style="animation-name:dab${i}">${group(() => sprite(d.rows, d.x - 1, d.y - 1, map))}</g>`;
    css += `@keyframes dab${i}{0%{opacity:0}${pct(DAB_AT[i] ?? 0)}%{opacity:1}${pct(CLEAR_AT)}%{opacity:0}100%{opacity:0}}`;
  });
  return { body, css };
}

/** Where the brush tip waits between rounds: above the canvas, by the clamp. */
const REST = { x: 352, y: 66 };

/** The brush drawn with its tip on REST, handle up to the right. */
function brush(): string {
  let out = px("bristle", REST.x - 1, REST.y - 1, 3, 3) + px("ferrule", REST.x + 1, REST.y - 4, 3, 4);
  for (let i = 0; i < 18; i++) out += px("handle", REST.x + 3 + Math.floor(i * 0.6), REST.y - 5 - i, 2, 1);
  return out;
}

/** Brush path: glide 0.8 s to each dab, touch it as it appears, glide back to rest at the end. */
function brushCss(): string {
  const at = (x: number, y: number): string => `transform:translate(${x - REST.x}px,${y - REST.y}px)`;
  const glide = "animation-timing-function:steps(24)";
  const hold = "animation-timing-function:steps(1)";
  let k = `0%{${at(REST.x, REST.y)};${hold}}`;
  let prev = REST;
  DABS.forEach((d, i) => {
    const t = DAB_AT[i] ?? 0;
    k += `${pct(t - 0.8)}%{${at(prev.x, prev.y)};${glide}}${pct(t)}%{${at(d.x, d.y)};${hold}}`;
    prev = d;
  });
  k += `${pct(CLEAR_AT - 1.2)}%{${at(prev.x, prev.y)};animation-timing-function:steps(30)}${pct(CLEAR_AT - 0.2)}%{${at(REST.x, REST.y)}}100%{${at(REST.x, REST.y)}}`;
  return `@keyframes brush{${k}}.brush{animation:brush ${CYCLE}s infinite}`;
}

/** A stool beside the easel with the palette, a rag and a jar of brushes. */
function stool(): string {
  let out = px("wood", 232, 176, 46, 4) + px("wood-l", 232, 176, 46, 1);
  out += px("wood-d", 236, 180, 3, 32) + px("wood-d", 271, 180, 3, 32) + px("wood-d", 238, 196, 34, 2);
  // Palette: a flat oval with a thumb hole and six blobs of paint.
  out += sprite(["...pppppppppppp...", ".pppppppppppppppp.", "pppp..pppppppppppp", ".pppppppppppppppp."], 236, 171, { p: "palette" });
  const blobs: [number, string][] = [[244, "p-red"], [248, "p-yellow"], [252, "p-blue"], [256, "p-green"], [260, "p-white"], [246, "p-dark"]];
  blobs.forEach(([x, cls], i) => (out += px(cls, i === 5 ? 248 : x, i === 5 ? 174 : 172, 2, 1)));
  // Rag hanging over the edge.
  out += px("rag", 228, 176, 8, 3) + px("rag", 228, 179, 5, 9) + px("rag-d", 230, 182, 2, 6);
  // Jar with brushes.
  out += px("jar", 264, 162, 10, 14) + px("jar-l", 265, 163, 2, 10) + px("water", 265, 168, 8, 7);
  out += px("handle", 266, 146, 1, 17) + px("handle", 269, 150, 1, 13) + px("handle", 271, 144, 1, 19);
  out += px("bristle", 266, 144, 1, 2) + px("p-red", 271, 142, 1, 2) + px("ferrule", 269, 148, 1, 2);
  return out;
}

/** Two canvases leaning against the wall at the right edge, backs turned. */
function stack(): string {
  let out = px("wood-d", 374, 166, 26, 46) + px("canvas-back", 376, 168, 24, 42) + px("wood", 376, 186, 24, 2);
  out += px("wood-d", 384, 182, 16, 30) + px("canvas-back", 386, 184, 14, 26);
  return out;
}

const STYLE = `
svg{--sky-top:#ecdcd3;--sky-bot:#e2cdc1;--patch:#e6d3c8;--crack:#d6bdb0;--base:#b98e78;--base-l:#cba491;
--floor:#9c735e;--floor-edge:#7c5847;--floor-d:#8a6352;--frame:#8a5a44;--frame-d:#6d4535;--sill:#9e6a52;
--pane:#d6e0e3;--pane-l:#e8eeee;--pane-d:#c2cfc4;--mullion:#8a5a44;--cloud:#f7f9f7;--beam:#fff6e0;--beam-o:.22;
--wood:#8a5a3a;--wood-l:#a8744f;--wood-d:#6a4228;--canvas-edge:#cfc2b0;--canvas:#f2ece2;--canvas-back:#d9c7ae;
--c-sky2:#a9c4d0;--c-sky:#c8d9de;--c-sun:#f0d48a;--c-far:#8fa9a0;--c-near:#7f9a62;--c-meadow:#9ab06a;--c-trunk:#6a4a32;--c-tree:#5e7e48;--c-tree-d:#4e6c3c;
--palette:#c4a27c;--rag:#b05a3a;--rag-d:#8e4630;--jar:#b9c4c4;--jar-l:#dfe6e4;--water:#9fb2b4;
--ferrule:#a7a39b;--bristle:#3c2c24;--handle:#b05a3a;--scan:.03}
@media (prefers-color-scheme: dark){svg{--sky-top:#17100d;--sky-bot:#201713;--patch:#1b1310;--crack:#120c0a;--base:#2e1f18;--base-l:#3a2820;
--floor:#1d1410;--floor-edge:#2e2019;--floor-d:#17100c;--frame:#2e1e17;--frame-d:#22160f;--sill:#33221a;
--pane:#1c2632;--pane-l:#26323f;--pane-d:#141c22;--mullion:#2e1e17;--cloud:#2a3644;--beam:#8aa0c8;--beam-o:.05;
--wood:#3a2618;--wood-l:#4a3220;--wood-d:#28190f;--canvas-edge:#5c544a;--canvas:#7c7468;--canvas-back:#4a3e32;
--c-sky2:#3e5260;--c-sky:#4e6270;--c-sun:#8c7a4a;--c-far:#405650;--c-near:#3c4c30;--c-meadow:#4a5634;--c-trunk:#2e2016;--c-tree:#2e4024;--c-tree-d:#26351e;
--palette:#4e3e2c;--rag:#5e2e1e;--rag-d:#4a2216;--jar:#3a4244;--jar-l:#525c5e;--water:#2c383a;
--ferrule:#55524c;--bristle:#1e1612;--handle:#6a3422;--scan:.09}}
.patch{fill:var(--patch)}.crack{fill:var(--crack)}.base{fill:var(--base)}.base-l{fill:var(--base-l)}
.floor{fill:var(--floor)}.floor-edge{fill:var(--floor-edge)}.floor-d{fill:var(--floor-d)}
.frame{fill:var(--frame)}.frame-d{fill:var(--frame-d)}.sill{fill:var(--sill)}.pane{fill:var(--pane)}.pane-l{fill:var(--pane-l)}.pane-d{fill:var(--pane-d)}.mullion{fill:var(--mullion)}.cloud{fill:var(--cloud)}
.beam{fill:var(--beam);opacity:var(--beam-o)}
.wood{fill:var(--wood)}.wood-l{fill:var(--wood-l)}.wood-d{fill:var(--wood-d)}
.canvas-edge{fill:var(--canvas-edge)}.canvas{fill:var(--canvas)}.canvas-back{fill:var(--canvas-back)}
.c-sky2{fill:var(--c-sky2)}.c-sky{fill:var(--c-sky)}.c-sun{fill:var(--c-sun)}.c-far{fill:var(--c-far)}.c-near{fill:var(--c-near)}
.c-meadow{fill:var(--c-meadow)}.c-trunk{fill:var(--c-trunk)}.c-tree{fill:var(--c-tree)}.c-tree-d{fill:var(--c-tree-d)}
.palette{fill:var(--palette)}.rag{fill:var(--rag)}.rag-d{fill:var(--rag-d)}.jar{fill:var(--jar)}.jar-l{fill:var(--jar-l)}.water{fill:var(--water)}
.ferrule{fill:var(--ferrule)}.bristle{fill:var(--bristle)}.handle{fill:var(--handle)}
.p-red{fill:#c8553a}.p-yellow{fill:#e6c050}.p-blue{fill:#4a74a8}.p-green{fill:#6a9a4a}.p-white{fill:#f8f4ec}.p-dark{fill:#3a3430}
.dab{opacity:0;animation-duration:${CYCLE}s;animation-timing-function:steps(1);animation-iteration-count:infinite}
.light{animation:light 9.6s steps(288) infinite}
@keyframes light{0%,100%{opacity:1}50%{opacity:.75}}
`;

/** The whole scene as SVG; under 128 KB, light and dark through prefers-color-scheme. */
export function studioSvg(): string {
  const d = dabs();
  const body = [
    group(wall),
    group(casement),
    group(floor),
    `<g class="light">${group(beam)}</g>`,
    group(stack),
    group(easel),
    group(painting),
    d.body,
    group(stool),
    `<g class="brush">${group(brush)}</g>`,
  ].join("\n");
  return scene(STYLE + d.css + brushCss(), "", body);
}
