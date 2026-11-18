/**
 * Build look "ink" (stage Texts): a writing desk in pixel art. On the right an open book lies on a lectern, and on its
 * right page the lines write themselves word by word; a candle beside it flickers and its light breathes, a goose
 * quill stands in the inkwell. The wall in the middle stays plain so chat text reads over it.
 */
import { W, disc, group, px, random, scene, sprite } from "../pixel";

/** One writing cycle in seconds: the right page fills, rests, and clears. */
const CYCLE = 16;

/** Plastered wall with faint board seams above a panelled wainscot. */
function wall(): string {
  const r = random(7);
  let out = "";
  for (let x = 0; x < W; x += 24) out += px("seam", x, 0, 1, 148);
  for (let i = 0; i < 34; i++) out += px("grain", Math.floor(r() * W), Math.floor(r() * 140), 1, 3 + Math.floor(r() * 8));
  out += px("rail", 0, 148, W, 3) + px("rail-d", 0, 151, W, 1) + px("wains", 0, 152, W, 60);
  for (let x = 10; x < W; x += 48) out += px("panel", x, 160, 36, 44) + px("panel-l", x, 160, 36, 1) + px("panel-l", x, 160, 1, 44);
  return out;
}

function floor(): string {
  const r = random(9);
  let out = px("floor", 0, 212, W, 38) + px("floor-edge", 0, 212, W, 2);
  for (let i = 0; i < 36; i++) out += px("floor-d", Math.floor(r() * W), 216 + Math.floor(r() * 32), 3 + Math.floor(r() * 5), 1);
  return out;
}

/** A small shelf high on the left wall: a few book spines and a jar, kept low in contrast. */
function shelf(): string {
  let out = px("desk-d", 14, 78, 70, 3) + px("desk-d", 20, 81, 2, 6) + px("desk-d", 76, 81, 2, 6);
  const spines: [number, number, string][] = [
    [18, 20, "spine-a"], [23, 22, "spine-b"], [28, 18, "spine-a"], [32, 21, "spine-c"], [37, 19, "spine-b"],
  ];
  for (const [x, h, cls] of spines) out += px(cls, x, 78 - h, 4, h) + px("spine-l", x + 1, 78 - h + 3, 2, 1);
  out += px("glass-l", 58, 64, 12, 14) + px("glass", 59, 62, 10, 2) + px("brass-d", 58, 62, 12, 1);
  return out;
}

/** The writing desk spanning the right third, with a drawer. */
function desk(): string {
  let out = px("desk-l", 226, 172, 174, 2) + px("desk", 226, 174, 174, 4) + px("desk-d", 228, 178, 172, 8);
  out += px("desk-d", 232, 186, 7, 26) + px("desk-d", 390, 186, 7, 26) + px("desk", 233, 186, 2, 26);
  out += px("desk", 300, 179, 40, 6) + px("brass", 318, 181, 4, 2);
  return out;
}

/** Lectern on the desk and the open book on it; the left page is already written. */
function book(): string {
  const r = random(21);
  let out = px("lectern", 266, 110, 100, 56) + px("lectern-d", 266, 164, 100, 2) + px("lectern-d", 276, 166, 80, 6);
  out += px("cover", 270, 113, 92, 50) + px("cover-d", 270, 161, 92, 2);
  out += px("page", 273, 115, 42, 45) + px("page", 317, 115, 42, 45);
  out += px("page-d", 273, 115, 2, 45) + px("page-d", 357, 115, 2, 45) + px("gutter", 315, 114, 2, 47);
  out += px("page-d", 313, 115, 2, 45) + px("page-d", 317, 115, 2, 45);
  // Left page: a heading mark and nine written lines.
  out += px("rubric", 278, 119, 5, 5);
  for (let k = 0; k < 9; k++) {
    const y = 121 + k * 4;
    let x = k === 0 ? 285 : 278;
    const end = k === 8 ? 296 : 309;
    while (x < end) {
      const w = Math.min(end - x, 3 + Math.floor(r() * 6));
      out += px("ink", x, y, w, 1);
      x += w + 2;
    }
  }
  return out;
}

/** The right page: nine lines of three words each, every word its own layer so it can appear on its own. */
function writing(): { body: string; css: string } {
  const r = random(33);
  let body = "";
  let css = "";
  let n = 0;
  const hide = ((15 / CYCLE) * 100).toFixed(4);
  for (let k = 0; k < 9; k++) {
    const y = 121 + k * 4;
    let x = 322;
    const end = k === 8 ? 340 : 354;
    for (let j = 0; j < 3 && x < end; j++) {
      const w = j === 2 ? end - x : Math.min(end - x, 4 + Math.floor(r() * 5));
      const t = 0.5 + n * 0.5;
      const at = ((t / CYCLE) * 100).toFixed(4);
      body += `<g class="w" style="animation-name:w${n}">${group(() => px("ink", x, y, w, 1))}</g>`;
      css += `@keyframes w${n}{0%{opacity:0}${at}%{opacity:1}${hide}%{opacity:0}100%{opacity:0}}`;
      x += w + 2;
      n++;
    }
  }
  return { body, css };
}

/** Inkwell of dark glass with a goose quill standing in it, leaning to the right. */
function inkwell(): string {
  let out = px("glass", 370, 160, 16, 12) + px("glass-l", 372, 161, 3, 8) + px("glass", 374, 155, 8, 5) + px("brass", 373, 154, 10, 2);
  for (let i = 0; i < 48; i++) {
    const x = 377 + Math.floor(i * 0.33);
    const y = 155 - i;
    out += px("shaft", x, y, 1, 1);
    if (i > 14) {
      const vane = i < 22 ? 1 + Math.floor((i - 14) / 3) : i > 42 ? Math.max(1, 47 - i) : 3;
      out += px("feather", x - vane, y, vane, 1) + px("feather-d", x + 1, y, Math.max(1, vane - 1), 1);
    }
  }
  return out;
}

/** The candle in a brass dish; the flame itself is drawn in frames. */
function candle(): string {
  let out = px("brass-d", 234, 170, 22, 2) + px("brass", 236, 168, 18, 2) + px("brass", 252, 164, 6, 2);
  out += px("wax", 241, 134, 8, 34) + px("wax-d", 247, 134, 2, 34) + px("wax", 240, 138, 1, 5) + px("wick", 244, 131, 1, 3);
  return out;
}

const FLAME = [
  [".....", "..f..", ".ffF.", ".fFF.", "fFHFf", "fFHFf", ".fFf.", "..f.."],
  [".....", "...f.", "..fF.", ".fFF.", ".FHFf", "fFHFf", ".fFf.", "..f.."],
  ["..f..", ".fF..", ".fFF.", "fFHF.", "fFHFf", "fFHFf", ".fFf.", "..f.."],
];

function flame(): string {
  return FLAME.map((rows, i) => `<g class="fl f${i}">${group(() => sprite(rows, 242, 123, { f: "flame", F: "flame-hot", H: "flame-core" }))}</g>`).join("");
}

/** The candle light: two soft rings around the flame and a warm wash on the book. */
function light(): string {
  return [60, 48, 38, 29, 21, 14, 8].map((r) => disc("glow", 245, 128, r)).join("");
}

const STYLE = `
svg{--sky-top:#e7ddcc;--sky-bot:#dccdb5;--seam:#d9cab1;--grain:#e0d3bd;--rail:#a88a66;--rail-d:#8e7254;
--wains:#bca180;--panel:#b49875;--panel-l:#c9b08f;--floor:#8f7357;--floor-edge:#735a43;--floor-d:#806549;
--desk:#7a5636;--desk-l:#96714c;--desk-d:#5c3f26;--lectern:#6a4a2a;--lectern-d:#4f3620;--cover:#7a3a2a;--cover-d:#5a2a1e;
--page:#f3eada;--page-d:#ddd0b6;--gutter:#bba987;--ink:#3a2e24;--rubric:#9a3a2a;
--spine-a:#a88466;--spine-b:#9c8a6c;--spine-c:#b09070;--spine-l:#c4ab88;
--wax:#f0e8d6;--wax-d:#d8ccb4;--wick:#3a2e24;--brass:#b08a48;--brass-d:#8a6a34;--glass:#3a3f4a;--glass-l:#5d6576;
--feather:#f6f1e8;--feather-d:#d3cabb;--shaft:#a89a84;--glow:#ffd27a;--glow-o:.05;--scan:.03}
@media (prefers-color-scheme: dark){svg{--sky-top:#15110d;--sky-bot:#1e1813;--seam:#110d0a;--grain:#191410;--rail:#2e2218;--rail-d:#1e160f;
--wains:#211912;--panel:#1b140e;--panel-l:#2a2017;--floor:#19130e;--floor-edge:#2a1f16;--floor-d:#140f0b;
--desk:#2e2015;--desk-l:#3e2c1d;--desk-d:#20160e;--lectern:#34251a;--lectern-d:#231910;--cover:#3c1d15;--cover-d:#29130e;
--page:#a89b83;--page-d:#8c806b;--gutter:#7c715e;--ink:#2a2119;--rubric:#5e2419;
--spine-a:#3a2a1e;--spine-b:#30281e;--spine-c:#3e2e20;--spine-l:#4a3a2a;
--wax:#a99e88;--wax-d:#877d6a;--wick:#1a140f;--brass:#6e5530;--brass-d:#4e3c22;--glass:#141820;--glass-l:#262d3b;
--feather:#c4bcae;--feather-d:#9a9285;--shaft:#6a6052;--glow:#ffb85a;--glow-o:.03;--scan:.09}}
.seam{fill:var(--seam)}.grain{fill:var(--grain)}.rail{fill:var(--rail)}.rail-d{fill:var(--rail-d)}
.wains{fill:var(--wains)}.panel{fill:var(--panel)}.panel-l{fill:var(--panel-l)}
.floor{fill:var(--floor)}.floor-edge{fill:var(--floor-edge)}.floor-d{fill:var(--floor-d)}
.desk{fill:var(--desk)}.desk-l{fill:var(--desk-l)}.desk-d{fill:var(--desk-d)}.lectern{fill:var(--lectern)}.lectern-d{fill:var(--lectern-d)}
.cover{fill:var(--cover)}.cover-d{fill:var(--cover-d)}.page{fill:var(--page)}.page-d{fill:var(--page-d)}.gutter{fill:var(--gutter)}
.ink{fill:var(--ink)}.rubric{fill:var(--rubric)}
.spine-a{fill:var(--spine-a)}.spine-b{fill:var(--spine-b)}.spine-c{fill:var(--spine-c)}.spine-l{fill:var(--spine-l)}
.wax{fill:var(--wax)}.wax-d{fill:var(--wax-d)}.wick{fill:var(--wick)}.brass{fill:var(--brass)}.brass-d{fill:var(--brass-d)}
.glass{fill:var(--glass)}.glass-l{fill:var(--glass-l)}.feather{fill:var(--feather)}.feather-d{fill:var(--feather-d)}.shaft{fill:var(--shaft)}
.glow{fill:var(--glow);opacity:var(--glow-o)}
.flame{fill:#ffa83a}.flame-hot{fill:#ffd36a}.flame-core{fill:#fff3c4}
.fl{opacity:0;animation:fl 1.8s steps(1) infinite}.f1{animation-delay:-.6s}.f2{animation-delay:-1.2s}
@keyframes fl{0%{opacity:1}33.3333%{opacity:0}100%{opacity:0}}
.halo{animation:breathe 4.8s steps(144) infinite}
@keyframes breathe{0%,100%{opacity:1}40%{opacity:.7}70%{opacity:.9}}
.w{opacity:0;animation-duration:${CYCLE}s;animation-timing-function:steps(1);animation-iteration-count:infinite}
`;

/** The whole scene as SVG; under 128 KB, light and dark through prefers-color-scheme. */
export function inkSvg(): string {
  const words = writing();
  const body = [
    group(wall),
    group(floor),
    group(shelf),
    `<g class="halo">${group(light)}</g>`,
    group(desk),
    group(book),
    words.body,
    group(candle),
    flame(),
    group(inkwell),
  ].join("\n");
  return scene(STYLE + words.css, "", body);
}
