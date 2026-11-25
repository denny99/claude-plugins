// PluginState contract of dnd-studio. No imports; every top-level type exported.

export type UiKitState = {
  confirm?: string;
  toggled: string[];
  more: string[];
  details: string[];
  logMore: string[];
  /** Paged strips (Tabs): the page turned to, by key; absent = the page with the active tab. */
  pages?: Record<string, number>;
};

export type Tab = "table" | "build" | "world" | "lore" | "review" | "health";

/** A world of the Studio's lore vault (GET /dnd/lore/map without a world). */
export type LoreWorld = { world: string; counts: Record<string, number>; campaigns: string[] };
export type LoreEntry = { title: string; tags: string[]; status: string; sources?: string[] };
/** One world's map (GET /dnd/lore/map?world=). */
export type LoreMap = {
  world: string;
  kinds: Record<string, LoreEntry[]>;
  questions: string[];
  recent: { title: string; kind: string; updated: string }[];
};
export type LoreHit = { title: string; world: string; kind: string; tags: string[]; snippet: string; score: number };
export type LoreNote = {
  title: string;
  world: string;
  kind: string;
  tags: string[];
  status: string;
  body: string;
  links: string[];
  backlinks: string[];
  updated: string;
  sources: string[];
};
/** The Studio's spoiler-free mode of the open campaign (campaign action spoiler, only read); known false: not said. */
export type StudioSpoiler = { known: boolean; on: boolean; campaign: string };
/** What Claude reported for one step with the mod tool lore_progress. */
export type LoreReport = { state: "todo" | "active" | "done" | "warn" | "failed"; note: string; at: number };
/** The tabs Welt and Lore: the worlds, the chosen one, its map, a search, an open note, the reported steps. */
export type LoreState = {
  worlds: LoreWorld[] | null;
  world: string;
  map: LoreMap | null;
  kind: string;
  query: string;
  hits: LoreHit[] | null;
  note: LoreNote | null;
  error: string;
  fetchedAt: number;
  /** By world, then flow ("welt" | "lore"), then step number ("1"…). */
  reports: Record<string, Record<string, Record<string, LoreReport>>>;
};

export type Hero = {
  name: string;
  /** "Ausdauer 18/22 · Hoffnung 9" */
  values: string;
  conditions: string[];
  foe: boolean;
};

export type Roll = {
  who: string;
  label: string;
  total: string;
  verdict: string;
  hidden: boolean;
};
export type Secret = { who: string; text: string };
export type Npc = { name: string; place: string };
export type SceneSound = {
  name: string;
  file: string;
  loop: boolean;
  volume: number;
};

export type TableView = {
  fetchedAt: number;
  error?: string;
  /** The scene on the players' window; `pictured`: it has a picture or a clip (then scenePictureLook may make it the backdrop). */
  scene?: {
    title: string;
    place: string;
    notes: string;
    pictured?: boolean;
    /** The picture on the window as the table names it (ComfyUI's `/view?filename=…&subfolder=…&type=…`), '' none. */
    picture?: string;
  };
  /** Something stands on the players' window (a show, not the bare felt after clear). */
  shown?: boolean;
  party: Hero[];
  rolls: Roll[];
  secrets: Secret[];
  npcs: Npc[];
  sounds: SceneSound[];
  listening: boolean;
  speaker: string;
  paused: boolean;
  playersWindow: boolean;
  discord: boolean;
  spotlight: string;
  unheard: string;
  turnsWaiting: number;
};

export type Initiative = {
  order: string[];
  index: number;
  round: number;
  isActive: boolean;
};

/** What the model's own table calls told the mod (annotations, band, fairness). */
export type TableLive = {
  /** When the players last finished a turn (ms), 0 = none yet. */
  turnAt: number;
  /** When the GM last spoke (say_line) after that turn. */
  saidAt: number;
  /** A secret turn is pending: whisper only. */
  secretPending: string;
  /** Per hero: when last addressed (ms). */
  addressed: Record<string, number>;
  /** Last Discord/delivery or unheard warning. */
  warning: string;
  /** Names given to set_campaign_entry, newest last. */
  recentEntries: string[];
  /** The open Studio profile as studio_status said. */
  profile: string;
  /** prepare_table counts as last answered. */
  prepared: string;
  tick: number;
};

export type Rules = {
  annotate: boolean;
  denyLeaks: boolean;
  denyTalkNpc: boolean;
  denyFamily: boolean;
  spoilerSafe: boolean;
  /** Table backdrop: a live table shows its scene's picture or the pixel game table. */
  looks: boolean;
  /** Build looks: the backdrop follows the build phase (the table's backdrop is `looks`). */
  buildLooks: boolean;
};

export type AgentRun = {
  id: string;
  agent: string;
  campaign: string;
  /** The Studio profile the campaign lives in ("" when the Studio could not say; older runs have none). */
  profile?: string;
  state: "running" | "done" | "failed";
  startedAt: number;
  endedAt?: number;
  findingsFile?: string;
  findings?: number;
  /** pnp-architekt: the plan file its brief names. */
  planFile?: string;
};

/** Build progress (lib/progress.ts): the GPU kinds a build step makes. */
export type GpuKind =
  | "picture"
  | "map"
  | "refine"
  | "sound"
  | "voice"
  | "clip"
  | "3d"
  | "text";

export type TrackedJob = {
  id: string;
  kind: GpuKind;
  startedAt: number;
  endedAt?: number;
  failed?: boolean;
};

export type ProgressState = {
  jobs: TrackedJob[];
  /** Finished jobs' times (ms) per kind, newest last, at most `MEAN_OF`. */
  durations: Partial<Record<GpuKind, number[]>>;
  /** When the GPU last finished a job (ms), 0 = none yet: the start of the next job's share. */
  lastEndAt: number;
  /** prepare_table's last answer. */
  voices: {
    made: number;
    total: number;
    failed: number;
    at: number;
    since: number;
    /** The Studio's prepare job (`prep-…`) while it runs: `jobs wait` reports it, the mod polls it. */
    job?: string;
    /** The scope's chapter, for the label ("Stimmen Kap. 3"). */
    chapter?: string;
    /** The Studio's own estimate (eta_s) at `at`, ms. */
    etaMs?: number;
    /** The job finished or was cancelled: no row any more. */
    ended?: boolean;
  } | null;
  /** What an agent said it will make in all, per kind (build_progress), with when. */
  planned: Partial<Record<GpuKind, { total: number; at: number }>>;
  /** The texter's entries (Claude, no GPU): `total` from the plan (build_progress), `done` counted. */
  entries: { done: number; total: number; at: number } | null;
  /** Studio queue jobs the mod did not start (studio_status), with their kind when the Studio says it. */
  foreign: { kinds: (GpuKind | null)[]; at: number } | null;
};

export type CampaignInfo = {
  name: string;
  scenes: number;
  npcs: number;
  places: number;
  broken: number;
  fetchedAt: number;
};

export type Health = {
  checkedAt: number;
  app: "up" | "down";
  connected: boolean;
  detail: string;
  platform: string;
};

/** One line the person typed into the chat while the table was live (for the debrief). */
export type Interjection = { at: number; text: string };

export type WatcherState = {
  state: "none" | "running" | "ended";
  /** The watch URL's id (`…/watch/<id>`), seen when the Bash call was checked. */
  watchId: string;
  /** The Bash call's description: a task notification names it when the watch ends. */
  description: string;
  startedAt: number;
  endedAt: number;
};

export type DiscordRoom = { name: string; members: string[]; bot: boolean };
export type DiscordMember = { name: string; character: string };

/** What `discord` status (and split/move answers) said. */
export type DiscordInfo = {
  connected: boolean;
  channel: string;
  members: DiscordMember[];
  rooms: DiscordRoom[];
  missing: string[];
  warning: string;
  error: string;
  streamEnded: string[];
  unheard: string[];
  checkedAt: number;
};

/** The last whisper's delivery (discord whisper, roll_dice whisper). */
export type WhisperInfo = {
  to: string;
  delivered: boolean;
  reason: string;
  why: string;
  at: number;
};

/** The evening's own state: watcher, interjections, Discord, Studio version. */
export type EveningState = {
  watcher: WatcherState;
  notes: Interjection[];
  notesFile: string;
  discord: DiscordInfo | null;
  whisper: WhisperInfo | null;
  /** The Studio version the session first saw, and the one seen last. */
  versionAtStart: string;
  versionNow: string;
  /** Why Claude's MCP schemas look stale ('' = fine). */
  stale: string;
  /** A turn ended at a live table without a watcher: tell the model on the next prompt. */
  remindPending: boolean;
};

export type AcceptStatus = "ok" | "failed" | "warning" | "idle";

/** One row of the acceptance checklist (pnp-kampagne §4). */
export type AcceptItem = {
  key: string;
  label: string;
  status: AcceptStatus;
  /** "3/5" — counts only, safe while the human plays along. */
  counts: string;
  /** The names that miss something (hidden in spoiler-safe mode). */
  detail: string;
  /** The pnp agent that fixes it. */
  fix: string;
  /** The list it needs could not be read: "nicht geprüft", never open, no fix (status idle). */
  unchecked?: boolean;
};

export type GpuState = {
  running: number;
  queued: number;
  step: string;
  /** What the running job makes, in the game master's words ("Bild ‚Das Tor‘"); "" when the Studio does not say. */
  doing: string;
  progress: number | null;
  busyNote: string;
  checkedAt: number;
};

export type PlanApproval = {
  file: string;
  campaign: string;
  /** The Studio profile of the campaign (older sign-offs have none). */
  profile?: string;
  at: number;
};

export type BuildCheck = {
  items: AcceptItem[];
  checkedAt: number;
  error: string;
  gpu: GpuState | null;
  plan: PlanApproval | null;
};

export type LookState = {
  /** The look the plugin set: a look id, `pic-<key>` for a scene picture, '' none. */
  applied: string;
  /** Another plugin set (or cleared) the theme after ours: ours no longer stands, so we never clear. */
  foreign?: boolean;
  /**
   * The theme another plugin set last (its `$.theme.set` arguments, e.g. ds-seasons' season), set again when our
   * look ends instead of clearing to the app's default. Structural: colors and backdrop as the engine took them.
   */
  previous?: { colors?: unknown; backdrop?: unknown } | null;
};

/** What a person reviews in the Review tab: a new sound, picture or video, spoiler-free until revealed. */
export type ReviewKind = "sound" | "image" | "video";
export type ReviewVerdict = "" | "ok" | "redo";
export type ReviewItem = {
  id: string;
  /** Sent to Claude with "Ergebnis an Claude": shown greyed as done, no buttons. */
  sent?: boolean;
  /** When it was sent (shown as local clock time). */
  sentAt?: number;
  kind: ReviewKind;
  /** What it is for ("Torknarren"); for pictures and videos hidden until revealed. */
  name: string;
  /** Short facts ("Geräusch · 4 s, Schleife"). */
  meta: string;
  /** A local file path or an http(s) URL from the Studio. */
  source: string;
  /** Who redoes it on "nochmal machen" (pnp-klang, pnp-maler). */
  agent: string;
  /** The scene it belongs to (never shown before reveal; it may spoil). */
  scene: string;
  verdict: ReviewVerdict;
  note: string;
  revealed: boolean;
  addedAt: number;
  /** The Studio's result id, when known (results made in this session): what results save fetches. */
  resultId?: string;
  /** Where a Studio-relative source was saved on this computer (results save into the user's temp). */
  local?: string;
  /** Played or opened once: only then can the person judge it (Passt / Nochmal). */
  heard?: boolean;
  /** Why the last play/open failed (shown on the card). */
  error?: string;
};
export type ReviewState = { items: ReviewItem[]; playing: string; sentAt: number };

/** One task a button sent to Claude (kit section „ask Claude“): queued → running (bound to the turn carrying it) → done. */
export type AskedEntry = {
  at: number;
  phase: "queued" | "running" | "done";
  /** Start of the prompt (whitespace folded): finds it in the text of the turn that carries it. */
  probe?: string;
  /** The turn that carries the prompt; only its turn.complete answers it. */
  turnId?: string;
};
/** Whether the main loop is busy, and the sent tasks by key. */
export type AskedState = { busy: boolean; sent: Record<string, AskedEntry> };

declare module "claude-code" {
  interface PluginState {
    "dnd-studio": {
      ui: ShapedState<UiKitState>;
      tab: ShapedState<Tab>;
      table: ShapedState<TableView | null>;
      initiative: ShapedState<Initiative>;
      live: ShapedState<TableLive>;
      rules: ShapedState<Rules>;
      runs: ShapedState<AgentRun[]>;
      campaign: ShapedState<CampaignInfo | null>;
      preview: ShapedState<string>;
      health: ShapedState<Health | null>;
      clash: ShapedState<string | null>;
      look: ShapedState<LookState>;
      evening: ShapedState<EveningState>;
      check: ShapedState<BuildCheck>;
      review: ShapedState<ReviewState>;
      asked: ShapedState<AskedState>;
      progress: ShapedState<ProgressState>;
      lore: ShapedState<LoreState>;
      "studio-spoiler": ShapedState<StudioSpoiler>;
    };
  }
}
