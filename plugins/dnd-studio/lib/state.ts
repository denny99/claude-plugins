/**
 * Every session atom of the plugin, with accessors: read/update only validate in the declaring module, so other files
 * go through these functions.
 */
import { atom, read, update } from "claude-code";
import type { EngineInterface } from "claude-code";

import type {
  AgentRun,
  CampaignInfo,
  Health,
  Initiative,
  Rules,
  Tab,
  TableLive,
  TableView,
  LookState,
  BuildCheck,
  EveningState,
} from "../types";
import {
  EMPTY_CHECK,
  EMPTY_EVENING,
  EMPTY_INITIATIVE,
  EMPTY_LIVE,
} from "./model";

export const DEFAULT_RULES: Rules = {
  annotate: true,
  denyLeaks: true,
  denyTalkNpc: true,
  denyFamily: true,
  spoilerSafe: true,
  looks: true,
};

const tabAtom = atom(
  { plugin: "dnd-studio", key: "tab" } as const,
  "table" as Tab,
  { shape: "tab-1" },
);
const tableAtom = atom(
  { plugin: "dnd-studio", key: "table" } as const,
  null as TableView | null,
  { shape: "table-1" },
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
  { applied: "", overrides: {} } as LookState,
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
  let out: LookState = { applied: "", overrides: {} };
  await update($, lookAtom, (l) => (out = { ...l, ...fn(l) }));
  return out;
}

const eveningAtom = atom(
  { plugin: "dnd-studio", key: "evening" } as const,
  EMPTY_EVENING,
  {
    shape: "evening-1",
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
