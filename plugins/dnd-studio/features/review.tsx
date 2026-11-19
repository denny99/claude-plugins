/**
 * Review (Prüfen): new sounds, pictures and videos waiting for a person's verdict. Claude (pnp-klang, pnp-maler or the
 * main thread) fills the queue with the plugin's own tool `review`; the person plays a sound locally, says "passt" or
 * "nochmal machen" with a note, uncovers pictures only on purpose (they may spoil a scene), and sends the result to
 * Claude, which hands every redo with its note to the maker agent.
 */
import type { EngineInterface, RenderElement } from "claude-code";

import { clockTime } from "../lib/model";
import { autoOpen } from "./dnd-ui";
import { personAsk, submitForPerson } from "./evening";
import { createHost } from "../lib/host";
import type { Platform } from "../lib/host";
import { patchReview, readReview } from "../lib/state";
import { studioCall } from "../lib/studio";
import {
  Actions,
  Card,
  EmptyState,
  Field,
  ListRow,
  clearFieldDraft,
  fieldText,
  isAsked,
} from "../lib/ui";
import type { Action, Kit } from "../lib/ui";
import type { ReviewItem, ReviewKind, ReviewState } from "../types";

type Obj = Record<string, unknown>;

export const REVIEW_TOOL = "review";

export const REVIEW_TOOL_DESCRIPTION =
  "The review queue of the D&D pane (tab Abnahme): a person listens to new sounds and looks at new pictures/videos there and says ok or redo (with a note). action add + items puts new things in (each: name = what it is for, spoiler-free, e.g. 'Torknarren'; kind sound|image|video; source = local file path, http(s) URL, or a Studio result's file as the Studio names it (e.g. 'dnd-dland/x.mp3', with or without ' [output]') or its result id: fetched to this computer with results save; refused as not reviewable when no result has the file (uploads, downloaded sounds: give their local path or URL) or it was not made through the Studio's tools; meta = short facts like 'Geräusch · 4 s, Schleife'; agent = who redoes it, pnp-klang for sounds, pnp-maler for pictures; scene = optional, never shown before the person uncovers it). list (default) shows the queue with verdicts; clear empties it. The person's result arrives later as a prompt naming what passed and what to redo with which note.";

function str(v: unknown): string {
  return typeof v === "string"
    ? v
    : v === undefined || v === null
      ? ""
      : String(v);
}

function kindOf(v: unknown): ReviewKind {
  return v === "image" || v === "video" ? v : "sound";
}

function line(i: ReviewItem): string {
  const v =
    i.verdict === "ok"
      ? "passt"
      : i.verdict === "redo"
        ? `nochmal${i.note ? ` (${i.note})` : ""}`
        : "offen";
  return `- [${i.id}] ${i.kind} ${i.name}${i.meta ? ` · ${i.meta}` : ""}: ${v}${i.sent ? " (sent to Claude)" : ""}`;
}

/** The model tool `review`: add, list or clear the queue. */
export async function reviewTool(
  $: EngineInterface,
  input: Obj,
): Promise<string> {
  const action = str(input.action) || "list";
  if (action === "clear") {
    await patchReview($, () => ({ items: [], playing: "" }));
    return "Review queue cleared.";
  }
  if (action === "add") {
    const raw = Array.isArray(input.items) ? input.items : [];
    const now = await $.clock.now();
    const items: ReviewItem[] = raw
      .map((x, n): ReviewItem => {
        const o = (x && typeof x === "object" ? x : {}) as Obj;
        const kind = kindOf(o.kind);
        return {
          id: `r${now.toString(36)}${n}`,
          kind,
          name: str(o.name),
          meta: str(o.meta),
          source: str(o.source),
          agent: str(o.agent) || (kind === "sound" ? "pnp-klang" : "pnp-maler"),
          scene: str(o.scene),
          verdict: "",
          note: "",
          revealed: false,
          addedAt: now,
        };
      })
      .filter((i) => i.name && i.source);
    if (!items.length)
      return "Give items: each with name, kind and source (file path or URL).";
    // a Studio-relative file ("dnd-dland/x.mp3") is not on this computer: fetched now (results save), else refused
    const refused: string[] = [];
    for (const i of items) {
      if (!isStudioPath(i.source)) continue;
      try {
        i.local = await fetchFromStudio($, i);
      } catch (err) {
        refused.push(`${i.name}: ${errLine(err)}`);
      }
    }
    const kept = items.filter((i) => !isStudioPath(i.source) || i.local);
    const why = refused.length
      ? ` Refused (a Studio file or result id that could not be fetched to this computer): ${refused.join("; ")}.`
      : "";
    if (!kept.length) return `Nothing added.${why}`;
    items.splice(0, items.length, ...kept);
    const r = await patchReview($, (s) => ({
      items: [
        ...s.items.filter((o) => !items.some((i) => i.source === o.source)),
        ...items,
      ],
    }));
    await autoOpen($, "build", "review");
    return `${items.length} added; ${r.items.filter((i) => !i.verdict).length} waiting for the person in the D&D pane (tab Abnahme).${why}`;
  }
  const r = await readReview($);
  return r.items.length
    ? r.items.map(line).join("\n")
    : "The review queue is empty.";
}

// --- results Claude makes in this session go into the queue by themselves ---

const SOUND_EXT = /\.(wav|mp3|ogg|flac|m4a|opus)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|mkv)$/i;
const SOUND_KINDS: Record<string, string> = {
  effect: "Geräusch",
  signal: "Signal",
  ambience: "Atmosphäre",
  bgmusic: "Hintergrundmusik",
  music: "Musik",
};

let sessionStart = 0;
/** make_sound jobs of this session: job id → name and meta from the call. */
const madeJobs = new Map<string, { name: string; meta: string }>();

/** session.start: results older than now are not this session's. */
export function startReviewSession(now: number): void {
  sessionStart = now;
  madeJobs.clear();
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function mediaOf(o: Obj): { source: string; kind: ReviewKind } | null {
  for (const v of [o.file, o.path, o.url, o.files]) {
    const f = Array.isArray(v) ? str(v[0]) : str(v);
    if (!f) continue;
    if (SOUND_EXT.test(f)) return { source: f, kind: "sound" };
    if (VIDEO_EXT.test(f)) return { source: f, kind: "video" };
    if (IMAGE_EXT.test(f)) return { source: f, kind: "image" };
  }
  return null;
}

function timeOf(v: unknown): number {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? t : 0;
}

function walk(
  v: unknown,
  visit: (o: Obj, job: string) => void,
  job = "",
): void {
  if (Array.isArray(v)) for (const x of v) walk(x, visit, job);
  else if (v && typeof v === "object") {
    const o = v as Obj;
    visit(o, job);
    const own = Array.isArray(o.results) ? str(o.id ?? o.job_id) : "";
    for (const x of Object.values(o)) walk(x, visit, own || job);
  }
}

function baseName(source: string): string {
  return (source.split(/[\\/]/).pop() ?? source).replace(/\.[^.]+$/, "");
}

/**
 * Observes a finished make_sound / results / jobs call (after `next`, never changing it): a sound make_sound made, or
 * a result of a make_sound job of this session, or a result made through the Studio's tools since this session began,
 * goes into the review queue unless it is there already.
 */
export async function noteMadeResults(
  $: EngineInterface,
  tool: string,
  input: Obj,
  text: string,
): Promise<number> {
  const data = parsed(text);
  if (data === undefined) return 0;
  const fromCall =
    tool === "make_sound"
      ? {
          name: str(input.name) || str(input.idea).slice(0, 40),
          meta: [
            SOUND_KINDS[str(input.kind)] ?? "",
            input.seconds ? `${str(input.seconds)} s` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null;
  const found: {
    source: string;
    kind: ReviewKind;
    name: string;
    meta: string;
    resultId: string;
  }[] = [];
  walk(data, (o, job) => {
    const media = mediaOf(o);
    const id = str(o.id ?? o.job_id);
    if (!media) {
      if (fromCall && id) madeJobs.set(id, fromCall);
      return;
    }
    const known = madeJobs.get(job) ?? madeJobs.get(str(o.job ?? o.job_id));
    const mine =
      fromCall ??
      known ??
      (tool === "results" &&
      sessionStart &&
      timeOf(o.time ?? o.created ?? o.at) >= sessionStart &&
      (o.who || o.prompt || o.viaMcp)
        ? {
            name: str(o.name ?? o.title) || baseName(media.source),
            meta: SOUND_KINDS[str(o.mode)] ?? str(o.mode),
          }
        : null);
    if (mine)
      found.push({
        ...media,
        name: mine.name || baseName(media.source),
        meta: mine.meta,
        resultId: id,
      });
  });
  if (!found.length) return 0;
  const now = await $.clock.now();
  let added = 0;
  await patchReview($, (s) => {
    const fresh = found.filter(
      (f, n) =>
        !s.items.some((i) => i.source === f.source) &&
        found.findIndex((g) => g.source === f.source) === n,
    );
    added = fresh.length;
    return {
      items: [
        ...s.items,
        ...fresh.map((f, n): ReviewItem => ({
          id: `r${now.toString(36)}a${n}`,
          kind: f.kind,
          name: f.name,
          meta: f.meta,
          source: f.source,
          agent: f.kind === "sound" ? "pnp-klang" : "pnp-maler",
          scene: "",
          verdict: "",
          note: "",
          revealed: false,
          addedAt: now,
          ...(f.resultId ? { resultId: f.resultId } : {}),
        })),
      ],
    };
  });
  if (added) await autoOpen($, "build", "review");
  return added;
}

// --- playing and opening locally ---

let player: AsyncIterator<unknown> | null = null;

function isUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

/** The command that plays a sound file on this OS (no shell). */
export function playArgv(platform: Platform, path: string): string[] | null {
  if (platform === "macos") return ["afplay", path];
  if (platform === "linux" || platform === "wsl") return ["paplay", path];
  if (platform === "windows")
    return [
      "powershell",
      "-NoProfile",
      "-Command",
      `(New-Object Media.SoundPlayer '${path.replace(/'/g, "''")}').PlaySync()`,
    ];
  return null;
}

/** The command that opens a file or URL with the system's viewer. */
export function openArgv(platform: Platform, target: string): string[] | null {
  if (platform === "macos") return ["open", target];
  if (platform === "linux") return ["xdg-open", target];
  if (platform === "wsl") return ["wslview", target];
  if (platform === "windows") return ["cmd", "/c", "start", "", target];
  return null;
}

async function resolvePath(
  $: EngineInterface,
  source: string,
): Promise<{ platform: Platform; path: string }> {
  const host = await createHost($);
  return {
    platform: host.platform,
    path: source.replace(/^~(?=\/|\\|$)/, host.home),
  };
}

function errLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split("\n")[0]!;
}

/**
 * A path the Studio names relative to ComfyUI's folders ("dnd-dland/x.mp3", "x.png [output]"): not a file on this
 * computer (ComfyUI may even run on another one), so it is fetched first.
 */
export function isStudioPath(source: string): boolean {
  const s = source.trim();
  return !!s && !isUrl(s) && !/^(~|\/|\\|[A-Za-z]:[\\/])/.test(s);
}

function studioFile(source: string): string {
  return source
    .trim()
    .replace(/\s*\[(input|output|temp)\]$/, "")
    .replace(/\\/g, "/");
}

/** The user's temp folder (TMPDIR, TEMP), for fetched review files. */
async function tempDir($: EngineInterface): Promise<string> {
  const tmp = await $.env.get("TMPDIR").catch(() => undefined);
  const temp = tmp ? undefined : await $.env.get("TEMP").catch(() => undefined);
  return `${(tmp || temp || "/tmp").replace(/[\\/]+$/, "")}/dnd-studio-review`;
}

/** A Studio result id: a full UUID ("bf6c9fe5-74e8-…"), or its first 8+ hex digits. */
const RESULT_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const RESULT_ID_PREFIX = /^[0-9a-f]{8}(?:-[0-9a-f]{0,4}){0,4}$/i;

/** The rows of a results list answer: the Studio answers with a bare JSON array, which answerOf keeps as `{ text }`. */
function resultRows(answer: Obj): Obj[] {
  const rows: Obj[] = [];
  const data =
    typeof answer.text === "string" ? parsed(answer.text) ?? answer : answer;
  walk(data, (o) => {
    if (str(o.id) && (o.file !== undefined || o.kind !== undefined)) rows.push(o);
  });
  return rows;
}

/** The result id a Studio source names: an id itself, else the result whose file it is (results list). */
async function resultIdOf($: EngineInterface, source: string): Promise<string> {
  const s = source.trim();
  if (RESULT_ID.test(s)) return s.toLowerCase();
  if (RESULT_ID_PREFIX.test(s)) {
    const rows = resultRows(
      await studioCall($, "results", { action: "list", limit: 200, brief: true }),
    );
    const hit = rows.find((o) => str(o.id).toLowerCase().startsWith(s.toLowerCase()));
    if (hit) return str(hit.id);
    throw new Error(`no Studio result has the id ${s}`);
  }
  const file = studioFile(s).toLowerCase(); // ComfyUI may run on Windows: no case, no backslashes
  const rows = resultRows(
    await studioCall($, "results", {
      action: "list",
      name: baseName(file),
      limit: 50,
      brief: true,
    }),
  );
  const hit = rows.find((o) => {
    const f = studioFile(str(o.file ?? o.path)).toLowerCase();
    return !!f && (f === file || f.endsWith(`/${file}`) || file.endsWith(`/${f}`));
  });
  if (hit) return str(hit.id);
  throw new Error(
    `not reviewable: ${studioFile(s)} is no Studio result (an upload or a downloaded sound, e.g. Pixabay); the Studio hands out only the files of its results (results save), so give the file's local path or URL instead`,
  );
}

/**
 * Brings a Studio file to this computer: its result (an id given, else found by file name in results list) saved
 * with results save into the user's temp. Resolves the local path; throws why not (no result has the file, not made
 * through the Studio's tools, save failed).
 */
export async function fetchFromStudio(
  $: EngineInterface,
  item: Pick<ReviewItem, "source" | "resultId" | "local">,
): Promise<string> {
  if (item.local) return item.local;
  const id = item.resultId || (await resultIdOf($, item.source));
  const answer = await studioCall($, "results", {
    action: "save",
    ids: [id],
    folder: await tempDir($),
  });
  const saved = Array.isArray(answer.saved) ? (answer.saved as Obj[]) : [];
  const path = str(saved[0]?.file ?? saved[0]?.path);
  if (path) return path;
  const failed = Array.isArray(answer.failed) ? (answer.failed as Obj[]) : [];
  const why =
    str(failed[0]?.error) || str(answer.text) || "results save saved nothing";
  throw new Error(
    /not made through/i.test(why)
      ? `not reviewable: result ${id} was not made through the Studio's tools, so the Studio keeps its file (${why})`
      : why,
  );
}

/**
 * The file to play or open on this computer: a local path or URL as it is, a Studio path fetched first (kept on the
 * item). Undefined after a failed fetch, whose reason the card then shows.
 */
async function localSource(
  $: EngineInterface,
  item: ReviewItem,
): Promise<string | undefined> {
  if (!isStudioPath(item.source)) return item.source;
  try {
    const local = await fetchFromStudio($, item);
    if (local !== item.local) await patchItem($, item.id, { local });
    return local;
  } catch (err) {
    const error = `Nicht vom Studio geholt: ${errLine(err)}`;
    await patchItem($, item.id, { error });
    $.ui.toast(`✗ ${error}`);
    return undefined;
  }
}

export async function stopPlaying($: EngineInterface): Promise<void> {
  const p = player;
  player = null;
  try {
    await p?.return?.();
  } catch {
    // already ended
  }
  await patchReview($, () => ({ playing: "" }));
}

/** Plays a sound locally (afplay & co.); a URL opens in the browser; a Studio path is fetched first. One at a time. */
export async function playItem(
  $: EngineInterface,
  item: ReviewItem,
): Promise<void> {
  await stopPlaying($);
  const source = await localSource($, item);
  if (source === undefined) return;
  const { platform, path } = await resolvePath($, source);
  const argv = isUrl(path)
    ? openArgv(platform, path)
    : playArgv(platform, path);
  if (!argv) {
    await patchItem($, item.id, { error: `Kann hier nicht abspielen: ${source}` });
    return;
  }
  await patchItem($, item.id, { heard: true, error: "" });
  if (isUrl(path)) {
    void $.process.run(argv, {} as never).catch((err: unknown) =>
      patchItem($, item.id, { error: `Öffnen fehlgeschlagen: ${errLine(err)}` }),
    );
    return;
  }
  const it = $.process.spawn({ argv })[Symbol.asyncIterator]();
  player = it;
  await patchReview($, () => ({ playing: item.id }));
  void (async () => {
    try {
      while (player === it && !(await it.next()).done) {
        // drain the child's output until it ends
      }
    } catch (err) {
      await patchItem($, item.id, { error: `Abspielen fehlgeschlagen: ${errLine(err)}` });
    }
    if (player === it) {
      player = null;
      await patchReview($, () => ({ playing: "" }));
    }
  })();
}

/** Opens an uncovered picture or video with the system viewer; a Studio path is fetched first. */
export async function openItem(
  $: EngineInterface,
  item: ReviewItem,
): Promise<void> {
  const source = await localSource($, item);
  if (source === undefined) return;
  const { platform, path } = await resolvePath($, source);
  const argv = openArgv(platform, path);
  if (!argv) {
    await patchItem($, item.id, { error: `Kann hier nicht öffnen: ${source}` });
    return;
  }
  await patchItem($, item.id, { heard: true, error: "" });
  void $.process.run(argv, {} as never).catch((err: unknown) =>
    patchItem($, item.id, { error: `Öffnen fehlgeschlagen: ${errLine(err)}` }),
  );
}

async function patchItem(
  $: EngineInterface,
  id: string,
  patch: Partial<ReviewItem>,
): Promise<void> {
  await patchReview($, (s) => ({
    items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  }));
}

/** The prompt „An Claude schicken“ sends: what passed, what to redo with which note, and who redoes it. */
export function resultPrompt(items: ReviewItem[]): string {
  const ok = items.filter((i) => i.verdict === "ok");
  const redo = items.filter((i) => i.verdict === "redo");
  const parts = ["Prüfergebnis aus dem D&D-Panel (Tab Abnahme):"];
  if (ok.length)
    parts.push(
      `Passt: ${ok.map((i) => `${i.name} (${i.source})`).join("; ")}.`,
    );
  if (redo.length) {
    parts.push("Nochmal machen:");
    for (const i of redo)
      parts.push(
        `- ${i.name} (${i.kind}, ${i.source}) → ${i.agent}${i.note ? `; Notiz: „${i.note}“` : "; ohne Notiz"}`,
      );
    const agents = [...new Set(redo.map((i) => i.agent))];
    parts.push(
      `Starte dafür ${agents.join(" und ")} mit diesen Notizen und lege die neuen Fassungen danach wieder mit dem Tool review (action add) in die Prüfliste.`,
    );
  }
  return parts.join("\n");
}

/** The judged items not sent yet: what „An Claude schicken“ sends (never one twice). */
export function unsent(items: ReviewItem[]): ReviewItem[] {
  return items.filter((i) => i.verdict && !i.sent);
}

/**
 * Producer of „An Claude schicken“ (runs inside the kit's `askClaude`, after its lock is taken): marks the judged
 * items sent and returns the prompt; nothing judged → a toast and `undefined` (nothing is sent, the lock is freed).
 * A note typed but not confirmed goes along.
 */
export async function takeResult(
  $: EngineInterface,
  at?: number,
): Promise<string | undefined> {
  const now = at ?? (await $.clock.now());
  let judged: ReviewItem[] = [];
  await patchReview($, (s) => {
    const ids = new Set(unsent(s.items).map((i) => i.id));
    const items = s.items.map((i): ReviewItem => {
      if (!ids.has(i.id)) return i;
      // a note typed but not kept with „Merken“ goes along (the kit holds the field's text)
      return {
        ...i,
        note:
          i.verdict === "redo"
            ? fieldText(noteKey(i.id), i.note).trim()
            : i.note,
        sent: true,
        sentAt: now,
      };
    });
    judged = items.filter((i) => ids.has(i.id));
    return { items, sentAt: now };
  });
  if (!judged.length) {
    $.ui.toast("Noch nichts beurteilt.");
    return undefined;
  }
  for (const i of judged) clearFieldDraft(noteKey(i.id));
  return resultPrompt(judged);
}

/** „An Claude schicken“: the judged items once (kit `askClaude`, key `rv-send`); not delivered → open again. */
export async function sendResult($: EngineInterface): Promise<void> {
  let at = 0;
  const result = await submitForPerson($, {
    key: "rv-send",
    text: async () => {
      at = await $.clock.now();
      return takeResult($, at);
    },
  });
  if (result === "failed" && at) await unsend($, at);
}

/** Puts items marked sent at `at` back to open (the prompt did not go out): nothing is lost. */
async function unsend($: EngineInterface, at: number): Promise<void> {
  await patchReview($, (s) => ({
    items: s.items.map((i) =>
      i.sent && i.sentAt === at ? { ...i, sent: false, sentAt: undefined } : i,
    ),
  }));
}

export function openCount(r: ReviewState): number {
  return r.items.filter((i) => !i.verdict).length;
}

/** Key of the note field of an item (the kit keeps what is typed there until „Merken“ or the send). */
function noteKey(id: string): string {
  return `rv-note-${id}`;
}

/** An item is waiting for its first look or listen (covered pictures included). */
function isUnseen(i: ReviewItem): boolean {
  return !i.sent && !i.heard;
}

function itemRow(
  $: EngineInterface,
  k: Kit,
  i: ReviewItem,
  playing: boolean,
): RenderElement {
  const covered = i.kind !== "sound" && !i.revealed;
  const kindText =
    i.kind === "sound" ? "Klang" : i.kind === "image" ? "Bild" : "Video";
  if (i.sent) {
    // done: a quiet row with its verdict; it stays until Claude adds the new version (same source replaces it)
    const when = i.sentAt ? `geschickt ${clockTime(i.sentAt)}` : "geschickt";
    return ListRow(k, {
      key: `rv-${i.id}`,
      status: "ok",
      title: covered ? `${kindText} (verdeckt)` : i.name,
      meta:
        i.verdict === "redo"
          ? `${i.note ? `„${i.note}“` : "ohne Notiz"} · ${when}`
          : when,
      pill:
        i.verdict === "redo"
          ? { text: "nochmal", tone: "warn" }
          : { text: "passt", tone: "ok" },
    });
  }
  const pill =
    i.verdict === "ok"
      ? { text: "passt", tone: "ok" as const }
      : i.verdict === "redo"
        ? { text: "nochmal", tone: "bad" as const }
        : undefined;
  const acts: Action[] = [];
  if (covered)
    acts.push({
      key: `rv-reveal-${i.id}`,
      label: "Aufdecken",
      variant: "secondary",
      onPress: () => void patchItem($, i.id, { revealed: true }),
    });
  else if (i.kind === "sound")
    acts.push({
      key: `rv-play-${i.id}`,
      label: playing ? "Stoppen" : "Abspielen",
      variant: "secondary",
      onPress: () => void (playing ? stopPlaying($) : playItem($, i)),
    });
  else
    acts.push({
      key: `rv-open-${i.id}`,
      label: "Ansehen",
      variant: "link",
      onPress: () => void openItem($, i),
    });
  // a verdict only on what was heard or seen
  const judged = !covered && !!i.heard;
  if (judged)
    acts.push({
      key: `rv-ok-${i.id}`,
      label: "Passt",
      variant: "secondary",
      onPress: () =>
        void patchItem($, i.id, { verdict: i.verdict === "ok" ? "" : "ok" }),
    });
  // `i.error` (playing or opening failed) stands in the pane's fixed status line, see hooks/register.tsx
  return ListRow(k, {
    key: `rv-${i.id}`,
    icon:
      i.kind === "sound" ? "speaker" : i.kind === "image" ? "camera" : "play",
    title: covered ? `${kindText} · Szene verdeckt, könnte spoilern` : i.name,
    meta: covered ? "" : i.meta,
    pill,
    actions: acts,
    // the redo with its note is the rarer verdict: behind „Details“, so the row keeps two short actions
    ...(judged
      ? {
          details: () => [
            Field(k, {
              key: noteKey(i.id),
              label: "Notiz",
              value: i.note,
              placeholder:
                i.kind === "sound" ? "z. B. leiser, dumpfer" : "z. B. heller, mehr Nebel",
              submitLabel: "Merken",
              // a kept note means "redo": nobody notes what passes
              onSubmit: (v: string) =>
                void patchItem($, i.id, { note: v.trim(), verdict: "redo" }),
            }),
            Actions(
              k,
              `rv-redo-acts-${i.id}`,
              [
                {
                  key: `rv-redo-${i.id}`,
                  label: "Nochmal",
                  variant: "secondary",
                  onPress: () =>
                    void patchItem($, i.id, {
                      verdict: i.verdict === "redo" ? "" : "redo",
                    }),
                },
              ],
              1,
            ),
          ],
        }
      : {}),
  });
}

export function renderReview(
  $: EngineInterface,
  k: Kit,
  r: ReviewState,
): RenderElement[] {
  if (!r.items.length)
    return [
      EmptyState(k, {
        icon: "speaker",
        title: "Nichts abzunehmen",
        text: "Neue Klänge und Bilder vom Klang-Macher und vom Maler landen hier, sobald Claude sie zur Abnahme ablegt.",
      }),
    ];
  const done = r.items.filter((i) => i.verdict).length;
  const toSend = unsent(r.items).length;
  const sounds = r.items.filter((i) => i.kind === "sound");
  const pictures = r.items.filter((i) => i.kind !== "sound");
  const out: RenderElement[] = [];
  if (sounds.length)
    out.push(
      Card(k, {
        key: "rv-sounds",
        title: { icon: "speaker", title: "Neue Klänge", count: sounds.length },
        children: sounds.map((i) => itemRow($, k, i, r.playing === i.id)),
        hint: sounds.some(isUnseen)
          ? "Erst anhören, dann urteilen."
          : "Spoilerfrei: du hörst nur, wofür der Klang ist, nicht in welcher Szene.",
      }),
    );
  if (pictures.length)
    out.push(
      Card(k, {
        key: "rv-pictures",
        title: {
          icon: "camera",
          title: "Neue Bilder und Videos",
          count: pictures.length,
        },
        children: pictures.map((i) => itemRow($, k, i, false)),
        hint: pictures.some(isUnseen)
          ? "Erst ansehen, dann urteilen."
          : undefined,
      }),
    );
  // The one card the tab is for: how far the review is, and its result to Claude. The kit's ask button shows
  // „geschickt“ until Claude answered; else it stands only while something judged is not sent yet (nothing goes twice).
  const asked = isAsked(k.asked, "rv-send");
  const open = r.items.length - done;
  const send = personAsk(
    $,
    k,
    {
      key: "rv-send",
      label: "An Claude schicken",
      icon: "claude",
      variant: "primary",
      text: () => takeResult($),
    },
    { fresh: true },
  );
  out.push(
    Card(k, {
      key: "rv-result",
      title: {
        icon: "check",
        title: "Prüfung",
        count: `${done} von ${r.items.length}`,
      },
      hint: "Was nochmal soll, geht mit seiner Notiz an den Klang-Macher oder den Maler.",
      status: toSend
        ? `${toSend} beurteilt, noch nicht geschickt`
        : !asked && !open
          ? {
              text: `Alles an Claude geschickt${r.sentAt ? ` (${clockTime(r.sentAt)})` : ""}.`,
              tone: "ok",
            }
          : open
            ? `${open} offen`
            : null,
      // a prompt that did not go out puts its items back to open
      actions:
        toSend || asked
          ? [{ ...send, onPress: asked ? send.onPress : () => void sendResult($) }]
          : undefined,
    }),
  );
  return out;
}
