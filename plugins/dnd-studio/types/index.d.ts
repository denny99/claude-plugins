// PluginState contract of dnd-studio. No imports; every top-level type exported.

export type UiKitState = {
  confirm?: string;
  toggled: string[];
  more: string[];
  details: string[];
  logMore: string[];
};

export type Tab = "table" | "build" | "health";

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
export type StockLine = { kind: string; text: string; how: string };
export type Npc = { name: string; place: string; stock: StockLine[] };
export type SceneSound = {
  name: string;
  file: string;
  loop: boolean;
  volume: number;
};

export type TableView = {
  fetchedAt: number;
  error?: string;
  scene?: { title: string; place: string; notes: string };
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
  looks: boolean;
};

export type AgentRun = {
  id: string;
  agent: string;
  campaign: string;
  state: "running" | "done" | "failed";
  startedAt: number;
  endedAt?: number;
  findingsFile?: string;
  findings?: number;
  /** pnp-architekt: the plan file its brief names. */
  planFile?: string;
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
  /** The background Bash task that runs the watch URL. */
  taskId: string;
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
};

export type GpuState = {
  running: number;
  queued: number;
  step: string;
  progress: number | null;
  busyNote: string;
  checkedAt: number;
};

export type PlanApproval = { file: string; campaign: string; at: number };

export type BuildCheck = {
  items: AcceptItem[];
  checkedAt: number;
  error: string;
  gpu: GpuState | null;
  plan: PlanApproval | null;
};

export type LookState = { applied: string; overrides: Record<string, string> };

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
      look: ShapedState<LookState>;
      evening: ShapedState<EveningState>;
      check: ShapedState<BuildCheck>;
    };
  }
}
