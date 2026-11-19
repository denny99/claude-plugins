/**
 * Table backdrop and build looks: while a table is live the backdrop is the scene's picture (once scenePictureLook
 * makes one) or the pixel game table; while a build runs it follows the pipeline phase. The plugin clears a theme only
 * when it set the current one itself.
 */
import type { EngineInterface, On, ThemeSetArgs } from "claude-code";

import { detectPlatform } from "../lib/host";
import { LOOKS, phaseLook } from "../lib/looks";
import type { LookId } from "../lib/looks";
import { buildPhase, isLive } from "../lib/model";
import { fromBase64, parseBmp, pictureSvg } from "../lib/picture";
import {
  patchLook,
  readInitiative,
  readLook,
  readRules,
  readRuns,
  readTable,
} from "../lib/state";
import type { AgentRun, TableView } from "../types";
import { fetchFromStudio } from "./review";

const SCENE_PREFIX = "dnd-";
/** A scene picture's look: `pic-<key>` as the wanted look, `dnd-pic-<key>` as the backdrop scene. */
const PICTURE_PREFIX = "pic-";

/** A scene picture turned into a backdrop. `key` changes with the picture (then the theme is set again). */
export type PictureLook = { key: string; svg: string; alt: string };

/** Picture looks made this session, by key, for the Backdrop render (which cannot wait). */
const pictureLooks = new Map<string, PictureLook>();

/** Pictures being turned into looks now (by key), and those that could not be (fetch or sips failed): no retry. */
const pictureJobs = new Set<string>();
const pictureFailed = new Set<string>();

/** A short stable key for a picture's URL or path (FNV-1a, base 36). */
export function pictureKey(picture: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < picture.length; i++) h = Math.imul(h ^ picture.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/**
 * The Studio path of a table picture: the window names it as ComfyUI's `/view?filename=a.png&subfolder=s&type=output`,
 * results save wants `s/a.png [output]`. Anything else as it is.
 */
export function studioPathOfPicture(picture: string): string {
  const q = /^\/?view\?(.*)$/.exec(picture.trim());
  if (!q) return picture.trim();
  const args: Record<string, string> = {};
  for (const part of q[1]!.split("&")) {
    const [k, v = ""] = part.split("=");
    args[k!] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  const sub = (args.subfolder ?? "").replace(/\\/g, "/");
  return `${sub ? `${sub}/` : ""}${args.filename ?? ""} [${args.type || "output"}]`;
}

/** Only stills become backdrops (a clip keeps the game table). */
function isStill(path: string): boolean {
  return /\.(png|jpe?g|webp)(\s*\[\w+\])?$/i.test(path.trim());
}

/** Runs one macOS command; its stdout, or throws with its stderr. */
async function run($: EngineInterface, argv: string[]): Promise<string> {
  const r = await $.process.run(argv, { timeoutMs: 20000 } as never);
  if ((r.exitCode ?? 1) !== 0) throw new Error(r.stderr || `${argv[0]} failed`);
  return r.stdout;
}

/** The picture on this computer as a backdrop SVG (macOS: sips shrinks it to a BMP, base64 brings its bytes). */
export async function makePictureSvg(
  $: EngineInterface,
  local: string,
  tmp: string,
): Promise<string | undefined> {
  const props = await run($, ["/usr/bin/sips", "-g", "pixelWidth", "-g", "pixelHeight", local]);
  const width = Number(/pixelWidth:\s*(\d+)/.exec(props)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(props)?.[1]);
  if (!width || !height) throw new Error("sips read no size");
  return pictureSvg({ width, height }, async (w, h) => {
    await run($, ["/usr/bin/sips", "-s", "format", "bmp", "-z", String(h), String(w), local, "--out", tmp]);
    return parseBmp(fromBase64(await run($, ["/usr/bin/base64", "-i", tmp])));
  });
}

/** Fetches the picture (results save) and turns it into a look; then the backdrop is set again (applyLook). */
async function makePictureLook($: EngineInterface, key: string, picture: string, title: string): Promise<void> {
  try {
    const local = await fetchFromStudio($, { source: studioPathOfPicture(picture), resultId: undefined, local: undefined });
    const svg = await makePictureSvg($, local, `${local.replace(/\.[^./\\]+$/, "")}.dnd-backdrop.bmp`);
    if (!svg) throw new Error("too big");
    pictureLooks.set(key, { key, svg, alt: title ? `Szenenbild: ${title}` : "Szenenbild" });
  } catch {
    pictureFailed.add(key);
  } finally {
    pictureJobs.delete(key);
  }
  if (pictureLooks.has(key)) await applyLook($);
}

/**
 * The shown scene's picture as a backdrop SVG (400 x 250 pixel raster, same rules as lib/looks/*: no `<image>`, no
 * links, light and dark, under 128 KB), or undefined: then the live table gets the pixel game table. Made once per
 * picture on macOS in a job of its own (fetch and sips take longer than a hook may), applyLook runs again when it is
 * ready; until then, on other systems and when it fails the game table stands.
 */
export async function scenePictureLook(
  $: EngineInterface,
  view: TableView,
): Promise<PictureLook | undefined> {
  const picture = view.scene?.picture ?? "";
  if (!picture || !isStill(studioPathOfPicture(picture))) return undefined;
  const key = pictureKey(picture);
  const made = pictureLooks.get(key);
  if (made) return made;
  if (pictureFailed.has(key) || pictureJobs.has(key)) return undefined;
  if ((await detectPlatform($)) !== "macos") return undefined;
  pictureJobs.add(key);
  const title = view.scene?.title ?? "";
  $.clock.after(0, () => void makePictureLook($, key, picture, title));
  return undefined;
}

/** What wantedLook returns: '' (the person's own theme), a look id, or `pic-<key>` for a scene picture. */
export type WantedLook = LookId | "" | `${typeof PICTURE_PREFIX}${string}`;

export function themeOf(id: Exclude<WantedLook, "">): ThemeSetArgs {
  const look = id.startsWith(PICTURE_PREFIX) ? "table" : (id as LookId);
  return {
    colors: LOOKS[look].colors,
    backdrop: {
      scene: `${SCENE_PREFIX}${id}`,
      glass: { blur: 10, opacity: 0.72 },
    },
  };
}

/**
 * The look the plugin wants now ('' none: the person's own theme). A live table (switch Tisch-Hintergrund) gets its
 * scene's picture when scenePictureLook makes one, else the pixel game table; then a running build's phase.
 */
export async function wantedLook($: EngineInterface): Promise<WantedLook> {
  const rules = await readRules($);
  const view = await readTable($);
  if (rules.looks && view && isLive(view, await readInitiative($))) {
    const pic = view.scene?.pictured
      ? await scenePictureLook($, view).catch(() => undefined)
      : undefined;
    if (!pic) return "table";
    pictureLooks.set(pic.key, pic);
    return `${PICTURE_PREFIX}${pic.key}`;
  }
  const runs = await readRuns($);
  if (rules.buildLooks && buildOpen(runs, await $.clock.now()))
    return phaseLook(buildPhase(runs));
  return "";
}

/** A build left alone this long no longer counts as open (its look would otherwise stand for days). */
const BUILD_IDLE_MS = 3 * 60 * 60 * 1000;

/**
 * A build is open while an agent runs, and between its phases (reading the plan, approving, waiting) as long as the
 * last phase is not the fixes' end ("Done") and something happened in the last BUILD_IDLE_MS: then the look of the
 * last reached phase stays instead of flickering back to the person's theme. Reset empties the runs.
 */
export function buildOpen(runs: AgentRun[], now: number): boolean {
  if (runs.some((r) => r.state === "running")) return true;
  if (!runs.length || buildPhase(runs) === "Done") return false;
  const last = Math.max(...runs.map((r) => r.endedAt ?? r.startedAt));
  return now - last < BUILD_IDLE_MS;
}

/** Sets or clears the theme when the wanted look changed; never touches a theme it did not set. */
export async function applyLook($: EngineInterface): Promise<void> {
  try {
    const target = await wantedLook($);
    const look = await readLook($);
    if (target === look.applied) return;
    if (target) {
      await $.theme.set(themeOf(target));
      await patchLook($, () => ({ applied: target, foreign: false }));
    } else if (look.applied && look.foreign) {
      // another plugin's theme stands now: leave it, ours is gone anyway
      await patchLook($, () => ({ applied: "", foreign: false }));
    } else if (look.applied && look.previous) {
      // the theme that stood before ours (another plugin's, e.g. ds-seasons) comes back as it was
      await $.theme.set(look.previous as ThemeSetArgs);
      await patchLook($, () => ({ applied: "" }));
    } else if (look.applied) {
      await $.theme.clear();
      await patchLook($, () => ({ applied: "" }));
    }
  } catch {
    // a look never stalls the table
  }
}

/** Another plugin's theme.set / theme.clear (a plugin's own calls skip its own hooks): ours no longer stands. */
async function noteForeignTheme($: EngineInterface, args?: ThemeSetArgs): Promise<void> {
  try {
    // our own look is never "the one before" (the test engine hands a plugin its own calls)
    const scene = String((args?.backdrop as { scene?: unknown } | undefined)?.scene ?? "");
    if (scene.startsWith(SCENE_PREFIX)) return;
    // remember the other plugin's theme (a clear forgets it): it is what our look gives back when it ends
    await patchLook($, () => ({ previous: args ? { colors: args.colors, backdrop: args.backdrop } : null }));
    if ((await readLook($)).applied)
      await patchLook($, () => ({ foreign: true }));
  } catch {
    // observing never fails the other plugin's call
  }
}

export function registerLook(on: On): void {
  on("theme.set", async ($, e, next) => {
    const r = await next(e);
    await noteForeignTheme($, e as ThemeSetArgs);
    return r;
  });
  on("theme.clear", async ($, e, next) => {
    const r = await next(e);
    await noteForeignTheme($);
    return r;
  });
  on("ui.render", { component: "Backdrop" }, ($, e, next) => {
    if (e.surface !== "desktop" && e.surface !== "mobile") return next(e);
    const scene = String(e.props.scene ?? "");
    if (!scene.startsWith(SCENE_PREFIX)) return next(e);
    const id = scene.slice(SCENE_PREFIX.length);
    // A picture look not made in this run (a restart) draws the game table until the next applyLook.
    const look = id.startsWith(PICTURE_PREFIX)
      ? (pictureLooks.get(id.slice(PICTURE_PREFIX.length)) ?? LOOKS.table)
      : LOOKS[id as LookId];
    if (!look) return next(e);
    const { Svg } = $.ui.resolve(e);
    return <Svg source={look.svg} alt={look.alt} isInteractive />;
  });
}
