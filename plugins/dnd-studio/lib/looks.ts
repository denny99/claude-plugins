/**
 * Scene looks: a mood library of small original vector scenes with matching palettes (dark + light halves), the
 * rules that pick a mood for a table scene, and the build-phase looks. Pure data and functions; no `$`.
 *
 * Every scene is pure vector (no pictures, fonts or links), slow CSS motion only, each moving part has a resting
 * place in the plain markup (reduced motion), the subject kept off the middle and the foot.
 */
import { makeColors } from "./make-colors.js";

export type LookId =
  | "table"
  | "tavern"
  | "forest"
  | "dungeon"
  | "camp"
  | "town"
  | "mountains"
  | "sea"
  | "swamp"
  | "battle"
  | "ruins"
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

/** The frame every scene shares: a sky gradient per mode and slow keyframes; `body` holds the scene's own shapes. */
function svg(hue: number, sat: number, body: string, css = ""): string {
  const dark = [hex(hue, sat, 6), hex(hue, sat, 14)];
  const light = [hex(hue, sat, 82), hex(hue, sat, 94)];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">` +
    `<style>` +
    `.s0{stop-color:${light[0]}}.s1{stop-color:${light[1]}}` +
    `@media (prefers-color-scheme: dark){.s0{stop-color:${dark[0]}}.s1{stop-color:${dark[1]}}}` +
    `.fl{animation:fl 3.5s ease-in-out infinite alternate}` +
    `@keyframes fl{from{opacity:.75}to{opacity:1}}` +
    `.dr{animation:dr 60s linear infinite alternate}` +
    `@keyframes dr{from{transform:translateX(-12px)}to{transform:translateX(12px)}}` +
    `.bo{animation:bo 9s ease-in-out infinite alternate}` +
    `@keyframes bo{from{transform:translateY(0)}to{transform:translateY(3px)}}` +
    `@media (prefers-reduced-motion: reduce){.fl,.dr,.bo{animation:none}}` +
    css +
    `</style>` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient></defs>` +
    `<rect width="400" height="250" fill="url(#g)"/>` +
    body +
    `</svg>`
  );
}

const fire = (x: number, y: number, c = "#e8892a"): string =>
  `<g class="fl"><path d="M${x} ${y}q-9-14 0-30q3 12 9 4q6 14-9 26z" fill="${c}"/><path d="M${x + 2} ${y}q-4-8 0-15q4 8 0 15z" fill="#f6d264"/></g>`;
const trees = (y: number, c: string, n = 9, x0 = 0): string =>
  Array.from({ length: n }, (_, i) => {
    const x = x0 + i * 46 + (i % 2) * 11;
    const h = 40 + ((i * 17) % 25);
    return `<path d="M${x} ${y}l14 -${h}l14 ${h}z" fill="${c}"/>`;
  }).join("");
const peaks = (y: number, c: string, snow = ""): string =>
  `<path d="M0 ${y}L60 ${y - 70}L110 ${y - 25}L170 ${y - 95}L240 ${y - 30}L300 ${y - 80}L400 ${y - 20}V250H0z" fill="${c}"/>` +
  (snow
    ? `<path d="M160 ${y - 82}L170 ${y - 95}L180 ${y - 82}z M290 ${y - 68}L300 ${y - 80}L310 ${y - 68}z" fill="${snow}"/>`
    : "");
const fog = (y: number, o = 0.25): string =>
  `<g class="dr" opacity="${o}"><ellipse cx="80" cy="${y}" rx="110" ry="9" fill="#c9d3cf"/><ellipse cx="320" cy="${y + 8}" rx="120" ry="8" fill="#c9d3cf"/></g>`;

type Spec = {
  label: string;
  hue: number;
  sat: number;
  accent: string;
  alt: string;
  body: string;
};

const SPECS: Record<LookId, Spec> = {
  table: {
    label: "Spieltisch",
    hue: 30,
    sat: 22,
    accent: "#8a5a2b",
    alt: "Ein ruhiger Spieltisch mit Würfeln und einer Kerze",
    body: `<rect x="0" y="200" width="400" height="50" fill="#5a3b22"/><rect x="40" y="185" width="16" height="16" rx="3" fill="#d8c9a8"/><circle cx="48" cy="193" r="2" fill="#5a3b22"/><rect x="350" y="170" width="8" height="30" fill="#efe4c8"/>${fire(354, 170, "#e8a33a")}`,
  },
  tavern: {
    label: "Taverne",
    hue: 25,
    sat: 35,
    accent: "#b4621e",
    alt: "Ein Tavernenkamin mit flackerndem Feuer",
    body: `<rect x="0" y="0" width="400" height="20" fill="#3a2414"/><rect x="0" y="205" width="400" height="45" fill="#4a2e18"/><path d="M300 205V140h80v65z" fill="#5d5249"/><rect x="315" y="165" width="50" height="40" fill="#1c120b"/>${fire(335, 203)}${fire(350, 203, "#d4632a")}<rect x="30" y="150" width="40" height="55" fill="#6b4524"/>`,
  },
  forest: {
    label: "Wald",
    hue: 120,
    sat: 22,
    accent: "#3f7a3a",
    alt: "Ein dunkler Wald mit ziehendem Nebel",
    body: `${trees(190, "#2c4a2a", 9)}${trees(230, "#1f3a1f", 9, 20)}${fog(200)}<rect y="230" width="400" height="20" fill="#1c2e1a"/>`,
  },
  dungeon: {
    label: "Verlies",
    hue: 30,
    sat: 10,
    accent: "#a0702a",
    alt: "Ein Steingang im Fackellicht",
    body: `<path d="M120 250V110q80-60 160 0v140z" fill="#14100c"/><path d="M0 0h400v30H0z" fill="#2a2520"/><rect x="60" y="120" width="6" height="25" fill="#4a3826"/>${fire(63, 120)}<rect x="335" y="120" width="6" height="25" fill="#4a3826"/>${fire(338, 120)}`,
  },
  camp: {
    label: "Nachtlager",
    hue: 230,
    sat: 25,
    accent: "#4f6fae",
    alt: "Ein Lagerfeuer unter den Sternen",
    body: `<g class="fl"><circle cx="40" cy="30" r="1.5" fill="#f2f0d8"/><circle cx="120" cy="18" r="1" fill="#f2f0d8"/><circle cx="360" cy="40" r="1.4" fill="#f2f0d8"/></g><circle cx="330" cy="45" r="12" fill="#e9e3c4"/>${trees(215, "#141a2a", 9)}<rect y="215" width="400" height="35" fill="#10141f"/>${fire(70, 228)}<path d="M300 228l25-40l25 40z" fill="#5a4a36"/>`,
  },
  town: {
    label: "Stadt & Markt",
    hue: 40,
    sat: 30,
    accent: "#b07a2a",
    alt: "Dächer einer Marktstadt",
    body: `<g fill="#6a4a30"><path d="M0 200l30-30l30 30v50H0z"/><path d="M70 200l25-40l25 40v50H70z"/><path d="M290 200l30-35l30 35v50h-60z"/><path d="M350 200l25-25l25 25v50h-50z"/></g><g class="bo"><path d="M150 230h100l-10-20h-80z" fill="#a8463a"/></g><rect y="235" width="400" height="15" fill="#4a3624"/>`,
  },
  mountains: {
    label: "Berge & Schnee",
    hue: 210,
    sat: 18,
    accent: "#4a78a8",
    alt: "Verschneite Gipfel bei leisem Schneefall",
    body: `${peaks(220, "#3c4a5a", "#e8eef4")}<g class="bo" fill="#f2f6fa" opacity=".8"><circle cx="50" cy="40" r="1.5"/><circle cx="210" cy="70" r="1.5"/><circle cx="350" cy="30" r="1.5"/><circle cx="130" cy="110" r="1.2"/></g>`,
  },
  sea: {
    label: "Meer & Küste",
    hue: 200,
    sat: 35,
    accent: "#2f7aa0",
    alt: "Langsame Wellen an einer felsigen Küste",
    body: `<rect y="170" width="400" height="80" fill="#24506a"/><g class="dr"><path d="M0 185q25-8 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0" stroke="#7fb3cc" fill="none" stroke-width="2" opacity=".6"/></g><path d="M330 250l20-60l30 20l20 40z" fill="#2c2f33"/>`,
  },
  swamp: {
    label: "Sumpf & Nebel",
    hue: 90,
    sat: 18,
    accent: "#6a8a3a",
    alt: "Ein Sumpf unter dichtem Nebel",
    body: `<rect y="200" width="400" height="50" fill="#26301c"/><g fill="#1a2214"><rect x="40" y="120" width="6" height="85"/><rect x="330" y="110" width="5" height="95"/><path d="M40 140l-20-20M46 130l22-18"/></g>${fog(190, 0.35)}${fog(150, 0.2)}`,
  },
  battle: {
    label: "Kampf",
    hue: 5,
    sat: 40,
    accent: "#b3392f",
    alt: "Rote Spannung: Banner und Rauch",
    body: `<rect y="215" width="400" height="35" fill="#3a1a14"/><g class="bo"><rect x="60" y="120" width="3" height="95" fill="#2a1a14"/><path d="M63 120h30l-8 10l8 10h-30z" fill="#9a2a22"/><rect x="330" y="130" width="3" height="85" fill="#2a1a14"/><path d="M333 130h28l-8 9l8 9h-28z" fill="#9a2a22"/></g>${fog(200, 0.18)}`,
  },
  ruins: {
    label: "Ruinen & Gruft",
    hue: 260,
    sat: 12,
    accent: "#7a6aa0",
    alt: "Zerbrochene Säulen in fahlem Licht",
    body: `<g fill="#3a3640"><rect x="40" y="130" width="22" height="90"/><rect x="100" y="160" width="22" height="60"/><rect x="290" y="120" width="22" height="100"/><rect x="345" y="170" width="22" height="50"/></g><rect y="220" width="400" height="30" fill="#24212a"/>${fog(215, 0.2)}`,
  },
  parchment: {
    label: "Welt-Studium",
    hue: 38,
    sat: 40,
    accent: "#9a6a2a",
    alt: "Eine alte Karte auf Pergament",
    body: `<rect x="250" y="150" width="130" height="80" rx="4" fill="#d9c49a" opacity=".85"/><path d="M265 210q20-30 45-10t50-30" stroke="#7a4a20" stroke-dasharray="4 3" fill="none" class="fl"/>`,
  },
  blueprint: {
    label: "Zeichentisch",
    hue: 215,
    sat: 45,
    accent: "#3a6ab0",
    alt: "Ein Bauplan auf dem Zeichentisch",
    body: `<g stroke="#8fb4e0" stroke-width=".6" opacity=".35">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 50} 0v250"/>`).join("")}${Array.from({ length: 6 }, (_, i) => `<path d="M0 ${i * 50}h400"/>`).join("")}</g><rect x="280" y="170" width="90" height="50" fill="none" stroke="#cfe0f4" class="fl"/>`,
  },
  ink: {
    label: "Feder & Tinte",
    hue: 35,
    sat: 25,
    accent: "#6a4a2a",
    alt: "Eine Feder über dem Tintenfass",
    body: `<rect y="215" width="400" height="35" fill="#4a3424"/><path d="M330 215h30v-18h-30z" fill="#1a1a22"/><g class="bo"><path d="M345 197l30-80q-5 40-26 80z" fill="#e8e0cc"/></g>`,
  },
  studio: {
    label: "Malerwerkstatt",
    hue: 15,
    sat: 30,
    accent: "#b05a3a",
    alt: "Eine Staffelei mit Leinwand",
    body: `<path d="M310 230l25-110l25 110M335 120v110" stroke="#5a3a24" stroke-width="4" fill="none"/><rect x="305" y="135" width="60" height="45" fill="#e8dcc4"/><g class="fl"><circle cx="325" cy="155" r="6" fill="#c0503a"/><circle cx="345" cy="160" r="7" fill="#3a6aa0"/></g>`,
  },
  music: {
    label: "Musikzimmer",
    hue: 280,
    sat: 22,
    accent: "#7a4aa0",
    alt: "Langsame Schallwellen",
    body: `<g class="dr" stroke="#b49ad0" fill="none" stroke-width="2" opacity=".5"><path d="M0 200q25-20 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0"/><path d="M0 215q25-12 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0"/></g>`,
  },
  stage: {
    label: "Bühnenbau",
    hue: 350,
    sat: 35,
    accent: "#a03a4a",
    alt: "Vorhänge einer Bühne im Aufbau",
    body: `<path d="M0 0h70q-10 120 10 250H0z M400 0h-70q10 120-10 250h80z" fill="#6a1e2a"/><rect y="225" width="400" height="25" fill="#3a2418"/><g class="fl"><ellipse cx="200" cy="230" rx="60" ry="6" fill="#f2dca0" opacity=".5"/></g>`,
  },
  inspect: {
    label: "Prüfung",
    hue: 190,
    sat: 20,
    accent: "#2a7a8a",
    alt: "Eine Lupe über Buchseiten",
    body: `<rect x="270" y="170" width="110" height="60" fill="#d8d4c8" opacity=".7"/><g class="bo"><circle cx="320" cy="180" r="22" fill="none" stroke="#3a3a3a" stroke-width="4"/><path d="M336 196l20 20" stroke="#3a3a3a" stroke-width="6"/></g>`,
  },
  forge: {
    label: "Werkstatt",
    hue: 20,
    sat: 30,
    accent: "#b0502a",
    alt: "Ein Amboss an der glühenden Esse",
    body: `<rect y="220" width="400" height="30" fill="#2a1e18"/><path d="M290 220h60v-12h20v-10h-90v10h10z" fill="#3a3a40"/>${fire(70, 222, "#e8602a")}${fire(84, 222)}`,
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
        svg: svg(s.hue, s.sat, s.body),
        alt: s.alt,
      },
    ];
  }),
) as Record<LookId, Look>;

/** Table moods a person can pick. */
export const TABLE_MOODS: LookId[] = [
  "table",
  "tavern",
  "forest",
  "dungeon",
  "camp",
  "town",
  "mountains",
  "sea",
  "swamp",
  "battle",
  "ruins",
];

const KEYWORDS: [LookId, RegExp][] = [
  [
    "battle",
    /kampf|schlacht|angriff|hinterhalt|battle|fight|ambush|combat|duell/i,
  ],
  [
    "tavern",
    /taverne|wirtshaus|schenke|gasthaus|gasthof|inn\b|tavern|pony|kneipe/i,
  ],
  [
    "dungeon",
    /verlies|kerker|höhle|hoehle|mine|stollen|dungeon|cave|tunnel|keller/i,
  ],
  ["ruins", /ruine|gruft|krypta|grab|friedhof|ruin|crypt|tomb|graveyard/i],
  ["camp", /lager|rast|nachtlager|feuerstelle|camp|night/i],
  ["swamp", /sumpf|moor|marsch|nebel|swamp|marsh|bog|fog/i],
  [
    "sea",
    /meer|küste|kueste|hafen|strand|schiff|see\b|sea|coast|harbo|ship|beach/i,
  ],
  ["mountains", /berg|gebirge|pass\b|gipfel|schnee|mountain|peak|snow/i],
  ["forest", /wald|forst|hain|lichtung|forest|wood|grove|clearing/i],
  ["town", /stadt|dorf|markt|gasse|platz|town|village|market|city|street/i],
];

/** A table scene's mood: the person's pick for it, an explicit `look: x` in its notes, keywords, else the table. */
export function moodFor(
  scene: { title: string; place: string; notes: string } | undefined,
  overrides: Record<string, string>,
): LookId {
  if (!scene) return "table";
  const picked = overrides[scene.title];
  if (picked && picked in LOOKS) return picked as LookId;
  const tag = /\blook:\s*([a-z]+)/i.exec(scene.notes)?.[1]?.toLowerCase();
  if (tag && tag in LOOKS) return tag as LookId;
  const text = `${scene.title} ${scene.place} ${scene.notes}`;
  return KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "table";
}

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
