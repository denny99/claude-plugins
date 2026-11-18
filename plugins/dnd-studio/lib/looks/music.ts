/**
 * Build look "music" (stage Sounds): a music room in pixel art. A lute leans on a stool at the right, a music stand
 * with an open sheet stands beside it, a drum and a flute keep to the left. Small notes rise from lute and sheet now
 * and then, sway a little and fade. The papered wall in the middle stays plain so chat text reads over it.
 */
import { H, W, disc, group, px, random, scene, sprite } from "../pixel";

/** Wallpaper with faint stripes, a chair rail, wainscot panels below. */
function wall(): string {
  let out = "";
  for (let x = 6; x < W; x += 14) out += px("paper-d", x, 0, 2, 148);
  for (let x = 13; x < W; x += 28) for (let y = 10; y < 148; y += 24) out += px("paper-d", x, y, 1, 3);
  out += px("rail", 0, 148, W, 4) + px("rail-d", 0, 152, W, 1);
  out += px("panel", 0, 153, W, 59);
  for (let x = 6; x < W; x += 56) {
    out += px("panel-d", x, 160, 46, 1) + px("panel-d", x, 160, 1, 46);
    out += px("panel-l", x + 1, 205, 45, 1) + px("panel-l", x + 45, 161, 1, 45);
  }
  return out;
}

function floor(): string {
  const r = random(7);
  let out = px("floor", 0, 212, W, H - 212) + px("floor-edge", 0, 212, W, 2);
  for (let y = 220; y < H; y += 8) {
    out += px("floor-d", 0, y, W, 1);
    for (let i = 0; i < 4; i++) out += px("floor-d", Math.floor(r() * W), y - 7, 1, 7);
  }
  return out;
}

/** Stool at the right with the lute leaning upright on it. */
function stool(): string {
  let out = px("wood", 314, 182, 56, 5) + px("wood-l", 314, 182, 56, 1);
  out += px("wood-d", 318, 187, 4, 25) + px("wood-d", 362, 187, 4, 25) + px("wood-d", 322, 200, 40, 2);
  return out;
}

function lute(cx: number, cy: number): string {
  let out = "";
  const rx = 20;
  const ry = 24;
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2) * (dy < 0 ? 0.9 : 1));
    if (hw <= 0) continue;
    out += px("lute", cx - hw, cy + dy, hw * 2 + 1, 1);
    out += px("lute-l", cx - hw, cy + dy, Math.max(1, Math.round(hw * 0.4)), 1);
    out += px("lute-d", cx + hw - 1, cy + dy, 2, 1);
  }
  out += disc("hole-rim", cx, cy - 6, 6) + disc("hole", cx, cy - 6, 4);
  out += px("lute-d", cx - 7, cy + 12, 15, 3);
  // Neck, fingerboard, pegbox bent back.
  out += px("neck", cx - 4, cy - 76, 9, 54) + px("lute-d", cx + 4, cy - 76, 1, 54);
  out += px("lute-d", cx - 4, cy - 79, 9, 3);
  out += px("neck", cx - 2, cy - 92, 6, 13) + px("neck", cx + 3, cy - 96, 6, 6);
  for (const y of [-88, -84, -80]) out += px("peg", cx - 5, cy + y, 3, 2) + px("peg", cx + 4, cy + y, 3, 2);
  for (const dx of [-2, 0, 2]) out += px("string", cx + dx, cy - 76, 1, 87);
  return out;
}

/** Music stand: tripod, pole, a slanted desk with an open sheet of staves and notes. */
function stand(): string {
  let out = "";
  for (let i = 0; i < 18; i++) {
    out += px("stand", 270 - Math.floor(i * 1.1), 194 + i, 2, 1) + px("stand", 272 + Math.floor(i * 1.1), 194 + i, 2, 1);
  }
  out += px("stand", 270, 140, 4, 72);
  out += px("stand", 238, 148, 68, 4) + px("stand-l", 238, 148, 68, 1);
  out += px("stand", 242, 104, 60, 44);
  out += px("sheet", 245, 107, 26, 40) + px("sheet-l", 273, 107, 26, 40) + px("stand", 271, 107, 2, 40);
  const r = random(9);
  for (const top of [113, 131]) {
    for (let l = 0; l < 5; l++) out += px("staff", 247, top + l * 2, 22, 1) + px("staff", 275, top + l * 2, 22, 1);
    for (let i = 0; i < 9; i++) {
      const x = i < 4 ? 250 + i * 5 : 277 + (i - 4) * 4;
      const y = top + Math.floor(r() * 7);
      out += px("ink", x, y, 2, 2) + px("ink", x + 1, y - 5, 1, 5);
    }
  }
  return out;
}

/** Left side: a drum on the floor, a flute on two pegs. */
function drum(): string {
  let out = px("drum", 26, 178, 48, 34) + px("drum-l", 26, 178, 6, 34) + px("drum-d", 68, 178, 6, 34);
  out += px("skin", 26, 174, 48, 4) + px("hoop", 26, 178, 48, 3) + px("hoop", 26, 207, 48, 3);
  for (let x = 28; x < 72; x += 8) {
    for (let i = 0; i < 26; i++) out += px("rope", x + Math.floor((i < 13 ? i : 26 - i) / 3), 181 + i, 1, 1);
  }
  out += px("stick", 78, 202, 22, 2) + px("stick", 98, 201, 4, 4);
  return out;
}

function flute(): string {
  let out = px("peg", 30, 96, 3, 5) + px("peg", 92, 96, 3, 5);
  out += px("flute", 22, 92, 80, 4) + px("flute-l", 22, 92, 80, 1) + px("flute-d", 22, 92, 4, 4);
  for (const x of [52, 60, 68, 76, 84]) out += px("hole", x, 93, 2, 2);
  return out;
}

const QUARTER = ["...s", "...s", "...s", "...s", ".nns", "nnns", "nnn.", ".n.."];
const EIGHTH = ["...sf.", "...s.f", "...s.f", "...s..", ".nns..", "nnns..", "nnn...", ".n...."];

/** Notes that rise and fade; each sits still and hidden for most of its round, so they come one by one. */
function notes(): string {
  const spots: [number, number, string[], number][] = [
    [330, 112, EIGHTH, 0],
    [286, 92, QUARTER, 2.4],
    [354, 120, QUARTER, 4.5],
    [256, 96, EIGHTH, 6.6],
  ];
  return spots
    .map(
      ([x, y, rows, d]) =>
        `<g class="note" style="animation-delay:-${d.toFixed(1)}s">${group(() => sprite(rows, x, y, { n: "note", s: "note", f: "note" }, 2))}</g>`,
    )
    .join("");
}

const STYLE = `
svg{--sky-top:#e4dbe8;--sky-bot:#d8ccde;--paper-d:#d2c5d9;--rail:#9a7f96;--rail-d:#7f667b;--panel:#b9a3b8;--panel-d:#a38ca2;--panel-l:#c9b5c7;
--floor:#9a8090;--floor-edge:#7d6575;--floor-d:#8a7080;--wood:#7a5a4e;--wood-l:#94705f;--wood-d:#5e4339;
--lute:#b07a48;--lute-l:#c8945e;--lute-d:#8a5a34;--neck:#6a4630;--peg:#4a3022;--string:#e8dcc4;--hole:#3a2530;--hole-rim:#7a4aa0;
--stand:#5c4652;--stand-l:#7a6270;--sheet:#f2ecea;--sheet-l:#e8e0e2;--staff:#b9aab6;--ink:#4a3a50;
--drum:#7a4aa0;--drum-l:#9468b8;--drum-d:#5e3880;--skin:#e6d9c4;--hoop:#8a5a34;--rope:#e2d2b0;--stick:#8a5a34;
--flute:#a07a50;--flute-l:#c09a6a;--flute-d:#7a5a3a;--note:#7a4aa0;--scan:.03}
@media (prefers-color-scheme: dark){svg{--sky-top:#130e18;--sky-bot:#1d1524;--paper-d:#181220;--rail:#33263a;--rail-d:#22182a;--panel:#211828;--panel-d:#18111e;--panel-l:#2b2033;
--floor:#1d1520;--floor-edge:#2c2030;--floor-d:#160f19;--wood:#33241f;--wood-l:#42302a;--wood-d:#231814;
--lute:#5a3c24;--lute-l:#6e4c30;--lute-d:#3c2716;--neck:#2e1e14;--peg:#1c120c;--string:#8a8070;--hole:#0c080e;--hole-rim:#4a2c64;
--stand:#2a1f28;--stand-l:#3a2c36;--sheet:#8a8290;--sheet-l:#7a7280;--staff:#5a5262;--ink:#2a2032;
--drum:#46295e;--drum-l:#563470;--drum-d:#331d46;--skin:#7e7466;--hoop:#3c2716;--rope:#7a6e5a;--stick:#3c2716;
--flute:#4a3824;--flute-l:#5e4830;--flute-d:#33261a;--note:#a07ac4;--scan:.09}}
.paper-d{fill:var(--paper-d)}.rail{fill:var(--rail)}.rail-d{fill:var(--rail-d)}.panel{fill:var(--panel)}.panel-d{fill:var(--panel-d)}.panel-l{fill:var(--panel-l)}
.floor{fill:var(--floor)}.floor-edge{fill:var(--floor-edge)}.floor-d{fill:var(--floor-d)}.wood{fill:var(--wood)}.wood-l{fill:var(--wood-l)}.wood-d{fill:var(--wood-d)}
.lute{fill:var(--lute)}.lute-l{fill:var(--lute-l)}.lute-d{fill:var(--lute-d)}.neck{fill:var(--neck)}.peg{fill:var(--peg)}.string{fill:var(--string)}
.hole{fill:var(--hole)}.hole-rim{fill:var(--hole-rim)}.stand{fill:var(--stand)}.stand-l{fill:var(--stand-l)}.sheet{fill:var(--sheet)}.sheet-l{fill:var(--sheet-l)}
.staff{fill:var(--staff)}.ink{fill:var(--ink)}.drum{fill:var(--drum)}.drum-l{fill:var(--drum-l)}.drum-d{fill:var(--drum-d)}.skin{fill:var(--skin)}
.hoop{fill:var(--hoop)}.rope{fill:var(--rope)}.stick{fill:var(--stick)}.flute{fill:var(--flute)}.flute-l{fill:var(--flute-l)}.flute-d{fill:var(--flute-d)}
.note path{fill:var(--note)}
.note{opacity:0;animation:rise 9s steps(27) infinite}
@keyframes rise{0%{opacity:0;transform:translate(0,0)}10%{opacity:.85;transform:translate(-2px,-6px)}20%{opacity:.85;transform:translate(-4px,-14px)}
30%{opacity:.7;transform:translate(0,-22px)}40%{opacity:.4;transform:translate(4px,-30px)}50%{opacity:0;transform:translate(2px,-38px)}100%{opacity:0;transform:translate(2px,-38px)}}
`;

/** The whole scene as SVG; under 128 KB, light and dark through prefers-color-scheme. */
export function musicSvg(): string {
  const body = [group(wall), group(floor), group(flute), group(drum), group(stand), group(stool), group(() => lute(342, 156)), notes()].join("\n");
  return scene(STYLE, "", body);
}
