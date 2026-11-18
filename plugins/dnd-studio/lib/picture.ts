/**
 * A scene picture as a backdrop: the picture shrunk to a pixel raster (sips makes a small BMP, see features/look.tsx),
 * its colors cut to a small palette, and drawn as vector rectangles in the style of the pixel looks (lib/pixel.ts):
 * one path per color, runs of equal cells per row as one line, as fine as fits. Pure vector (no `<image>`, no links), under
 * 128 KB, with a light veil in the light scheme and a dark one in the dark scheme so chat text reads over it.
 */
import { H, W, group, px, random, scene } from "./pixel";

/** The engine's limit for a backdrop scene. */
export const MAX_SVG_BYTES = 131072;

export type Raster = { width: number; height: number; /** RGB, row by row from the top. */ rgb: Uint8Array };

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 text (line breaks and padding allowed) to bytes; no atob in the engine. */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]!);
    const b = B64.indexOf(clean[i + 1]!);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]!) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]!) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/** An uncompressed 24- or 32-bit BMP (bottom-up or top-down, rows padded to 4 bytes); throws on anything else. */
export function parseBmp(bytes: Uint8Array): Raster {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new Error("no BMP");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bits = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  // 0 BI_RGB; 3 BI_BITFIELDS with the usual BGRA masks (what sips writes for 32 bit)
  if (bits !== 24 && bits !== 32) throw new Error(`BMP with ${bits} bit`);
  if (compression !== 0 && compression !== 3) throw new Error(`compressed BMP (${compression})`);
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const step = bits / 8;
  const stride = Math.ceil((width * step) / 4) * 4;
  if (width <= 0 || height <= 0 || offset + stride * height > bytes.length) throw new Error("short BMP");
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = offset + (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const p = row + x * step;
      const q = (y * width + x) * 3;
      rgb[q] = bytes[p + 2]!;
      rgb[q + 1] = bytes[p + 1]!;
      rgb[q + 2] = bytes[p]!;
    }
  }
  return { width, height, rgb };
}

/** The middle `width` x `height` of a raster (it was shrunk keeping its aspect, the frame is 400 x 250). */
export function cropCenter(r: Raster, width: number, height: number): Raster {
  const w = Math.min(width, r.width);
  const h = Math.min(height, r.height);
  const x0 = Math.floor((r.width - w) / 2);
  const y0 = Math.floor((r.height - h) / 2);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    rgb.set(r.rgb.subarray(((y0 + y) * r.width + x0) * 3, ((y0 + y) * r.width + x0 + w) * 3), y * w * 3);
  return { width: w, height: h, rgb };
}

type Box = number[][];

/** Median cut: at most `n` colors that stand for the raster's pixels. */
export function palette(r: Raster, n: number): number[][] {
  // a sample of at most ~16000 pixels is enough for the palette and keeps fine rasters quick
  const step = Math.max(1, Math.floor((r.width * r.height) / 16000)) * 3;
  const px: number[][] = [];
  for (let i = 0; i < r.rgb.length; i += step) px.push([r.rgb[i]!, r.rgb[i + 1]!, r.rgb[i + 2]!]);
  const boxes: Box[] = [px];
  const range = (b: Box, c: number) => {
    let lo = 255;
    let hi = 0;
    for (const p of b) {
      lo = Math.min(lo, p[c]!);
      hi = Math.max(hi, p[c]!);
    }
    return hi - lo;
  };
  while (boxes.length < n) {
    // split the box with the widest channel (weighted a little by its size)
    let best = -1;
    let bestScore = 0;
    let bestChannel = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        const score = range(b, c) * Math.sqrt(b.length);
        if (score > bestScore) {
          bestScore = score;
          best = i;
          bestChannel = c;
        }
      }
    });
    if (best < 0) break;
    const b = boxes[best]!.sort((p, q) => p[bestChannel]! - q[bestChannel]!);
    const mid = b.length >> 1;
    boxes.splice(best, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes
    .filter((b) => b.length)
    .map((b) => {
      const s = [0, 0, 0];
      for (const p of b) for (let c = 0; c < 3; c++) s[c]! += p[c]!;
      return s.map((v) => Math.round(v / b.length));
    });
}

function nearest(pal: number[][], r: number, g: number, b: number): number {
  let best = 0;
  let dist = Infinity;
  pal.forEach((p, i) => {
    const d = (p[0]! - r) ** 2 * 2 + (p[1]! - g) ** 2 * 4 + (p[2]! - b) ** 2 * 3;
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

const hex = (p: number[]) => `#${p.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** Dust drifting up through the picture's light, a few motes on the 1/30 s grid (like the game table's). */
function dust(): string {
  const r = random(23);
  let out = "";
  for (let i = 0; i < 14; i++) {
    const x = 20 + Math.floor(r() * (W - 40));
    const y = 60 + Math.floor(r() * (H - 90));
    // one 8 s cycle in 240 steps for all, delays on the 1/30 s grid: the window repaints at most 30 times a second
    const delay = (Math.floor(r() * 240) / 30).toFixed(4);
    out += `<g class="mote" style="animation-delay:-${delay}s">${px("dust", x, y)}</g>`;
  }
  return out;
}

/** One band of the darkening toward the frame's edge (as in the game table). */
function edge(i: number): string {
  const d = 6 + i * 6;
  return group(
    () =>
      px("vig", 0, 0, W, d) + px("vig", 0, H - d, W, d) + px("vig", 0, d, d, H - 2 * d) + px("vig", W - d, d, d, H - 2 * d),
  );
}

const STYLE = `svg{--sky-top:#2a2420;--sky-bot:#1d1916;--scan:.04;--veil:#f6efe2;--veil-o:.42;--vig:#3a2a1a;--vig-o:.07;--dust:#fff4d6}
@media (prefers-color-scheme: dark){svg{--sky-top:#14110f;--sky-bot:#0c0a09;--scan:.08;--veil:#0b0908;--veil-o:.42;--vig:#000000;--vig-o:.14;--dust:#ffd9a0}}
.art path{fill:none;stroke-width:1}
.veil{fill:var(--veil);opacity:var(--veil-o)}.vig{fill:var(--vig);opacity:var(--vig-o)}.dust{fill:var(--dust)}
.mote{opacity:0;animation:mote 8s steps(240) infinite}
@keyframes mote{0%{opacity:0;transform:translate(0,0)}20%{opacity:.7}80%{opacity:.4;transform:translate(-8px,-24px)}100%{opacity:0;transform:translate(-10px,-30px)}}`;

/**
 * The raster (already `cols` x `rows`, see gridFor) as the backdrop SVG: `cell` units per raster pixel on the 400 x 250
 * frame, `colors` palette colors, a veil and an edge vignette over it, dust drifting.
 *
 * Kept small so fine rasters fit the engine's limit: the most common color is one rectangle under everything and is not
 * drawn again; every other color is one stroked path of one-unit-high lines, a run of equal cells per line, written with
 * relative moves inside a row (`m3 0h5`) — about six bytes a run.
 */
export function rasterSvg(r: Raster, cell: number, colors = 28): string {
  const pal = palette(r, colors);
  const idx = new Uint8Array(r.width * r.height);
  const count = new Array<number>(pal.length).fill(0);
  for (let i = 0; i < idx.length; i++) {
    const c = nearest(pal, r.rgb[i * 3]!, r.rgb[i * 3 + 1]!, r.rgb[i * 3 + 2]!);
    idx[i] = c;
    count[c]!++;
  }
  const ground = count.indexOf(Math.max(...count));
  const paths = new Map<number, string>();
  // where each color's pen stands in the current row (-1: not in this row yet)
  const pen = new Array<number>(pal.length).fill(-1);
  for (let y = 0; y < r.height; y++) {
    pen.fill(-1);
    let x = 0;
    while (x < r.width) {
      const c = idx[y * r.width + x]!;
      let run = 1;
      while (x + run < r.width && idx[y * r.width + x + run] === c) run++;
      if (c !== ground) {
        const move = pen[c]! < 0 ? `M${x} ${y}` : `m${x - pen[c]!} 0`;
        paths.set(c, `${paths.get(c) ?? ""}${move}h${run}`);
        pen[c] = x + run;
      }
      x += run;
    }
  }
  let art = `<rect width="${r.width}" height="${r.height}" fill="${hex(pal[ground]!)}"/><g class="art" transform="translate(0 .5)">`;
  for (const [c, d] of paths) art += `<path stroke="${hex(pal[c]!)}" d="${d}"/>`;
  const body = `<g transform="scale(${cell})">${art}</g></g>
<rect class="veil" width="${W}" height="${H}"/>
${[0, 1, 2, 3].map(edge).join("")}
${dust()}`;
  return scene(STYLE, "", body);
}

/** The raster sizes tried, finest first: cell units per raster pixel; the raster is W/cell x H/cell (rounded up). */
export const CELLS = [1, 1.25, 1.6, 2, 2.5, 3.2, 4, 5, 8] as const;

/**
 * The next cell size worth trying after one at `cell` came out `bytes` long: the SVG grows about with the cell count to
 * the power 0.75 (bytes ~ cell^-1.5, measured on photos and noise), so sizes that would surely be too big are skipped.
 */
export function nextCell(cell: number, bytes: number): number | undefined {
  return CELLS.find((c) => c > cell && bytes * (cell / c) ** 1.5 < MAX_SVG_BYTES * 0.97);
}

export function gridFor(cell: number): { cols: number; rows: number } {
  return { cols: Math.ceil(W / cell), rows: Math.ceil(H / cell) };
}

/**
 * The size to shrink a `width` x `height` picture to so it covers a cols x rows grid keeping its aspect (sips then
 * makes exactly that, cropCenter cuts the grid out of the middle).
 */
export function coverSize(width: number, height: number, cols: number, rows: number): { w: number; h: number } {
  const s = Math.max(cols / width, rows / height);
  return { w: Math.max(cols, Math.ceil(width * s)), h: Math.max(rows, Math.ceil(height * s)) };
}

/**
 * The finest raster whose SVG stays under the limit. `shrink(w, h)` makes the picture w x h pixels (sips); it is
 * asked once per size tried. Too big a result skips straight to the size it should fit (nextCell); when that one comes
 * out well under the limit, the size just finer is tried once too. Undefined when even the coarsest is too big.
 */
export async function pictureSvg(
  size: { width: number; height: number },
  shrink: (w: number, h: number) => Promise<Raster>,
): Promise<string | undefined> {
  const tried = new Set<number>();
  const make = async (cell: number) => {
    tried.add(cell);
    const { cols, rows } = gridFor(cell);
    const { w, h } = coverSize(size.width, size.height, cols, rows);
    return rasterSvg(cropCenter(await shrink(w, h), cols, rows), cell);
  };
  const coarsest = CELLS[CELLS.length - 1];
  let cell: number | undefined = CELLS[0];
  while (cell !== undefined) {
    const svg = await make(cell);
    if (svg.length < MAX_SVG_BYTES) {
      const finer = CELLS[CELLS.indexOf(cell as (typeof CELLS)[number]) - 1];
      if (finer === undefined || tried.has(finer) || svg.length > MAX_SVG_BYTES * 0.7) return svg;
      const better = await make(finer);
      return better.length < MAX_SVG_BYTES ? better : svg;
    }
    cell = nextCell(cell, svg.length) ?? (cell === coarsest ? undefined : coarsest);
  }
  return undefined;
}
