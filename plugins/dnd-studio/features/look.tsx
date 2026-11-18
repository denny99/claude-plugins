/**
 * Table backdrop and build looks: while a table is live the backdrop is the scene's picture (once scenePictureLook
 * makes one) or the pixel game table; while a build runs it follows the pipeline phase. The plugin clears a theme only
 * when it set the current one itself.
 */
import type { EngineInterface, On, ThemeSetArgs } from "claude-code";

import { LOOKS, phaseLook } from "../lib/looks";
import type { LookId } from "../lib/looks";
import { buildPhase, isLive } from "../lib/model";
import {
  patchLook,
  readInitiative,
  readLook,
  readRules,
  readRuns,
  readTable,
} from "../lib/state";
import type { TableView } from "../types";

const SCENE_PREFIX = "dnd-";
/** A scene picture's look: `pic-<key>` as the wanted look, `dnd-pic-<key>` as the backdrop scene. */
const PICTURE_PREFIX = "pic-";

/** A scene picture turned into a backdrop. `key` changes with the picture (then the theme is set again). */
export type PictureLook = { key: string; svg: string; alt: string };

/** Picture looks made this session, by key, for the Backdrop render (which cannot wait). */
const pictureLooks = new Map<string, PictureLook>();

/**
 * The shown scene's picture as a backdrop SVG (400 x 250 pixel raster, same rules as lib/looks/*: no `<image>`, no
 * links, light and dark, under 128 KB), or undefined: then the live table gets the pixel game table.
 * Stub: fills in when pictures become backdrops; until then every live scene gets the game table.
 */
export async function scenePictureLook(
  _$: EngineInterface,
  _view: TableView,
): Promise<PictureLook | undefined> {
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
  if (rules.buildLooks && runs.some((r) => r.state === "running"))
    return phaseLook(buildPhase(runs));
  return "";
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
    } else if (look.applied) {
      await $.theme.clear();
      await patchLook($, () => ({ applied: "" }));
      $.ui.toast(
        "Tisch-Hintergrund aus. Ein anderes Farbschema (etwa ds-seasons) kommt nach einem Neustart von Claude zurück.",
      );
    }
  } catch {
    // a look never stalls the table
  }
}

/** Another plugin's theme.set / theme.clear (a plugin's own calls skip its own hooks): ours no longer stands. */
async function noteForeignTheme($: EngineInterface): Promise<void> {
  try {
    if ((await readLook($)).applied)
      await patchLook($, () => ({ foreign: true }));
  } catch {
    // observing never fails the other plugin's call
  }
}

export function registerLook(on: On): void {
  on("theme.set", async ($, e, next) => {
    const r = await next(e);
    await noteForeignTheme($);
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
