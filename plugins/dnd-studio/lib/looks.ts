/**
 * Looks: the table's standard backdrop (a pixel game table, "table") and the eight build-phase looks, each a palette
 * (dark + light halves) with a pixel scene from ./looks/*. Pure data and functions; no `$`.
 *
 * Every scene is pure vector (no pictures, fonts or links), stepped CSS motion that stops for reduced motion.
 */
import { makeColors } from "./make-colors.js";
import { PIXEL_LOOKS } from "./looks/index";

export type LookId =
  | "table"
  | "parchment"
  | "blueprint"
  | "ink"
  | "studio"
  | "music"
  | "stage"
  | "inspect"
  | "forge";

export type Look = {
  id: LookId;
  label: string;
  colors: ReturnType<typeof makeColors>["theme"];
  problems: string[];
  svg: string;
  alt: string;
};

/** hsl → #rrggbb */
function hex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Tinted grays from one hue, both modes; accent and the meaning roles tuned toward the look. */
function palette(
  label: string,
  hue: number,
  sat: number,
  accent: string,
): ReturnType<typeof makeColors> {
  return makeColors({
    label,
    roles: {
      accent,
      danger: "#b3392f",
      success: "#4e7d3a",
      warning: "#b07a14",
      pro: "#6d4f94",
    },
    light: {
      gray: {
        anchors: {
          "surface-0": hex(hue, sat, 89),
          "surface-1": hex(hue, sat, 92),
          "surface-2": hex(hue, sat, 95),
          "text-primary": hex(hue, 25, 11),
          "text-secondary": hex(hue, 20, 24),
          "text-muted": hex(hue, 15, 34),
        },
      },
    },
    dark: {
      gray: {
        anchors: {
          "surface-0": hex(hue, sat, 8),
          "surface-1": hex(hue, sat, 10),
          "surface-2": hex(hue, sat, 12),
          "surface-3": hex(hue, sat, 14),
          "text-primary": hex(hue, 20, 93),
          "text-secondary": hex(hue, 15, 80),
          "text-muted": hex(hue, 12, 66),
        },
      },
    },
  });
}

type Spec = {
  label: string;
  hue: number;
  sat: number;
  accent: string;
  alt: string;
};

const SPECS: Record<LookId, Spec> = {
  table: {
    label: "Spieltisch",
    hue: 30,
    sat: 22,
    accent: "#8a5a2b",
    alt: "Ein Spieltisch von oben mit Karte, Würfeln, Figuren und einer flackernden Kerze",
  },
  parchment: {
    label: "Welt-Studium",
    hue: 38,
    sat: 40,
    accent: "#9a6a2a",
    alt: "Eine alte Karte auf Pergament",
  },
  blueprint: {
    label: "Zeichentisch",
    hue: 215,
    sat: 45,
    accent: "#3a6ab0",
    alt: "Ein Bauplan auf dem Zeichentisch",
  },
  ink: {
    label: "Feder & Tinte",
    hue: 35,
    sat: 25,
    accent: "#6a4a2a",
    alt: "Eine Feder über dem Tintenfass",
  },
  studio: {
    label: "Malerwerkstatt",
    hue: 15,
    sat: 30,
    accent: "#b05a3a",
    alt: "Eine Staffelei mit Leinwand",
  },
  music: {
    label: "Musikzimmer",
    hue: 280,
    sat: 22,
    accent: "#7a4aa0",
    alt: "Langsame Schallwellen",
  },
  stage: {
    label: "Bühnenbau",
    hue: 350,
    sat: 35,
    accent: "#a03a4a",
    alt: "Vorhänge einer Bühne im Aufbau",
  },
  inspect: {
    label: "Prüfung",
    hue: 190,
    sat: 20,
    accent: "#2a7a8a",
    alt: "Eine Lupe über Buchseiten",
  },
  forge: {
    label: "Werkstatt",
    hue: 20,
    sat: 30,
    accent: "#b0502a",
    alt: "Ein Amboss an der glühenden Esse",
  },
};

export const LOOKS: Record<LookId, Look> = Object.fromEntries(
  (Object.keys(SPECS) as LookId[]).map((id) => {
    const s = SPECS[id];
    const { theme, problems } = palette(s.label, s.hue, s.sat, s.accent);
    return [
      id,
      {
        id,
        label: s.label,
        colors: theme,
        problems,
        svg: PIXEL_LOOKS[id]?.() ?? "",
        alt: s.alt,
      },
    ];
  }),
) as Record<LookId, Look>;

/** The build pipeline's stage → its look ('' none). */
export function phaseLook(stage: string): LookId | "" {
  const map: Record<string, LookId> = {
    Lore: "parchment",
    Plan: "blueprint",
    Texts: "ink",
    Pictures: "studio",
    Sounds: "music",
    Voices: "stage",
    Review: "inspect",
    Fixes: "forge",
    Done: "table",
  };
  return map[stage] ?? "";
}
