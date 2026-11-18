/**
 * The pixel scenes of the eight build looks, one file each, built on ../pixel (copied from ds-seasons).
 * A function that returns "" leaves the plain vector scene of looks.ts in place.
 */
import { blueprintSvg } from "./blueprint";
import { forgeSvg } from "./forge";
import { inkSvg } from "./ink";
import { inspectSvg } from "./inspect";
import { musicSvg } from "./music";
import { parchmentSvg } from "./parchment";
import { stageSvg } from "./stage";
import { studioSvg } from "./studio";

export const PIXEL_LOOKS: Record<string, () => string> = {
  parchment: parchmentSvg,
  blueprint: blueprintSvg,
  ink: inkSvg,
  studio: studioSvg,
  music: musicSvg,
  stage: stageSvg,
  inspect: inspectSvg,
  forge: forgeSvg,
};
