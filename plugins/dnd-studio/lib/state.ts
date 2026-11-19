/**
 * Every session atom of the plugin, with accessors: read/update only validate in the declaring module, so other files
 * go through these functions.
 */
import { atom, read, update } from "claude-code";
import { isCampaign, studioCall } from "./studio";
import type { EngineInterface } from "claude-code";

import type {
  AgentRun,
  CampaignInfo,
  Health,
  Initiative,
  Rules,
  ReviewState,
  Tab,
  TableLive,
  TableView,
  LookState,
  BuildCheck,
  EveningState,
  ProgressState,
} from "../types";
import {
  EMPTY_CHECK,
  EMPTY_EVENING,
  EMPTY_INITIATIVE,
  EMPTY_LIVE,
} from "./model";
import { EMPTY_PROGRESS } from "./progress";

export const DEFAULT_RULES: Rules = {
  annotate: true,
  denyLeaks: true,
  denyTalkNpc: true,
  denyFamily: true,
  spoilerSafe: true,
  // the D&D look behind the chat while a table runs: off unless the person turns it on (Zustand tab)
  looks: false,
  buildLooks: true,
};

const tabAtom = atom(
  { plugin: "dnd-studio", key: "tab" } as const,
  "table" as Tab,
  { shape: "tab-1" },
);
const tableAtom = atom(
  { plugin: "dnd-studio", key: "table" } as const,
  null as TableView | null,
  { shape: "table-2" },
);
const iniAtom = atom(
  { plugin: "dnd-studio", key: "initiative" } as const,
  EMPTY_INITIATIVE,
  { shape: "ini-1" },
);
const liveAtom = atom(
  { plugin: "dnd-studio", key: "live" } as const,
  EMPTY_LIVE,
  { shape: "live-1" },
);
const rulesAtom = atom(
  { plugin: "dnd-studio", key: "rules" } as const,
  DEFAULT_RULES,
  { shape: "rules-1" },
);
const runsAtom = atom(
  { plugin: "dnd-studio", key: "runs" } as const,
  [] as AgentRun[],
  { shape: "runs-1" },
);
const campaignAtom = atom(
  { plugin: "dnd-studio", key: "campaign" } as const,
  null as CampaignInfo | null,
  {
    shape: "campaign-1",
  },
);
const previewAtom = atom(
  { plugin: "dnd-studio", key: "preview" } as const,
  "",
  { shape: "preview-1" },
);
const healthAtom = atom(
  { plugin: "dnd-studio", key: "health" } as const,
  null as Health | null,
  { shape: "health-1" },
);

export async function readTab($: EngineInterface): Promise<Tab> {
  return read($, tabAtom);
}
export async function setTab($: EngineInterface, tab: Tab): Promise<void> {
  await update($, tabAtom, () => tab);
}
export async function readTable($: EngineInterface): Promise<TableView | null> {
  return read($, tableAtom);
}
export async function setTable(
  $: EngineInterface,
  view: TableView | null,
): Promise<void> {
  await update($, tableAtom, () => view);
}
export async function readInitiative($: EngineInterface): Promise<Initiative> {
  return read($, iniAtom);
}
export async function patchInitiative(
  $: EngineInterface,
  fn: (i: Initiative) => Initiative,
): Promise<Initiative> {
  let out = EMPTY_INITIATIVE;
  await update($, iniAtom, (i) => (out = fn(i)));
  return out;
}
export async function readLive($: EngineInterface): Promise<TableLive> {
  return read($, liveAtom);
}
export async function patchLive(
  $: EngineInterface,
  fn: (l: TableLive) => Partial<TableLive>,
): Promise<void> {
  await update($, liveAtom, (l) => ({ ...l, ...fn(l) }));
}
export async function readRules($: EngineInterface): Promise<Rules> {
  return { ...DEFAULT_RULES, ...(await read($, rulesAtom)) };
}
export async function toggleRule(
  $: EngineInterface,
  key: keyof Rules,
): Promise<void> {
  await update($, rulesAtom, (r) => ({
    ...DEFAULT_RULES,
    ...r,
    [key]: !{ ...DEFAULT_RULES, ...r }[key],
  }));
}
export async function readRuns($: EngineInterface): Promise<AgentRun[]> {
  return read($, runsAtom);
}
export async function patchRuns(
  $: EngineInterface,
  fn: (r: AgentRun[]) => AgentRun[],
): Promise<AgentRun[]> {
  let out: AgentRun[] = [];
  await update($, runsAtom, (r) => (out = fn(r).slice(-100)));
  return out;
}
export async function readCampaign(
  $: EngineInterface,
): Promise<CampaignInfo | null> {
  return read($, campaignAtom);
}
/**
 * The open campaign's name: the one last read, else read once now (campaign get overview, small) and kept, so a run
 * recorded before anyone pressed Check still names its campaign. "" when the Studio cannot say.
 */
export async function campaignName($: EngineInterface): Promise<string> {
  const known = (await read($, campaignAtom))?.name;
  if (known) return known;
  try {
    const c = await studioCall($, "campaign", { overview: true });
    if (!isCampaign(c)) return "";
    const name = typeof c.open === "string" ? c.open : String(c.name ?? "");
    const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    const fetchedAt = await $.clock.now();
    await update($, campaignAtom, () => ({
      name,
      scenes: n(c.scenes),
      npcs: n(c.npcs),
      places: n(c.places),
      broken: n(c.brokenReferences),
      fetchedAt,
    }));
    return name;
  } catch {
    return "";
  }
}
/**
 * The open Studio profile's name: the one studio_status last said, else asked once now (small) and kept. "" when the
 * Studio cannot say. The build's runs carry it, so a campaign of the same name in another profile starts empty.
 */
export async function profileName($: EngineInterface): Promise<string> {
  const known = (await read($, liveAtom)).profile;
  if (known) return known;
  try {
    return await noteProfile($, await studioCall($, "studio_status", {}));
  } catch {
    return "";
  }
}
/** Keeps the profile a studio_status answer names (`profile: {name, folder}` or a bare name); returns it. */
export async function noteProfile(
  $: EngineInterface,
  status: Record<string, unknown>,
): Promise<string> {
  const p = status?.profile;
  const name =
    typeof p === "string"
      ? p
      : p && typeof p === "object"
        ? String((p as Record<string, unknown>).name ?? "")
        : "";
  if (name) await update($, liveAtom, (l) => ({ ...l, profile: name }));
  return name;
}
export async function setCampaign(
  $: EngineInterface,
  c: CampaignInfo | null,
): Promise<void> {
  await update($, campaignAtom, () => c);
}
export async function readPreview($: EngineInterface): Promise<string> {
  return read($, previewAtom);
}
export async function setPreview(
  $: EngineInterface,
  text: string,
): Promise<void> {
  await update($, previewAtom, () => text);
}
const clashAtom = atom(
  { plugin: "dnd-studio", key: "clash" } as const,
  null as string | null,
  { shape: "clash-1" },
);
/** Why this plugin's own tools could not be registered at session start (null: all registered). */
export async function readClash($: EngineInterface): Promise<string | null> {
  return read($, clashAtom);
}
export async function setClash(
  $: EngineInterface,
  why: string | null,
): Promise<void> {
  await update($, clashAtom, () => why);
}
export async function readHealth($: EngineInterface): Promise<Health | null> {
  return read($, healthAtom);
}
export async function setHealth(
  $: EngineInterface,
  h: Health | null,
): Promise<void> {
  await update($, healthAtom, () => h);
}

const lookAtom = atom(
  { plugin: "dnd-studio", key: "look" } as const,
  { applied: "" } as LookState,
  {
    shape: "look-1",
  },
);
export async function readLook($: EngineInterface): Promise<LookState> {
  return read($, lookAtom);
}
export async function patchLook(
  $: EngineInterface,
  fn: (l: LookState) => Partial<LookState>,
): Promise<LookState> {
  let out: LookState = { applied: "" };
  await update($, lookAtom, (l) => (out = { ...l, ...fn(l) }));
  return out;
}

const eveningAtom = atom(
  { plugin: "dnd-studio", key: "evening" } as const,
  EMPTY_EVENING,
  {
    shape: "evening-2",
  },
);
export async function readEvening($: EngineInterface): Promise<EveningState> {
  return { ...EMPTY_EVENING, ...(await read($, eveningAtom)) };
}
export async function patchEvening(
  $: EngineInterface,
  fn: (s: EveningState) => Partial<EveningState>,
): Promise<EveningState> {
  let out = EMPTY_EVENING;
  await update(
    $,
    eveningAtom,
    (s) =>
      (out = { ...EMPTY_EVENING, ...s, ...fn({ ...EMPTY_EVENING, ...s }) }),
  );
  return out;
}

const checkAtom = atom(
  { plugin: "dnd-studio", key: "check" } as const,
  EMPTY_CHECK,
  {
    shape: "check-1",
  },
);
export async function readCheck($: EngineInterface): Promise<BuildCheck> {
  return { ...EMPTY_CHECK, ...(await read($, checkAtom)) };
}
export async function patchCheck(
  $: EngineInterface,
  fn: (c: BuildCheck) => Partial<BuildCheck>,
): Promise<BuildCheck> {
  let out = EMPTY_CHECK;
  await update(
    $,
    checkAtom,
    (c) => (out = { ...EMPTY_CHECK, ...c, ...fn({ ...EMPTY_CHECK, ...c }) }),
  );
  return out;
}

const EMPTY_REVIEW: ReviewState = { items: [], playing: "", sentAt: 0 };
const reviewAtom = atom(
  { plugin: "dnd-studio", key: "review" } as const,
  EMPTY_REVIEW,
  { shape: "review-1" },
);
export async function readReview($: EngineInterface): Promise<ReviewState> {
  return { ...EMPTY_REVIEW, ...(await read($, reviewAtom)) };
}
export async function patchReview(
  $: EngineInterface,
  fn: (r: ReviewState) => Partial<ReviewState>,
): Promise<ReviewState> {
  let out = EMPTY_REVIEW;
  await update(
    $,
    reviewAtom,
    (r) => (out = { ...EMPTY_REVIEW, ...r, ...fn({ ...EMPTY_REVIEW, ...r }) }),
  );
  return out;
}

const progressAtom = atom(
  { plugin: "dnd-studio", key: "progress" } as const,
  EMPTY_PROGRESS,
  { shape: "progress-1" },
);
/** Build progress (lib/progress.ts): the GPU jobs seen, their times, voices, plans and entries. */
export async function readProgress($: EngineInterface): Promise<ProgressState> {
  return read($, progressAtom);
}
export async function patchProgress(
  $: EngineInterface,
  fn: (p: ProgressState) => ProgressState,
): Promise<void> {
  await update($, progressAtom, fn);
}
