/**
 * The pixel scenes of the looks, one file each, built on ../pixel (copied from ds-seasons): the table's standard
 * backdrop ("table", also the build's Done look) and the eight build looks.
 */
import { blueprintSvg } from "./blueprint";
import { forgeSvg } from "./forge";
import { inkSvg } from "./ink";
import { inspectSvg } from "./inspect";
import { musicSvg } from "./music";
import { parchmentSvg } from "./parchment";
import { stageSvg } from "./stage";
import { studioSvg } from "./studio";
import { tableSvg } from "./table";

export const PIXEL_LOOKS: Record<string, () => string> = {
  table: tableSvg,
  parchment: parchmentSvg,
  blueprint: blueprintSvg,
  ink: inkSvg,
  studio: studioSvg,
  music: musicSvg,
  stage: stageSvg,
  inspect: inspectSvg,
  forge: forgeSvg,
};
