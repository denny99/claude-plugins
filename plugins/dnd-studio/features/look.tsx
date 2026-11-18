/**
 * Scene looks: while a table is live the theme and animated backdrop follow the shown scene's mood; while a build runs
 * they follow the pipeline phase. The plugin clears a theme only when it set the current one itself.
 */
import type {
  EngineInterface,
  On,
  RenderElement,
  ThemeSetArgs,
} from "claude-code";

import { LOOKS, TABLE_MOODS, moodFor, phaseLook } from "../lib/looks";
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
import { Actions, Line, Section } from "../lib/ui";
import type { Kit } from "../lib/ui";

const SCENE_PREFIX = "dnd-";

export function themeOf(id: LookId): ThemeSetArgs {
  return {
    colors: LOOKS[id].colors,
    backdrop: {
      scene: `${SCENE_PREFIX}${id}`,
      glass: { blur: 10, opacity: 0.72 },
    },
  };
}

/**
 * The look the plugin wants now ('' none: the person's own theme): a live table's scene with a picture first, then a
 * running build's phase. A scene without a picture, or a table that ended, gets no look of its own.
 */
export async function wantedLook($: EngineInterface): Promise<LookId | ""> {
  const rules = await readRules($);
  const view = await readTable($);
  if (
    rules.looks &&
    view?.scene?.pictured &&
    isLive(view, await readInitiative($))
  )
    return moodFor(view.scene, (await readLook($)).overrides);
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
        "Szenen-Look aus. Ein anderes Farbschema (etwa ds-seasons) kommt nach einem Neustart von Claude zurück.",
      );
    }
  } catch {
    // a look never stalls the table
  }
}

/** The person's pick for the shown scene, remembered per scene (and across sessions in the store). */
export async function pickMood(
  $: EngineInterface,
  sceneTitle: string,
  id: LookId,
): Promise<void> {
  const l = await patchLook($, (x) => ({
    overrides: { ...x.overrides, [sceneTitle]: id },
  }));
  await $.store.set("lookOverrides", l.overrides);
  await applyLook($);
}

export async function loadLookOverrides($: EngineInterface): Promise<void> {
  const kept = await $.store.get("lookOverrides");
  if (kept && typeof kept === "object")
    await patchLook($, (l) => ({
      overrides: { ...(kept as Record<string, string>), ...l.overrides },
    }));
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
    const look = LOOKS[scene.slice(SCENE_PREFIX.length) as LookId];
    if (!look) return next(e);
    const { Svg } = $.ui.resolve(e);
    return <Svg source={look.svg} alt={look.alt} isInteractive />;
  });
}

/** The mood picker for the shown scene (GM pane). */
export function renderLookPicker(
  $: EngineInterface,
  k: Kit,
  d: { sceneTitle: string; applied: string; enabled: boolean },
): RenderElement | null {
  if (!d.enabled || !d.sceneTitle) return null;
  return Section(k, {
    key: "look",
    title: d.applied
      ? `Look: ${LOOKS[d.applied as LookId]?.label ?? d.applied}`
      : "Look der Szene",
    collapsible: true,
    defaultOpen: false,
    children: [
      Line(
        k,
        "Bestimmt Hintergrund und Farben zur Szene; im Terminal nur die Farben.",
        { dim: true },
      ),
      Actions(
        k,
        "moods",
        TABLE_MOODS.map((id) => ({
          key: `mood-${id}`,
          label: LOOKS[id].label,
          primary: id === d.applied,
          onPress: () => void pickMood($, d.sceneTitle, id),
        })),
        3,
      ),
    ],
  });
}
