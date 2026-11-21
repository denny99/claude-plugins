/**
 * The world's lore in the Studio's knowledge vault, as the tabs Welt and Lore show it: the Studio's read-only HTTP
 * routes (`/dnd/lore/map`, `/dnd/lore/search`, `/dnd/lore/note` on 127.0.0.1, the MCP server's port and token), their
 * answers made safe, and the numbered steps of world design (skill pnp-weltenbau) and lore keeping (skill pnp-lore)
 * with their state: what Claude reported with the mod tool `lore_progress`, else what the vault's counts say.
 */
import type {
  LoreHit,
  LoreMap,
  LoreNote,
  LoreReport,
  LoreWorld,
} from "../types";
import type { StepState } from "./ui";

type Obj = Record<string, unknown>;

/** Note kinds of the `lore` tool, in the order the tabs list them, with their German names. */
export const KINDS: { id: string; de: string; plural: string }[] = [
  { id: "world", de: "Welt", plural: "Welt" },
  { id: "place", de: "Ort", plural: "Orte" },
  { id: "people", de: "Volk", plural: "Völker" },
  { id: "faction", de: "Fraktion", plural: "Fraktionen" },
  { id: "character", de: "Person", plural: "Personen" },
  { id: "history", de: "Geschichte", plural: "Geschichte" },
  { id: "religion", de: "Religion", plural: "Religionen" },
  { id: "magic", de: "Magie", plural: "Magie" },
  { id: "technology", de: "Technik", plural: "Technik" },
  { id: "creature", de: "Wesen", plural: "Wesen" },
  { id: "item", de: "Gegenstand", plural: "Gegenstände" },
  { id: "language", de: "Sprache", plural: "Sprache" },
  { id: "rule", de: "Regel", plural: "Regeln" },
  { id: "theme", de: "Thema", plural: "Themen" },
  { id: "question", de: "Frage", plural: "Fragen" },
  { id: "decision", de: "Entscheidung", plural: "Entscheidungen" },
  { id: "note", de: "Notiz", plural: "Notizen" },
];

export function kindDe(kind: string): string {
  return KINDS.find((k) => k.id === kind)?.de ?? kind;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};

// --- the Studio's routes ------------------------------------------------------------------------------------------

/** The URL of a lore route on this computer (empty params left out). */
export function loreUrl(
  port: number,
  route: "map" | "search" | "note",
  params: Record<string, string | number | undefined>,
): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `http://127.0.0.1:${port}/dnd/lore/${route}${q ? `?${q}` : ""}`;
}

/** GET /dnd/lore/map without a world: every world with its counts and campaigns. */
export function worldsOf(body: unknown): LoreWorld[] {
  const list = Array.isArray(body) ? body : obj(body).worlds;
  return (Array.isArray(list) ? list : [])
    .map((w) => {
      const o = obj(w);
      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj(o.counts ?? o.kinds))) counts[k] = num(v);
      return { world: str(o.world), counts, campaigns: strs(o.campaigns) };
    })
    .filter((w) => w.world);
}

/** GET /dnd/lore/map?world=: titles by kind, open questions, recently changed. */
export function mapOf(body: unknown): LoreMap {
  const o = obj(body);
  const kinds: LoreMap["kinds"] = {};
  for (const [kind, list] of Object.entries(obj(o.kinds)))
    kinds[kind] = (Array.isArray(list) ? list : [])
      .map((n) => {
        const e = obj(n);
        return { title: str(e.title), tags: strs(e.tags), status: str(e.status) };
      })
      .filter((n) => n.title);
  const qs = o.questions ?? o.open;
  const questions = (Array.isArray(qs) ? qs : [])
    .map((q) => (typeof q === "string" ? q : str(obj(q).title)))
    .filter(Boolean);
  const recent = (Array.isArray(o.recent) ? o.recent : [])
    .map((r) => {
      const e = obj(r);
      return { title: str(e.title), kind: str(e.kind), updated: str(e.updated) || String(num(e.updated) || "") };
    })
    .filter((r) => r.title);
  return { world: str(o.world), kinds, questions, recent };
}

/** GET /dnd/lore/search: the hits. */
export function hitsOf(body: unknown): LoreHit[] {
  const list = Array.isArray(body) ? body : obj(body).results;
  return (Array.isArray(list) ? list : [])
    .map((h) => {
      const o = obj(h);
      return {
        title: str(o.title),
        world: str(o.world),
        kind: str(o.kind),
        tags: strs(o.tags),
        snippet: str(o.snippet),
        score: num(o.score),
      };
    })
    .filter((h) => h.title);
}

/** GET /dnd/lore/note: one note. */
export function noteOf(body: unknown): LoreNote | null {
  const list = Array.isArray(body) ? body : obj(body).notes;
  const o = Array.isArray(list) ? obj(list[0]) : obj(body);
  if (!str(o.title)) return null;
  return {
    title: str(o.title),
    world: str(o.world),
    kind: str(o.kind),
    tags: strs(o.tags),
    status: str(o.status),
    body: str(o.body),
    links: strs(o.links),
    backlinks: strs(o.backlinks),
    updated: str(o.updated) || String(num(o.updated) || ""),
    sources: strs(o.sources),
  };
}

/** How many notes of these kinds a world has (from the map's lists, else its counts). */
export function countOf(
  kinds: readonly string[],
  map: LoreMap | null,
  world: LoreWorld | undefined,
): number {
  return kinds.reduce(
    (n, k) =>
      n +
      (map
        ? k === "question"
          ? Math.max(map.questions.length, map.kinds[k]?.length ?? 0)
          : (map.kinds[k]?.length ?? 0)
        : (world?.counts[k] ?? 0)),
    0,
  );
}

/** All notes of a world. */
export function totalOf(map: LoreMap | null, world: LoreWorld | undefined): number {
  if (map) return Object.values(map.kinds).reduce((n, l) => n + l.length, 0);
  return Object.values(world?.counts ?? {}).reduce((n, c) => n + c, 0);
}

/** „12 Notizen · 4 Orte · 3 Personen“: the biggest kinds first, at most `max`. */
export function countsText(counts: Record<string, number>, max = 3): string {
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  const parts = KINDS.filter((k) => k.id !== "question" && (counts[k.id] ?? 0) > 0)
    .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
    .slice(0, max)
    .map((k) => `${counts[k.id]} ${counts[k.id] === 1 ? k.de : k.plural}`);
  return [`${total} ${total === 1 ? "Notiz" : "Notizen"}`, ...parts].join(" · ");
}

/** The counts per kind of a world map (its lists' lengths). */
export function countsOfMap(map: LoreMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, l] of Object.entries(map.kinds)) out[k] = l.length;
  return out;
}

// --- the steps -------------------------------------------------------------------------------------------------------

export type Flow = "welt" | "lore";

type StepDef = {
  title: string;
  /** Who works on it: the skill or agent. */
  who: string;
  /** Kinds whose notes show the step begun / done (enough of them). */
  kinds?: string[];
  need?: number;
  /** What Claude is asked to do on a press. */
  ask: string;
};

/** The world design steps (skill pnp-weltenbau §1), as Yannick built Korath. */
export const WELT_STEPS: StepDef[] = [
  { title: "Idee/Kern", who: "pnp-weltenbau", kinds: ["world", "theme"], need: 2, ask: "Ton, Säulen, Grenzen, Sprache und führende Quelle der Welt klären und die Heimat-Notizen anlegen (das Entscheidungsprotokoll mit dem ersten lore decide)" },
  { title: "Geografie & Karte", who: "pnp-weltenbau · Karte", kinds: ["place"], need: 3, ask: "Land, Großregionen und Orte klären und die Weltkarte malen" },
  { title: "Völker & Kulturen", who: "pnp-weltenbau", kinds: ["people", "religion", "language"], need: 2, ask: "Völker, Kulturen, Glauben und Namen klären" },
  { title: "Fraktionen & Mächte", who: "pnp-weltenbau", kinds: ["faction"], need: 2, ask: "Fraktionen mit Ziel, Mittel, Gegner und Gesicht klären" },
  { title: "Geschichte & Zeitleiste", who: "pnp-weltenbau", kinds: ["history"], need: 2, ask: "das große Ereignis und die Zeitleiste klären" },
  { title: "Magie/Technik & Regeln", who: "pnp-weltenbau", kinds: ["magic", "technology", "rule"], need: 1, ask: "Magie oder Technik, ihren Preis und Tisch-Regeln klären" },
  { title: "Orte & NPCs", who: "pnp-weltenbau", kinds: ["character", "creature", "item"], need: 3, ask: "Orte im Kleinen und die Gesichter der Welt klären" },
  { title: "Konflikte & Aufhänger", who: "pnp-weltenbau", kinds: ["question"], need: 3, ask: "Konflikte und drei Abenteuer-Aufhänger klären" },
  { title: "Lore in den Vault", who: "pnp-weltenbau · lore", ask: "mit lore check prüfen: Art, Quelle, Links, kein Fakt doppelt, Fragen verlinkt, nichts Geheimes durchsickernd" },
  { title: "Review", who: "pnp-weltenbau", ask: "die Notizen frisch lesen und Widersprüche, doppelte Fakten und Lücken vorlegen (Widersprüche als Frage, nie selbst entscheiden)" },
];

/** The lore keeping steps (skill pnp-lore, „Die sechs Schritte“). */
export const LORE_STEPS: StepDef[] = [
  { title: "Bestand sichten", who: "pnp-lore · from_campaign", ask: "den Bestand sichten (lore map; ohne Notizen erst from_campaign)" },
  { title: "Notizen anlegen/abgleichen", who: "pnp-lore", need: 5, ask: "die Notizen mit Kampagne und Kanon abgleichen" },
  { title: "Verknüpfen", who: "pnp-lore", ask: "Links nachziehen, jeden Fakt nur in seiner Heimat-Notiz lassen, Zeitleiste, Namen und Aussprache und Entscheidungen nachziehen" },
  { title: "Geheimes markieren", who: "pnp-lore", ask: "Spielleiterwissen mit spoiler markieren" },
  { title: "Offene Fragen", who: "pnp-lore · pnp-weltenbau", ask: "die offenen Fragen sichten, beantwortete herausnehmen" },
  { title: "Kanon-Abgleich nach dem Abend", who: "pnp-lore nach pnp-chronist", ask: "den Kanon des letzten Abends in die Lore übernehmen und mit lore check prüfen" },
];

export function stepsOf(flow: Flow): StepDef[] {
  return flow === "welt" ? WELT_STEPS : LORE_STEPS;
}

export type StepView = { title: string; detail: string; state: StepState; ask: string };

/** The state of each step: reported (`lore_progress`) first, else read from the vault. */
export function stepViews(
  flow: Flow,
  reports: Record<string, LoreReport>,
  map: LoreMap | null,
  world: LoreWorld | undefined,
): StepView[] {
  const total = totalOf(map, world);
  const questions = map ? map.questions.length : (world?.counts.question ?? 0);
  const spoilers = map
    ? Object.values(map.kinds).some((l) => l.some((n) => n.tags.includes("spoiler")))
    : false;
  return stepsOf(flow).map((s, i) => {
    const r = reports[String(i + 1)];
    let state: StepState = "todo";
    let count = "";
    if (flow === "welt" && s.kinds) {
      const n = countOf(s.kinds, map, world);
      state = n >= (s.need ?? 1) ? "done" : n > 0 ? "active" : "todo";
      if (n) count = `${n} ${n === 1 ? "Notiz" : "Notizen"}`;
    } else if (flow === "welt" && i === 8) {
      state = total > 0 ? "active" : "todo";
    } else if (flow === "lore") {
      if (i === 0) state = total > 0 ? "done" : "todo";
      if (i === 1) {
        state = total >= (s.need ?? 1) ? "done" : total > 0 ? "active" : "todo";
        if (total) count = `${total} ${total === 1 ? "Notiz" : "Notizen"}`;
      }
      if (i === 3 && spoilers) state = "done";
      if (i === 4 && questions) {
        state = "active";
        count = `${questions} offen`;
      }
    }
    if (r) state = r.state;
    const detail = [s.who, r?.note || count || (state === "active" && !r ? "begonnen" : "")]
      .filter(Boolean)
      .join(" · ");
    return { title: s.title, detail, state, ask: s.ask };
  });
}

/** The prompt of a step button: work on step `n` of the world `world`. */
export function stepPrompt(flow: Flow, world: string, n: number): string {
  const s = stepsOf(flow)[n - 1];
  const skill = flow === "welt" ? "pnp-weltenbau" : "pnp-lore";
  return `D&D-Panel (Tab ${flow === "welt" ? "Welt" : "Lore"}): Arbeite mit dem Skill ${skill} an Schritt ${n} „${s?.title ?? ""}“ der Welt „${world}“: ${s?.ask ?? ""}. Erst lesen (lore map, lore search), dann mit mir im Gespräch; melde den Stand mit lore_progress.`;
}

/** The prompt of „Aus Kampagne übernehmen“: seed the world's lore from the open campaign. */
export function fromCampaignPrompt(campaign: string, world: string): string {
  return `D&D-Panel: Lore aus der Kampagne übernehmen. Skill pnp-lore, Abschnitt 2: lore from_campaign mit campaign „${campaign}“ und world „${world}“, danach lore map lesen und mir in drei Sätzen sagen, was entstand und was fehlt.`;
}

/** The prompt of „Welt entwerfen“: start world design (no world yet). */
export function newWorldPrompt(): string {
  return "D&D-Panel: Lass uns mit dem Skill pnp-weltenbau eine eigene Welt entwerfen, Schritt 1 „Idee/Kern“. Frag mich zuerst nach dem Namen und dem Ton.";
}
