/**
 * Pure shaping of what the Studio answers (table_state, campaign, logs) and of the mod's own state. No `$` here.
 */
import type {
  AcceptItem,
  AgentRun,
  BuildCheck,
  DiscordInfo,
  EveningState,
  GpuState,
  WhisperInfo,
  ListenerState,
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

const VERDICT_DE: Record<string, string> = {
  success: "Erfolg",
  failure: "Fehlschlag",
  great: "großer Erfolg",
  "great success": "großer Erfolg",
  extraordinary: "außergewöhnlicher Erfolg",
  "extraordinary success": "außergewöhnlicher Erfolg",
  automatic: "automatischer Erfolg",
  "automatic success": "automatischer Erfolg",
  critical: "kritischer Erfolg",
  "critical!": "kritischer Erfolg",
  fumble: "Patzer",
};

/** A roll's verdict as the Studio names it ("Great success") in German; unknown words pass unchanged. */
export function verdictDe(verdict: string): string {
  return VERDICT_DE[verdict.trim().toLowerCase()] ?? verdict;
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
      verdict: verdictDe(str(e.verdict)),
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
  const onWindow = str(shown.kind) !== "clear";
  const title = onWindow ? str(shown.title) : "";
  const pictured =
    onWindow && (!!str(shown.picture) || !!shown.video || !!str(shown.clip));
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
      ? {
          title,
          place,
          notes: scene ? str(scene.notes) : "",
          pictured,
          picture: onWindow ? str(shown.picture) : "",
        }
      : undefined,
    shown: onWindow && (!!title || pictured),
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
    listener: str(state.listener),
  };
}

/**
 * A table is live when an evening really runs: a fight, or the players' window or the Discord bot there AND
 * something of an evening on it (a scene shown, the players talking, a break, a spotlight, the listener on, turns
 * waiting). An open window or a connected bot alone (a test, a build) is no evening.
 */
export function isLive(view: TableView | null, ini: Initiative): boolean {
  if (ini.isActive) return true;
  if (!view || (!view.playersWindow && !view.discord)) return false;
  const listener = !!view.listener && view.listener !== "off";
  return (
    !!view.shown ||
    view.listening ||
    view.paused ||
    !!view.spotlight ||
    listener ||
    view.turnsWaiting > 0
  );
}

/** Turns the players gave that nobody will take: they wait, and no evening (or no watcher, no listener) is there. */
export function strandedTurns(
  view: TableView | null,
  ini: Initiative,
  watcherRunning: boolean,
): number {
  if (!view || view.turnsWaiting <= 0) return 0;
  const listener = !!view.listener && view.listener !== "off";
  const heard = view.discord || view.playersWindow;
  return !isLive(view, ini) || !heard || (!listener && !watcherRunning)
    ? view.turnsWaiting
    : 0;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The person's local clock time of `ms` ("12:10"): every time the pane shows goes through these three. */
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** The person's local day of `ms` ("2026-11-18"). */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The person's local day and time of `ms` ("2026-11-18 12:30"). */
export function localDateTime(ms: number): string {
  return `${localDay(ms)} ${clockTime(ms)}`;
}

/** "Thorin, Wolf 1; Mara" → names. */
export function parseOrder(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Next turn: from "before the first" (index -1, just set) to the first; wraps to the top with the next round. */
export function advance(ini: Initiative): Initiative {
  if (!ini.order.length) return ini;
  const next = Math.max(ini.index, -1) + 1;
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
  if (ini.isActive) parts.push(`Runde ${ini.round}`);
  const turn = currentTurn(ini) || view?.spotlight || "";
  if (turn) parts.push(`${turn} ist dran`);
  if (view?.paused) parts.push("Pause");
  return {
    text: parts.join(" · ") || "Tisch offen",
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

/** What the game master reads for each pnp agent: a role, never the agent's file name. */
export const AGENT_LABEL: Record<string, string> = {
  "pnp-architekt": "Architekt",
  "pnp-texter": "Texter",
  "pnp-maler": "Maler",
  "pnp-klang": "Klang-Macher",
  "pnp-tischbereit": "Stimmen-Macher",
  "pnp-nachbesserer": "Nachbesserer",
  "pnp-lore": "Welt-Notizen",
  "pnp-pruefer": "Prüfer",
  "pnp-chronist": "Chronist",
  "pnp-vorbereiter": "Vorbereiter",
  "pnp-zuhoerer": "Zuhörer",
  "pnp-review-technik": "Prüfer Technik",
  "pnp-review-konsistenz": "Prüfer Stimmigkeit",
  "pnp-review-spielbarkeit": "Prüfer Spielbarkeit",
};

/** `pnp-maler` → "Maler"; a list "pnp-maler, pnp-texter (…)" → "Maler, Texter". */
export function agentLabel(names: string): string {
  return names
    .replace(/\s*\(.*\)$/, "")
    .split(/\s*[,+]\s*/)
    .filter(Boolean)
    .map((n) => AGENT_LABEL[n] ?? n.replace(/^pnp-/, ""))
    .join(", ");
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

export const EMPTY_LISTENER: ListenerState = {
  running: [],
  startedAt: 0,
  endedAt: 0,
  returned: false,
  woke: false,
  why: "",
  turn: [],
  sent: false,
  secret: false,
  between: [],
  error: "",
};

export const EMPTY_EVENING: EveningState = {
  listener: EMPTY_LISTENER,
  watcher: {
    state: "none",
    watchId: "",
    description: "",
    startedAt: 0,
    endedAt: 0,
  },
  notes: [],
  notesFile: "",
  discord: null,
  whisper: null,
  versionAtStart: "",
  versionNow: "",
  stale: "",
  remindPending: false,
  remindListener: false,
};

export const EMPTY_CHECK: BuildCheck = {
  items: [],
  checkedAt: 0,
  error: "",
  gpu: null,
  plan: null,
};

// --- the evening: watcher, Discord, version ------------------------------------------------------------------------

/** A Bash command that runs the Studio's watch URL (`curl -s -m 1900 http://127.0.0.1:<port>/watch/<id>`). */
export function isWatchCommand(command: string): boolean {
  return /\/watch\/[0-9a-z]{6,}/i.test(command);
}

/** Listener mode: the table's switch says "haiku" (open mic, pnp-zuhoerer waits for the GM). */
export function isListenerMode(view: TableView | null): boolean {
  return view?.listener === "haiku";
}

export type ListenerReturn = {
  woke: boolean;
  why: string;
  lines: { who: string; text: string; secret: boolean }[];
  sent: boolean;
  secret: boolean;
  between: string[];
};

/**
 * The listener's answer `{woke, why, turn, between}` (pnp-zuhoerer returns exactly that JSON; a code fence or a word
 * around it is tolerated). Undefined when no such object is in the text.
 */
export function listenerReturnOf(answer: string): ListenerReturn | undefined {
  const o = listenerJsonOf(answer);
  if (!o) return undefined;
  const turn = obj(o.turn);
  const lines = arr(turn.lines)
    .map(obj)
    .map((l) => ({
      who: str(l.who),
      text: str(l.text),
      secret: l.secret === true,
    }))
    .filter((l) => l.who || l.text);
  return {
    woke: o.woke === true,
    why: str(o.why),
    lines,
    sent: turn.sent === true,
    secret: turn.secret === true || lines.some((l) => l.secret),
    between: arr(o.between)
      .map((b) => str(b))
      .filter(Boolean),
  };
}

/** The listener's JSON object (with a boolean `woke`): a fenced ```json block first, then each `{` in the text. */
function listenerJsonOf(answer: string): Obj | undefined {
  const parse = (text: string): Obj | undefined => {
    try {
      const o = obj(JSON.parse(text));
      return typeof o.woke === "boolean" ? o : undefined;
    } catch {
      return undefined;
    }
  };
  for (const m of answer.matchAll(/```(?:json)?[ \t]*\n([\s\S]*?)```/gi)) {
    const o = parse((m[1] ?? "").trim());
    if (o) return o;
  }
  const ends: number[] = [];
  for (let i = answer.length - 1; i >= 0; i--)
    if (answer[i] === "}") ends.push(i);
  for (
    let start = answer.indexOf("{");
    start >= 0;
    start = answer.indexOf("{", start + 1)
  )
    for (const end of ends) {
      if (end <= start) break;
      const o = parse(answer.slice(start, end + 1));
      if (o) return o;
    }
  return undefined;
}

/** The id in a watch URL (`…/watch/<id>`), or "". */
export function watchIdOf(command: string): string {
  return /\/watch\/([0-9a-z]{6,})/i.exec(command)?.[1] ?? "";
}

/** The app's version from a studio_status answer: an explicit app version, or `version` when it looks like one. */
export function versionOf(status: Obj): string {
  for (const v of [
    status.app_version,
    status.appVersion,
    status.studio_version,
    obj(status.app).version,
  ])
    if (str(v)) return str(v);
  return /^\d+\.\d+/.test(str(status.version)) ? str(status.version) : "";
}

/** The Studio refusing arguments Claude's cached schema offered ("say_line has no x (it takes: …)") = stale schemas. */
export function staleSchemaOf(text: string): string {
  const m = /\b(\w+) has no ([\w, ]+) \(it takes:/.exec(text);
  return m ? `${m[1]} refused ${m[2]}` : "";
}

/** discord status (or a split/move/aside answer) → what the pane shows. */
export function discordOf(json: Obj, now: number): DiscordInfo {
  const voice = obj(json.voice);
  const names = (v: unknown): string[] =>
    arr(v)
      .map((x) =>
        typeof x === "string" ? x : str(obj(x).name) || str(obj(x).who),
      )
      .filter(Boolean);
  return {
    connected: json.connected === true,
    channel: str(json.here) || str(voice.name),
    members: arr(json.members)
      .map(obj)
      .map((m) => ({ name: str(m.name), character: str(m.character) }))
      .filter((m) => m.name),
    rooms: arr(json.rooms)
      .map(obj)
      .map((r) => ({
        name: str(r.name),
        members: arr(r.members).map(str).filter(Boolean),
        bot: r.bot === true,
      }))
      .filter((r) => r.name),
    missing: arr(json.missing)
      .map((m) =>
        typeof m === "string" ? m : str(obj(m).what) || str(obj(m).name),
      )
      .filter(Boolean),
    warning: str(json.warning),
    error: str(json.error),
    streamEnded: names(json.stream_ended),
    unheard: names(json.unheard),
    checkedAt: now,
  };
}

/** A whisper's delivery from discord whisper or roll_dice whisper; undefined when the answer has none. */
export function whisperOf(json: Obj, now: number): WhisperInfo | undefined {
  const w = typeof json.delivered === "boolean" ? json : obj(json.whisper);
  if (typeof w.delivered !== "boolean") return undefined;
  return {
    to: str(w.to) || str(w.hero),
    delivered: w.delivered,
    reason: str(w.reason),
    why: str(w.why),
    at: now,
  };
}

const JOB_KIND: Record<string, string> = {
  picture: "Bild",
  image: "Bild",
  sound: "Klang",
  voice: "Stimme",
  line: "Stimme",
  clip: "Clip",
  video: "Clip",
  animate: "Clip",
  map: "Karte",
  "3d": "3D-Modell",
};

/** "Bild ‚Das Tor‘" from a job's kind and name, when the Studio names them; never a ComfyUI node. */
function jobDoing(job: Obj): string {
  const kind = JOB_KIND[(str(job.kind) || str(job.feature)).toLowerCase()] ?? "";
  const name = str(job.name) || str(job.title) || str(job.label);
  if (!kind) return "";
  return name ? `${kind} ‚${name}‘` : kind;
}

/** Running and queued jobs from studio_status. */
export function gpuOf(status: Obj, now: number): GpuState {
  const jobs = arr(status.jobs).map(obj);
  const running = jobs.filter((j) => j.running === true);
  const first = running[0] ?? {};
  return {
    running: running.length,
    queued: jobs.length - running.length,
    step: str(first.step) || str(first.mode),
    doing: jobDoing(first),
    progress: typeof first.progress === "number" ? first.progress : null,
    busyNote: str(status.computerBusy),
    checkedAt: now,
  };
}

// --- acceptance checklist (pnp-kampagne §4) ------------------------------------------------------------------------

const START_RE =
  /start(feld|felder|squares?|positions?|platz)|\b[A-Z]\d{1,2}\b/i;
const SILENT_RE = /\b(stumm|silent|mute|spricht nicht)\b/i;

function names(list: string[]): string {
  return list.join(", ");
}

function item(
  key: string,
  label: string,
  total: number,
  missing: string[],
  fix: string,
  emptyStatus: AcceptItem["status"] = "idle",
): AcceptItem {
  const empty = total === 0;
  return {
    key,
    label,
    status: empty ? emptyStatus : missing.length ? "failed" : "ok",
    counts: empty
      ? emptyStatus === "idle"
        ? "entfällt (noch nichts da)"
        : "fehlt noch"
      : `${total - missing.length}/${total}`,
    detail: names(missing),
    fix: missing.length || (empty && emptyStatus !== "idle") ? fix : "",
  };
}

/** The rows each read list feeds: a list that could not be read leaves them "nicht geprüft". */
const ROWS_OF_LIST: Record<string, string[]> = {
  scenes: ["scenes", "start"],
  places: ["maps", "pins", "start"],
  npcs: ["npcs"],
};

/**
 * Every §4 row the Studio can answer: campaign get, map list and the last prepare_table counts. `unread` names the
 * lists (scenes, places, npcs) the check could not read: their rows say "nicht geprüft" (idle, no fix) instead of
 * counting the overview's bare rows as all missing.
 */
export function acceptanceOf(
  campaign: Obj,
  mapList: Obj,
  prepared: string,
  unread: readonly string[] = [],
): AcceptItem[] {
  const skip = new Set(unread.flatMap((l) => ROWS_OF_LIST[l] ?? []));
  return acceptanceRows(campaign, mapList, prepared).map((it) =>
    skip.has(it.key)
      ? {
          ...it,
          status: "idle",
          counts: "nicht geprüft",
          detail: "",
          fix: "",
          unchecked: true,
        }
      : it,
  );
}

function acceptanceRows(
  campaign: Obj,
  mapList: Obj,
  prepared: string,
): AcceptItem[] {
  const name = str(campaign.open) || str(campaign.name);
  const scenes = arr(campaign.scenes).map(obj);
  const places = arr(campaign.places).map(obj);
  const npcs = arr(campaign.npcs).map(obj);
  const placeMap = new Map(places.map((p) => [str(p.name), str(p.map)]));
  const out: AcceptItem[] = [];

  // Scenes: picture, read-aloud text and the recipe in the notes.
  const sceneGaps: string[] = [];
  const sceneFix = new Set<string>();
  for (const s of scenes) {
    const lack = [
      str(s.picture) ? "" : "Bild",
      str(s.text) ? "" : "Vorlesetext",
      str(s.notes) ? "" : "Ablauf",
    ].filter(Boolean);
    if (lack.length) sceneGaps.push(`${str(s.title)} (${lack.join("/")})`);
    if (lack.includes("Bild")) sceneFix.add("pnp-maler");
    if (lack.includes("Vorlesetext") || lack.includes("Ablauf"))
      sceneFix.add("pnp-texter");
  }
  out.push(
    item(
      "scenes",
      "Szenen mit Bild, Vorlesetext und Ablauf",
      scenes.length,
      sceneGaps,
      [...sceneFix].join(", ") || "pnp-texter",
      "failed",
    ),
  );

  // Maps of this campaign painted (every planned tile), places pinned.
  const maps = arr(mapList.maps).map(obj);
  const used = new Set(
    [
      ...placeMap.values(),
      ...(typeof campaign.worldMap === "string" ? [campaign.worldMap] : []),
    ].filter(Boolean),
  );
  const mine = maps.filter(
    (m) =>
      used.has(str(m.name)) ||
      arr(m.usedBy).some((u) => !!name && str(u).includes(name)),
  );
  const unpainted = mine
    .filter((m) => {
      const tiles = arr(m.tiles).map(str);
      const planned = Array.isArray(m.planned) ? m.planned.map(str) : [];
      return !tiles.length || planned.some((t) => !tiles.includes(t));
    })
    .map((m) => str(m.name));
  for (const want of used)
    if (!maps.some((m) => str(m.name) === want))
      unpainted.push(`${want} (fehlt)`);
  out.push(
    item(
      "maps",
      "Karten gemalt",
      Math.max(mine.length, used.size),
      unpainted,
      "pnp-maler",
      "failed",
    ),
  );
  // A place with no in goes on the campaign map; without one (worldMap false) there is nowhere to put it: the region
  // that holds every place on its own map (Ödland's Rostmark, 2026-11-18) stayed red for good
  const pinnable = places.filter((p) => str(p.in) || campaign.worldMap !== false);
  const unpinned = pinnable
    .filter(
      (p) => p.marker === null || p.marker === undefined || p.marker === false,
    )
    .map((p) => str(p.name));
  out.push(
    item(
      "pins",
      "Orte auf ihrer Karte",
      pinnable.length,
      unpinned,
      "pnp-maler",
    ),
  );

  // Talking NPCs: portrait, voice, sheet, stock lines.
  const talking = npcs.filter(
    (n) => !SILENT_RE.test(`${str(n.notes)} ${str(n.looks)}`),
  );
  const npcGaps: string[] = [];
  const npcFix = new Set<string>();
  for (const n of talking) {
    const stock = obj(n.stock);
    const lack = [
      str(n.portrait) ? "" : "Bild",
      str(n.voice) || n.ownVoice === true ? "" : "Stimme",
      str(n.sheet) ? "" : "Werte",
      Object.values(stock).some((l) => arr(l).length) ? "" : "Sätze",
    ].filter(Boolean);
    if (!lack.length) continue;
    npcGaps.push(`${str(n.name)} (${lack.join("/")})`);
    if (lack.includes("Bild")) npcFix.add("pnp-maler");
    if (lack.includes("Stimme")) npcFix.add("pnp-nachbesserer");
    if (lack.includes("Werte") || lack.includes("Sätze"))
      npcFix.add("pnp-texter");
  }
  out.push(
    item(
      "npcs",
      "Sprechende NPCs mit Bild, Stimme, Werten und Sätzen",
      talking.length,
      npcGaps,
      [...npcFix].join(", "),
    ),
  );

  // Scenes on a map name the start squares.
  const onMap = scenes.filter((s) => !!placeMap.get(str(s.place)));
  const noStart = onMap
    .filter((s) => !START_RE.test(str(s.notes)))
    .map((s) => str(s.title));
  out.push(
    item(
      "start",
      "Startfelder in den Szenen",
      onMap.length,
      noStart,
      "pnp-texter",
    ),
  );

  // Threads and where the party is (a chapter of a campaign).
  const threads = arr(campaign.threads).length;
  const partyAt = str(campaign.partyAt) || str(campaign.party_at);
  out.push({
    key: "threads",
    label: "Offene Fäden und wo die Gruppe steht",
    status: threads && partyAt ? "ok" : "warning",
    counts: `${threads} Fäden · ${partyAt ? "Standort gesetzt" : "Standort fehlt"}`,
    detail: partyAt,
    fix: threads && partyAt ? "" : "pnp-texter (chapter of a campaign)",
  });

  // Broken references.
  const broken = arr(campaign.brokenReferences).map((b) =>
    typeof b === "string" ? b : str(obj(b).name) || JSON.stringify(b),
  );
  out.push({
    key: "broken",
    label: "Kaputte Verweise",
    status: broken.length ? "failed" : "ok",
    counts: String(broken.length),
    detail: names(broken),
    fix: broken.length ? "pnp-nachbesserer" : "",
  });

  // Voices made ahead (prepare_table).
  const m = /^(\d+|\?)\/(\d+)(?:, (\d+) failed)?/.exec(prepared);
  const failed = m?.[3] ? Number(m[3]) : 0;
  const short = m ? m[1] !== m[2] : false;
  // a prepare job still running (" läuft"): not short yet, nothing to fix
  const running = / läuft$/.test(prepared);
  out.push({
    key: "prepare",
    label: "Stimmen vorbereitet",
    status: !prepared ? "idle" : running ? "warning" : failed || short ? "failed" : "ok",
    counts: prepared
      ? prepared.replace(/(\d+) failed/, "$1 fehlgeschlagen")
      : "noch nicht gelaufen",
    detail: "",
    fix: running ? "" : !prepared || failed || short ? "pnp-tischbereit" : "",
  });
  return out;
}

/** A file-name-safe word. */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "evening"
  );
}

/** Blocks the app or the IDE attaches to a typed prompt (never what the person typed). */
const ATTACHED_TAG =
  "system-reminder|command-[\\w-]+|local-command-[\\w-]+|ide_[\\w-]+|task-notification|user-prompt-submit-hook|bash-[\\w-]+";

/**
 * Only what the person typed: every attached block (`<system-reminder>…</system-reminder>` with its session ids,
 * `<command-…>`, `<local-command-…>`, `<ide_…>`, …) is cut out, a lone leftover tag of these too; '' when nothing is left.
 */
export function personsText(text: string): string {
  return String(text ?? "")
    .replace(
      new RegExp(`<(${ATTACHED_TAG})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"),
      " ",
    )
    .replace(new RegExp(`<(${ATTACHED_TAG})\\b[^>]*>[\\s\\S]*$`, "i"), " ")
    .replace(new RegExp(`<\\/?(${ATTACHED_TAG})\\b[^>]*>`, "gi"), " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** The interjections as the person typed them: attached blocks cut out, empty ones dropped. */
export function personsNotes<T extends { text: string }>(notes: T[]): T[] {
  return notes
    .map((n) => ({ ...n, text: personsText(n.text) }))
    .filter((n) => n.text);
}

/** The debrief file's text. */
export function debriefText(
  title: string,
  notes: { at: number; text: string }[],
): string {
  return [
    `# Einwürfe — ${title}`,
    "",
    "Was du bei laufendem Tisch in den Chat geschrieben hast (für die Nachbesprechung, nach-dem-abend.md).",
    "",
    ...personsNotes(notes).map(
      (n) =>
        `- ${clockTime(n.at)} ${n.text.replace(/\s+/g, " ")}`,
    ),
    "",
  ].join("\n");
}
