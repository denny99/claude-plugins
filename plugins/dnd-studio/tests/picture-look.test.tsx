/** The scene picture as the table backdrop: BMP to pixel SVG, and the look a live table with a picture gets. */
import { expect, test } from "claude-code/testing";

import { pictureKey, studioPathOfPicture } from "../features/look";
import { cropCenter, fromBase64, MAX_SVG_BYTES, parseBmp, rasterSvg } from "../lib/picture";
import { TABLE, world } from "./world";

/** A 24-bit bottom-up BMP, w x h, rows padded to 4 bytes: a red/blue gradient with a green bar. */
function bmp(w: number, h: number): Uint8Array {
  const stride = Math.ceil((w * 3) / 4) * 4;
  const out = new Uint8Array(54 + stride * h);
  const v = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  v.setUint32(2, out.length, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = 54 + (h - 1 - y) * stride + x * 3; // row 0 is the top
      const bar = y > h / 2 && y < h / 2 + 4;
      out[p] = Math.round((255 * y) / h); // blue
      out[p + 1] = bar ? 220 : 10; // green
      out[p + 2] = Math.round((255 * x) / w); // red
    }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    s += i + 1 < b.length ? B64[(n >> 6) & 63]! : "=";
    s += i + 2 < b.length ? B64[n & 63]! : "=";
    if (i % 57 === 54) s += "\n"; // base64 wraps lines on some systems
  }
  return s;
}

test("pure: a BMP becomes a small pure-vector pixel scene, light and dark", () => {
  const bytes = bmp(103, 63);
  expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  const r = parseBmp(bytes);
  expect([r.width, r.height]).toEqual([103, 63]);
  // top left is black-ish, top right red, the bar green
  expect(Array.from(r.rgb.subarray(0, 3))).toEqual([0, 10, 0]);
  expect(r.rgb[(0 * 103 + 102) * 3]).toBe(253);
  expect(r.rgb[(33 * 103 + 5) * 3 + 1]).toBe(220);
  const grid = cropCenter(r, 100, 63);
  expect([grid.width, grid.height]).toEqual([100, 63]);
  const svg = rasterSvg(grid, 4);
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.includes('viewBox="0 0 400 250"')).toBe(true);
  expect(svg.includes("scale(4)")).toBe(true);
  expect(svg.length < MAX_SVG_BYTES).toBe(true);
  expect(/<image|href|<!--|<script|<text|<foreignObject/i.test(svg)).toBe(false);
  // at most 28 colors, one path each
  expect((svg.match(/<path fill="#/g) ?? []).length <= 28).toBe(true);
  // a veil that is light in the light scheme and dark in the dark one
  const dark = /@media \(prefers-color-scheme: dark\)\{svg\{([^}]*)\}\}/.exec(svg)?.[1] ?? "";
  const light = /<style>svg\{([^}]*)\}/.exec(svg)?.[1] ?? "";
  expect(/--veil:#f/.test(light)).toBe(true);
  expect(/--veil:#0/.test(dark)).toBe(true);
  expect(svg.includes("prefers-reduced-motion")).toBe(true);
});

test("pure: the window's /view URL names the Studio file", () => {
  expect(
    studioPathOfPicture("/view?filename=a%20b.png&subfolder=dnd-dland%5Cimages&type=output"),
  ).toBe("dnd-dland/images/a b.png [output]");
  expect(studioPathOfPicture("x.png [output]")).toBe("x.png [output]");
});

const VIEW = "/view?filename=bruecke.png&subfolder=dnd-dland%5Cimages&type=output";

/** The Studio's results: list finds bruecke.png when `found`, save puts it in the temp folder. */
function results(found: boolean) {
  return (a: Record<string, unknown>) => [
    {
      type: "text",
      text: JSON.stringify(
        a.action === "save"
          ? { saved: [{ id: "a", file: "/var/tmp/dnd-studio-review/bruecke.png", bytes: 1 }] }
          : found
            ? [{ id: "aaaaaaaa-1111-2222-3333-444444444444", kind: "image", file: "dnd-dland/images/bruecke.png [output]" }]
            : [],
      ),
    },
  ];
}

test("a live table with a picture gets the picture as backdrop once it is made", async ($, on) => {
  const w = world(on, {
    table_state: { ...TABLE, scene: { kind: "show", title: "Die Brücke", picture: VIEW } },
    results: results(true),
  });
  const ran: string[] = [];
  on("process.run", (_, e) => {
    const argv = (e as { argv: string[] }).argv;
    ran.push(argv[0]!);
    const out =
      argv[0] === "/usr/bin/sips" && argv[1] === "-g"
        ? "/x.png\n  pixelWidth: 1392\n  pixelHeight: 783\n"
        : argv[0] === "/usr/bin/base64"
          ? toBase64(bmp(112, 63))
          : "";
    return { value: { exitCode: 0, stdout: out, stderr: "" } } as never;
  });
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd-scene", args: "" } as never);
  // the picture is made in a job of its own: the game table stands meanwhile
  expect(w.themes[0]).toBe("dnd-table");
  await w.clock.advance(10);
  expect(ran).toEqual(["/usr/bin/sips", "/usr/bin/sips", "/usr/bin/base64"]);
  expect(w.calls.some((c) => c.tool === "results" && c.args.action === "save")).toBe(true);
  expect(w.themes).toEqual(["dnd-table", `dnd-pic-${pictureKey(VIEW)}`]);
});

test("a picture the Studio cannot hand out keeps the game table", async ($, on) => {
  const view = VIEW.replace("bruecke", "verloren");
  const w = world(on, {
    table_state: { ...TABLE, scene: { kind: "show", title: "Verloren", picture: view } },
    results: results(false),
  });
  on("process.run", () => ({ value: { exitCode: 1, stdout: "", stderr: "no" } }) as never);
  await $.session.start({ cwd: "/", surface: "desktop", isInteractive: true });
  await $.command.run({ command: "dnd-scene", args: "" } as never);
  await w.clock.advance(10);
  await $.command.run({ command: "dnd-scene", args: "" } as never);
  await w.clock.advance(10);
  expect(w.themes).toEqual(["dnd-table"]);
  // tried once, not on every refresh
  expect(w.calls.filter((c) => c.tool === "results").length).toBe(1);
});
