/**
 * The tabs Welt (world design, skill pnp-weltenbau) and Lore (lore keeping, skill pnp-lore), built like the Bau tab: a
 * card with the vault's state on top (as the progress/GPU card there), then the numbered steps with „x von N“ (as
 * „Bau-Abschnitte“), then what the vault holds. Read only: the Studio's HTTP routes `/dnd/lore/*` on 127.0.0.1 with the
 * MCP server's port and token, fetched on a person's press or tab switch, never on a render. Writing happens through
 * Claude (the Studio's MCP tool `lore`), asked by the buttons here, or in the Studio's own Lore tab. The steps' state
 * comes from the mod tool `lore_progress` (Claude and the pnp-lore agent report it), else from the vault's counts.
 */
import { atom, read, update } from "claude-code";
import type {
  EngineInterface,
  On,
  PluginOptions,
  RenderElement,
} from "claude-code";

import { portOf } from "./health";
import {
  countsOfMap,
  countsText,
  fromCampaignPrompt,
  hitsOf,
  kindDe,
  KINDS,
  loreUrl,
  mapOf,
  newWorldPrompt,
  noteOf,
  stepPrompt,
  stepsOf,
  stepViews,
  totalOf,
  worldsOf,
} from "../lib/lore";
import type { Flow } from "../lib/lore";
import { readCampaign, readTab } from "../lib/state";
import { tidyError } from "../lib/host";
import { STUDIO_TOOL_PREFIX } from "../lib/studio";
import {
  askAction,
  Card,
  EmptyState,
  ListRow,
  SearchField,
  Segment,
  SelectRow,
  Stepper,
  wrapText,
} from "../lib/ui";
import type { Kit, RankedAction, StatusInfo, StepState } from "../lib/ui";
import type { LoreReport, LoreState } from "../types";

export const LORE_PROGRESS_TOOL = "lore_progress";
export const LORE_PROGRESS_TOOL_DESCRIPTION =
  "Tells the D&D pane (tabs Welt and Lore) how far a world's design or lore keeping is, shown as numbered steps like the Build tab's. flow welt = skill pnp-weltenbau's ten steps (1 Idee/Kern, 2 Geografie & Karte, 3 Völker & Kulturen, 4 Fraktionen & Mächte, 5 Geschichte & Zeitleiste, 6 Magie/Technik & Regeln, 7 Orte & NPCs, 8 Konflikte & Aufhänger, 9 Lore in den Vault, 10 Review); flow lore = skill pnp-lore's six (1 Bestand sichten, 2 Notizen anlegen/abgleichen, 3 Verknüpfen, 4 Geheimes markieren, 5 Offene Fragen, 6 Kanon-Abgleich nach dem Abend). Call it with state active when a step begins and done (with a short German note such as '4 Orte, 1 Frage') when its notes are written; todo resets it. Changes nothing in the Studio.";

const EMPTY: LoreState = {
  worlds: null,
  world: "",
  map: null,
  kind: "",
  query: "",
  hits: null,
  note: null,
  error: "",
  fetchedAt: 0,
  reports: {},
};
const STORE_KEY = "lore-reports";

const loreAtom = atom({ plugin: "dnd-studio", key: "lore" } as const, EMPTY, {
  shape: "lore-1",
});

export async function readLore($: EngineInterface): Promise<LoreState> {
  return { ...EMPTY, ...(await read($, loreAtom)) };
}

async function patchLore(
  $: EngineInterface,
  fn: (s: LoreState) => Partial<LoreState>,
): Promise<LoreState> {
  let out = EMPTY;
  await update(
    $,
    loreAtom,
    (s) => (out = { ...EMPTY, ...s, ...fn({ ...EMPTY, ...s }) }),
  );
  return out;
}

/** The reported steps kept across sessions (the plugin's store), loaded at session start. */
export async function loadLoreReports($: EngineInterface): Promise<void> {
  const kept = await $.store.get(STORE_KEY);
  if (kept && typeof kept === "object" && !Array.isArray(kept))
    await patchLore($, (s) =>
      Object.keys(s.reports).length ? {} : { reports: kept as LoreState["reports"] },
    );
}

// --- the Studio's routes ------------------------------------------------------------------------------------------

/** GET one lore route; the parsed JSON, or throws with a short German reason. */
async function loreGet(
  $: EngineInterface,
  options: PluginOptions,
  route: "map" | "search" | "note",
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const token = typeof options.token === "string" ? options.token : "";
  const res = await $.http.fetch(loreUrl(portOf(options), route, params), {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404)
    throw new Error(
      "Das Studio kennt die Lore noch nicht (HTTP 404): Studio-App aktualisieren.",
    );
  if (!res.ok) throw new Error(`Lore nicht lesbar: HTTP ${res.status}`);
  try {
    return JSON.parse(res.text) as unknown;
  } catch {
    throw new Error("Lore nicht lesbar: keine JSON-Antwort");
  }
}

function why(err: unknown): string {
  return tidyError(err instanceof Error ? err.message : String(err));
}

/**
 * Reads the worlds, picks one (the one chosen, else the open campaign's, else the first) and reads its map. Called
 * when a person opens or reloads the tab Welt or Lore, and after Claude wrote to the lore while one of them is open.
 */
export async function refreshLore(
  $: EngineInterface,
  options: PluginOptions,
  world?: string,
): Promise<void> {
  try {
    const worlds = worldsOf(await loreGet($, options, "map", {}));
    const s = await readLore($);
    const campaign = (await readCampaign($))?.name ?? "";
    const chosen =
      [world, s.world].find((w) => w && worlds.some((x) => x.world === w)) ??
      worlds.find((w) => campaign && w.campaigns.includes(campaign))?.world ??
      worlds[0]?.world ??
      "";
    const map = chosen
      ? mapOf(await loreGet($, options, "map", { world: chosen }))
      : null;
    const now = await $.clock.now();
    await patchLore($, (cur) => ({
      worlds,
      world: chosen,
      map,
      error: "",
      fetchedAt: now,
      ...(chosen !== cur.world
        ? { kind: "", query: "", hits: null, note: null }
        : {}),
    }));
  } catch (err) {
    await patchLore($, () => ({ error: why(err) }));
  }
}

async function chooseWorld(
  $: EngineInterface,
  options: PluginOptions,
  world: string,
): Promise<void> {
  await refreshLore($, options, world);
}

async function search(
  $: EngineInterface,
  options: PluginOptions,
  q: string,
): Promise<void> {
  const s = await patchLore($, () => ({ query: q }));
  if (!q.trim()) {
    await patchLore($, () => ({ hits: null }));
    return;
  }
  try {
    const hits = hitsOf(
      await loreGet($, options, "search", {
        q,
        world: s.world,
        kind: s.kind,
        limit: 20,
      }),
    );
    await patchLore($, (cur) => (cur.query === q ? { hits, error: "" } : {}));
  } catch (err) {
    await patchLore($, () => ({ error: why(err) }));
  }
}

async function openNote(
  $: EngineInterface,
  options: PluginOptions,
  title: string,
): Promise<void> {
  const s = await readLore($);
  try {
    const note = noteOf(
      await loreGet($, options, "note", { world: s.world, title }),
    );
    await patchLore($, () => ({
      note,
      error: note ? "" : `„${title}“ nicht gefunden`,
    }));
  } catch (err) {
    await patchLore($, () => ({ error: why(err) }));
  }
}

// --- the mod tool lore_progress and the hook on the Studio's lore tool ---------------------------------------------

const STATES = ["todo", "active", "done", "warn", "failed"] as const;

/** The mod tool `lore_progress`: one step's state of a world's design or lore keeping. */
export async function loreProgressTool(
  $: EngineInterface,
  input: Record<string, unknown>,
): Promise<string> {
  const flow = input.flow === "lore" ? "lore" : input.flow === "welt" ? "welt" : "";
  if (!flow) return "Give flow: welt or lore.";
  const steps = stepsOf(flow);
  const step = Math.round(Number(input.step));
  if (!(step >= 1 && step <= steps.length))
    return `Give step: 1 to ${steps.length}.`;
  const cur = await readLore($);
  const world = String(input.world ?? "").trim() || cur.world;
  if (!world) return "Give world: the world's name as the lore tool names it.";
  const state = STATES.includes(input.state as never)
    ? (input.state as LoreReport["state"])
    : "active";
  const note = String(input.note ?? "").slice(0, 80);
  const at = await $.clock.now();
  const s = await patchLore($, (s) => {
    const byWorld = { ...(s.reports[world] ?? {}) };
    const byFlow = { ...(byWorld[flow] ?? {}) };
    if (state === "todo") delete byFlow[String(step)];
    else byFlow[String(step)] = { state, note, at };
    byWorld[flow] = byFlow;
    return { reports: { ...s.reports, [world]: byWorld } };
  });
  await $.store.set(STORE_KEY, s.reports);
  return `${flow === "welt" ? "Welt" : "Lore"} „${world}“, step ${step} (${steps[step - 1]!.title}): ${state}.`;
}

/** After Claude wrote to the lore (write, delete, from_campaign), the open tab Welt or Lore reads it again. */
export function registerLore(on: On, options: PluginOptions): void {
  on("tool.call", { tool: `${STUDIO_TOOL_PREFIX}lore` }, async ($, e, next) => {
    const out = await next(e);
    try {
      const input = e as unknown as Record<string, unknown>;
      if (["write", "delete", "from_campaign"].includes(String(input.action))) {
        const tab = await readTab($);
        if (tab === "world" || tab === "lore")
          $.clock.after(0, () => void refreshLore($, options));
      }
    } catch {
      // the pane re-reads on its own reload; the Studio's answer is never held up
    }
    return out;
  }).catch(($, e, next) => next(e));
}

// --- render ----------------------------------------------------------------------------------------------------------

/** „21.11. 14:05“ for an ISO time, else as given. */
function when(updated: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/.exec(updated);
  if (m) return `${m[3]}.${m[2]}.${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
  const n = Number(updated);
  if (Number.isFinite(n) && n > 1e11) {
    const d = new Date(n);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
  }
  return updated;
}

/** The card on top (as the Bau tab's progress card): which world, how much is in it, how fresh. */
function stateCard(
  $: EngineInterface,
  k: Kit,
  options: PluginOptions,
  s: LoreState,
  flow: Flow,
): RenderElement {
  const w = s.worlds?.find((x) => x.world === s.world);
  const counts = s.map ? countsOfMap(s.map) : (w?.counts ?? {});
  const questions = s.map?.questions.length ?? w?.counts.question ?? 0;
  const latest = s.map?.recent[0];
  return Card(k, {
    key: `${flow}-state`,
    title: {
      icon: flow === "welt" ? "globe" : "book",
      title: s.world || "Welt",
      subtitle: w?.campaigns.length
        ? `Kampagnen: ${w.campaigns.join(", ")}`
        : undefined,
    },
    filter:
      (s.worlds?.length ?? 0) > 1
        ? (SelectRow(k, {
            key: `${flow}-world`,
            label: "Welt",
            options: s.worlds!.map((x) => ({ value: x.world, label: x.world })),
            value: s.world,
            onSelect: (v) => void chooseWorld($, options, v),
          }) ?? undefined)
        : undefined,
    children: [
      ListRow(k, {
        key: `${flow}-notes`,
        status: totalOf(s.map, w) ? "ok" : "idle",
        title: "Notizen",
        meta: countsText(counts),
      }),
      ListRow(k, {
        key: `${flow}-questions`,
        status: questions ? "warning" : "ok",
        title: "Offene Fragen",
        meta: questions ? `${questions} offen` : "keine",
      }),
      ...(latest
        ? [
            ListRow(k, {
              key: `${flow}-latest`,
              status: "idle" as const,
              title: "Zuletzt geändert",
              meta: [latest.title, when(latest.updated)].filter(Boolean).join(" · "),
            }),
          ]
        : []),
    ],
  });
}

/** The numbered steps with „x von N“ (as the Bau tab's „Bau-Abschnitte“) and the button for the next step. */
function stepsCard(
  $: EngineInterface,
  k: Kit,
  s: LoreState,
  flow: Flow,
  campaign: string,
): RenderElement {
  const w = s.worlds?.find((x) => x.world === s.world);
  const views = stepViews(flow, s.reports[s.world]?.[flow] ?? {}, s.map, w);
  const done = views.filter((v) => v.state === "done").length;
  const next = views.findIndex((v) => v.state !== "done");
  const empty = !totalOf(s.map, w);
  const actions: RankedAction[] = [];
  if (empty && campaign && s.world)
    actions.push(
      askAction($, k, {
        key: `${flow}-from-campaign`,
        label: "Aus Kampagne übernehmen",
        variant: "primary",
        text: fromCampaignPrompt(campaign, s.world),
      }),
    );
  if (next >= 0 && s.world)
    actions.push(
      askAction($, k, {
        key: `${flow}-step-${next + 1}`,
        label: `Schritt ${next + 1} angehen`,
        variant: actions.length ? "secondary" : "primary",
        text: stepPrompt(flow, s.world, next + 1),
      }),
    );
  return Card(k, {
    key: `${flow}-steps`,
    title: {
      icon: flow === "welt" ? "pin" : "scroll",
      title: flow === "welt" ? "Welt-Abschnitte" : "Lore-Abschnitte",
      count: `${done} von ${views.length}`,
    },
    children: [
      Stepper(k, {
        key: `${flow}-stages`,
        steps: views.map((v, i) => ({
          key: `${flow}-stage-${i + 1}`,
          title: v.title,
          detail: v.detail,
          state: v.state as StepState,
        })),
      }),
    ],
    hint:
      empty && campaign
        ? "Lore aus der Kampagne übernehmen: Orte, NPCs, Kanon und Fäden werden Notizen."
        : undefined,
    actions,
  });
}

function questionsCard(
  $: EngineInterface,
  k: Kit,
  options: PluginOptions,
  s: LoreState,
  flow: Flow,
): RenderElement | null {
  const qs = s.map?.questions ?? [];
  if (!s.map) return null;
  return Card(k, {
    key: `${flow}-open`,
    title: { icon: "flag", title: "Offene Fragen", count: qs.length },
    empty: "Keine offenen Fragen.",
    children: qs.slice(0, 12).map((q, i) =>
      ListRow(k, {
        key: `${flow}-q-${i}`,
        icon: "flag",
        title: q,
        wrap: true,
        actions: [
          {
            key: `${flow}-q-${i}-read`,
            label: "Lesen",
            variant: "link",
            onPress: () => void openNote($, options, q),
          },
        ],
      }),
    ),
  });
}

/** The open note: kind, status, tags, the text, links, backlinks, sources. */
function noteCard($: EngineInterface, k: Kit, s: LoreState): RenderElement | null {
  const n = s.note;
  if (!n) return null;
  const { Text } = k;
  const lines = n.body
    .split("\n")
    .flatMap((l) => (l.trim() ? wrapText(l, Math.max(20, k.cols - 4)) : []))
    .slice(0, 40);
  const row = (key: string, label: string, list: string[]) =>
    list.length
      ? [ListRow(k, { key, title: label, meta: list.join(", "), wrap: true })]
      : [];
  return Card(k, {
    key: "lore-note",
    title: {
      icon: "bookmark",
      title: n.title,
      subtitle: [kindDe(n.kind), n.status, n.updated ? when(n.updated) : ""]
        .filter(Boolean)
        .join(" · "),
    },
    children: [
      ...lines.map((l, i) => (
        <Text key={`lore-note-l${i}`} size={k.graphical ? "body" : undefined}>
          {l}
        </Text>
      )),
      ...row("lore-note-tags", "Tags", n.tags),
      ...row("lore-note-links", "Links", n.links),
      ...row("lore-note-back", "Rückverweise", n.backlinks),
      ...row("lore-note-src", "Quellen", n.sources),
    ],
    actions: [
      {
        key: "lore-note-close",
        label: k.s.close,
        variant: "link",
        onPress: () => void patchLore($, () => ({ note: null })),
      },
    ],
  });
}

/** Browse by kind or search: titles of the chosen kind, or the hits with their snippet. */
function notesCard(
  $: EngineInterface,
  k: Kit,
  options: PluginOptions,
  s: LoreState,
): RenderElement | null {
  if (!s.map) return null;
  const kinds = KINDS.filter((x) => x.id !== "question" && (s.map!.kinds[x.id]?.length ?? 0) > 0);
  const kind = s.kind && kinds.some((x) => x.id === s.kind) ? s.kind : (kinds[0]?.id ?? "");
  const read = (key: string, title: string) => ({
    key,
    label: "Lesen",
    variant: "link" as const,
    onPress: () => void openNote($, options, title),
  });
  const rows = s.hits
    ? s.hits.map((h, i) =>
        ListRow(k, {
          key: `lore-hit-${i}`,
          title: h.title,
          meta: [kindDe(h.kind), h.snippet].filter(Boolean).join(" · "),
          actions: [read(`lore-hit-${i}-read`, h.title)],
        }),
      )
    : (s.map.kinds[kind] ?? []).slice(0, 30).map((n, i) =>
        ListRow(k, {
          key: `lore-n-${kind}-${i}`,
          title: n.title,
          meta: [n.status, ...n.tags].filter(Boolean).join(" · "),
          pill: n.tags.includes("spoiler")
            ? { text: "Spoiler", tone: "warn", glyph: false }
            : undefined,
          actions: [read(`lore-n-${kind}-${i}-read`, n.title)],
        }),
      );
  const { Box } = k;
  return Card(k, {
    key: "lore-notes",
    title: {
      icon: "book",
      title: s.hits ? "Treffer" : "Notizen",
      count: s.hits ? s.hits.length : (s.map.kinds[kind]?.length ?? 0),
    },
    filter: (
      <Box key="lore-filter" flexDirection="column" gap={1} minWidth={0}>
        {SearchField(k, {
          key: "lore-search",
          value: s.query,
          placeholder: "z. B. Kesselheim",
          onSearch: (q) => void search($, options, q),
        })}
        {kinds.length && !s.hits
          ? Segment(k, {
              key: "lore-kind",
              options: kinds.map((x) => ({
                id: x.id,
                label: x.plural,
                count: s.map!.kinds[x.id]?.length ?? 0,
              })),
              active: kind,
              onSelect: (id) => void patchLore($, () => ({ kind: id })),
            })
          : null}
      </Box>
    ),
    empty: s.hits ? "Nichts gefunden." : "Noch keine Notizen.",
    children: rows,
  });
}

function recentCard(k: Kit, s: LoreState): RenderElement | null {
  const r = s.map?.recent ?? [];
  if (!r.length) return null;
  return Card(k, {
    key: "lore-recent",
    title: { icon: "pen", title: "Zuletzt geändert", count: r.length },
    children: r.slice(0, 8).map((x, i) =>
      ListRow(k, {
        key: `lore-r-${i}`,
        title: x.title,
        meta: [kindDe(x.kind), when(x.updated)].filter(Boolean).join(" · "),
      }),
    ),
  });
}

/** No world in the vault yet (or the Studio could not be read before). */
function noWorld(
  $: EngineInterface,
  k: Kit,
  s: LoreState,
  flow: Flow,
  campaign: string,
): RenderElement[] {
  if (s.worlds === null)
    return [
      EmptyState(k, {
        icon: "globe",
        title: "Lore noch nicht gelesen",
        text: s.error ? undefined : "Neu laden liest die Welten aus dem Studio.",
      }),
    ];
  return [
    EmptyState(k, {
      icon: "globe",
      title: "Noch keine Welt",
      text: campaign
        ? `Lore aus der Kampagne „${campaign}“ übernehmen oder eine eigene Welt entwerfen.`
        : "Eine eigene Welt mit Claude entwerfen (Skill pnp-weltenbau).",
      action: campaign
        ? askAction($, k, {
            key: `${flow}-from-campaign`,
            label: "Aus Kampagne übernehmen",
            variant: "primary",
            text: fromCampaignPrompt(campaign, campaign),
          })
        : askAction($, k, {
            key: `${flow}-new-world`,
            label: "Welt entwerfen",
            variant: "primary",
            text: newWorldPrompt(),
          }),
    }),
  ];
}

/** Tab Welt: the world's state, the ten design steps, the open questions, an open note. */
export async function renderWorld(
  $: EngineInterface,
  k: Kit,
  options: PluginOptions,
): Promise<RenderElement[]> {
  const s = await readLore($);
  const campaign = (await readCampaign($))?.name ?? "";
  if (!s.world) return noWorld($, k, s, "welt", campaign);
  return [
    stateCard($, k, options, s, "welt"),
    stepsCard($, k, s, "welt", campaign),
    noteCard($, k, s),
    questionsCard($, k, options, s, "welt"),
  ].filter((x): x is RenderElement => !!x);
}

/** Tab Lore: the world's state, the six keeping steps, browse and search, an open note, questions, recent. */
export async function renderLore(
  $: EngineInterface,
  k: Kit,
  options: PluginOptions,
): Promise<RenderElement[]> {
  const s = await readLore($);
  const campaign = (await readCampaign($))?.name ?? "";
  if (!s.world) return noWorld($, k, s, "lore", campaign);
  return [
    stateCard($, k, options, s, "lore"),
    stepsCard($, k, s, "lore", campaign),
    noteCard($, k, s),
    notesCard($, k, options, s),
    questionsCard($, k, options, s, "lore"),
    recentCard(k, s),
  ].filter((x): x is RenderElement => !!x);
}

/** The pane's status line for these tabs: why the lore could not be read. */
export async function loreStatus($: EngineInterface): Promise<StatusInfo | undefined> {
  const s = await readLore($);
  return s.error ? { text: s.error, tone: "bad" } : undefined;
}
