/**
 * Pure shaping of what the Studio answers (table_state, campaign, logs) and of the mod's own state. No `$` here.
 */
import type {
  AgentRun,
  Hero,
  Initiative,
  Npc,
  Roll,
  SceneSound,
  Secret,
  StockLine,
  TableLive,
  TableView,
} from "../types";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

export const EMPTY_INITIATIVE: Initiative = {
  order: [],
  index: 0,
  round: 0,
  isActive: false,
};
export const EMPTY_LIVE: TableLive = {
  turnAt: 0,
  saidAt: 0,
  secretPending: "",
  addressed: {},
  warning: "",
  recentEntries: [],
  profile: "",
  prepared: "",
  tick: 0,
};

/** Heroes and foes: the party's names, then whoever set_status gave values or conditions. */
export function heroesOf(state: Obj): Hero[] {
  const status = obj(state.status);
  const names = [
    ...arr(state.party).map((p) =>
      typeof p === "string" ? p : str(obj(p).name),
    ),
  ].filter(Boolean);
  for (const who of Object.keys(status))
    if (!names.includes(who)) names.push(who);
  return names.map((name) => {
    const s = obj(status[name]);
    const values = Object.entries(obj(s.values))
      .map(([k, v]) => `${k} ${str(v)}`)
      .join(" · ");
    return {
      name,
      values,
      conditions: arr(s.conditions).map(str).filter(Boolean),
      foe: s.foe === true,
    };
  });
}

/** The evening's rolls, newest last. */
export function rollsOf(log: unknown[]): Roll[] {
  return log
    .map(obj)
    .filter((e) => e.kind === "roll")
    .map((e) => ({
      who: str(e.who),
      label: str(e.label),
      total: str(e.total),
      verdict: str(e.verdict),
      hidden: e.hidden === true,
    }));
}

/** Whispers and secret turns of the evening, newest last. */
export function secretsOf(log: unknown[]): Secret[] {
  return log
    .map(obj)
    .filter((e) => e.kind === "whisper" || e.kind === "secret")
    .map((e) => ({
      who: str(e.kind === "whisper" ? e.to : e.who),
      text: str(e.what) || str(e.text),
    }));
}

function stockOf(v: unknown): StockLine[] {
  const out: StockLine[] = [];
  for (const [kind, lines] of Object.entries(obj(v)))
    for (const l of arr(lines)) {
      const text = typeof l === "string" ? l : str(obj(l).text);
      if (text)
        out.push({
          kind,
          text,
          how: typeof l === "string" ? "" : str(obj(l).how),
        });
    }
  return out;
}

function soundsOf(v: unknown): SceneSound[] {
  return arr(v)
    .map(obj)
    .map((s) => {
      const file = str(s.file) || str(s.sound);
      const kind = str(s.kind).toLowerCase();
      const loop =
        typeof s.loop === "boolean"
          ? s.loop
          : kind === "ambience" || kind === "music";
      return {
        name: str(s.name) || str(s.title) || file,
        file,
        loop,
        volume: typeof s.volume === "number" ? s.volume : loop ? 0.25 : 1,
      };
    })
    .filter((s) => s.file);
}

/** The table as the GM screen shows it, from table_state (with log) and campaign (npcs, scenes). */
export function toTableView(state: Obj, campaign: Obj, now: number): TableView {
  const log = arr(state.log);
  const shown = obj(state.scene);
  const title = str(shown.title);
  const scenes = arr(campaign.scenes).map(obj);
  const scene = scenes.find(
    (s) => str(s.title) === title || str(s.name) === title,
  );
  const place = scene ? str(scene.place) : "";
  const npcs: Npc[] = arr(campaign.npcs)
    .map(obj)
    .map((n) => ({
      name: str(n.name),
      place: str(n.place),
      stock: stockOf(n.stock),
    }))
    .filter((n) => n.name);
  const here = place ? npcs.filter((n) => n.place === place) : [];
  const unheard = arr(obj(state.last_unheard).lines)
    .map((l) => str(obj(l).text))
    .join(" ");
  const spot = obj(state.spotlight);
  return {
    fetchedAt: now,
    scene: title
      ? { title, place, notes: scene ? str(scene.notes) : "" }
      : undefined,
    party: heroesOf(state),
    rolls: rollsOf(log),
    secrets: secretsOf(log),
    npcs: (here.length ? here : npcs).slice(0, 12),
    sounds: scene ? soundsOf(scene.sounds) : [],
    listening: state.listening === true,
    speaker: str(state.speaker),
    paused: state.paused === true,
    playersWindow: state.players_window === true,
    discord: state.discord === true,
    spotlight: str(spot.who),
    unheard,
    turnsWaiting:
      typeof state.turns_waiting === "number" ? state.turns_waiting : 0,
  };
}

/** A table is live when the players' window or the Discord bot is there, or a fight runs. */
export function isLive(view: TableView | null, ini: Initiative): boolean {
  return ini.isActive || !!view?.playersWindow || !!view?.discord;
}

/** "Thorin, Wolf 1; Mara" → names. */
export function parseOrder(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Next turn: wraps to the top with the next round. */
export function advance(ini: Initiative): Initiative {
  if (!ini.order.length) return ini;
  const next = ini.index + 1;
  return next >= ini.order.length
    ? { ...ini, index: 0, round: ini.round + 1 }
    : { ...ini, index: next };
}

export function currentTurn(ini: Initiative): string {
  return ini.isActive ? (ini.order[ini.index] ?? "") : "";
}

/** Seconds since the players finished a turn with no say_line after it (0 when answered). */
export function silentSeconds(live: TableLive, now: number): number {
  if (!live.turnAt || live.saidAt >= live.turnAt) return 0;
  return Math.max(0, Math.round((now - live.turnAt) / 1000));
}

/** The band's parts: scene · round · whose turn · silence. */
export function bandParts(
  view: TableView | null,
  ini: Initiative,
  live: TableLive,
  now: number,
): { text: string; silence: number; warning: string } {
  const parts: string[] = [];
  if (view?.scene) parts.push(view.scene.title);
  if (ini.isActive) parts.push(`R${ini.round}`);
  const turn = currentTurn(ini) || view?.spotlight || "";
  if (turn) parts.push(`${turn}'s turn`);
  if (view?.paused) parts.push("paused");
  return {
    text: parts.join(" · ") || "Table open",
    silence: silentSeconds(live, now),
    warning: live.warning,
  };
}

/** `dnd-studio:pnp-texter` / `pnp-texter` → `pnp-texter`; anything else undefined. */
export function pnpAgentOf(subagentType: string): string | undefined {
  const name = subagentType.split(":").pop() ?? "";
  return name.startsWith("pnp-") ? name : undefined;
}

/** The Mängel file (or protocol) a brief names: the first path ending .md/.txt, one with "ngel" preferred. */
export function findingsPathOf(prompt: string): string | undefined {
  const paths =
    prompt.match(/(?:~|\/|[A-Za-z]:\\)[^\s`'"()<>]+\.(?:md|txt)/g) ?? [];
  return paths.find((p) => /ngel|finding/i.test(p)) ?? paths[0];
}

/** Findings in a Mängel file: top-level list items, else `##` headings; "keine Mängel" counts 0. */
export function countFindings(md: string): number {
  if (/^\s*(keine|0)\s+m(ä|ae)ngel/im.test(md)) return 0;
  const items = md
    .split("\n")
    .filter((l) => /^\s?(?:[-*]|\d+[.)])\s+\S/.test(l)).length;
  if (items) return items;
  return md.split("\n").filter((l) => /^#{2,3}\s+\S/.test(l)).length;
}

/** The build pipeline of pnp-kampagne, in order. */
export const PIPELINE: { stage: string; agents: string[] }[] = [
  { stage: "Lore", agents: ["pnp-lore"] },
  { stage: "Plan", agents: ["pnp-architekt"] },
  { stage: "Texts", agents: ["pnp-texter"] },
  { stage: "Pictures", agents: ["pnp-maler"] },
  { stage: "Sounds", agents: ["pnp-klang"] },
  { stage: "Voices", agents: ["pnp-tischbereit"] },
  {
    stage: "Review",
    agents: [
      "pnp-review-technik",
      "pnp-review-konsistenz",
      "pnp-review-spielbarkeit",
    ],
  },
  { stage: "Fixes", agents: ["pnp-nachbesserer"] },
];

/** One stage's state from the runs: running beats failed beats done beats idle. */
export function stageState(
  runs: AgentRun[],
  agents: string[],
): "running" | "failed" | "ok" | "idle" {
  const mine = runs.filter((r) => agents.includes(r.agent));
  if (mine.some((r) => r.state === "running")) return "running";
  const last = mine.at(-1);
  if (!last) return "idle";
  return last.state === "failed" ? "failed" : "ok";
}

/** Review rounds so far: technik runs count rounds. */
export function reviewRounds(runs: AgentRun[]): number {
  return runs.filter((r) => r.agent === "pnp-review-technik").length;
}

/** A handout or secret sheet meant for one player ("Handout: Brief (für Mara)"). */
export function looksPrivate(input: Obj): string | undefined {
  const text = [input.title, input.text, input.words, input.show_text]
    .map(str)
    .join(" ");
  const m =
    /\(f(?:ü|ue)r\s+([^)]+)\)/i.exec(text) ??
    /handout[^\n]*\bf(?:ü|ue)r\s+(\S+)/i.exec(text);
  if (m) return m[1]?.trim();
  if (/\b(geheim|secret)\b/i.test(str(input.title))) return "one player";
  return undefined;
}

/** The pipeline phase the build is in: the newest running stage, else the last finished one, else ''. */
export function buildPhase(runs: AgentRun[]): string {
  const running = [...runs].reverse().find((r) => r.state === "running");
  const last = running ?? runs.at(-1);
  if (!last) return "";
  const stage =
    PIPELINE.find((p) => p.agents.includes(last.agent))?.stage ?? "";
  if (!running && stage === "Fixes") return "Done";
  return stage;
}

