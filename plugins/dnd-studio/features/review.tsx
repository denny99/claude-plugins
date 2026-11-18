/**
 * Review (Prüfen): new sounds, pictures and videos waiting for a person's verdict. Claude (pnp-klang, pnp-maler or the
 * main thread) fills the queue with the plugin's own tool `review`; the person plays a sound locally, says "passt" or
 * "nochmal machen" with a note, uncovers pictures only on purpose (they may spoil a scene), and sends the result to
 * Claude, which hands every redo with its note to the maker agent.
 */
import type { EngineInterface, RenderElement } from "claude-code";

import { agentLabel } from "../lib/model";
import { autoOpen } from "./dnd-ui";
import { submitForPerson } from "./evening";
import { createHost } from "../lib/host";
import type { Platform } from "../lib/host";
import { patchReview, readReview } from "../lib/state";
import { studioCall } from "../lib/studio";
import {
  Actions,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  ListRow,
  ProgressBlock,
  Sentence,
} from "../lib/ui";
import type { Action, Kit } from "../lib/ui";
import type { ReviewItem, ReviewKind, ReviewState } from "../types";

type Obj = Record<string, unknown>;
type InputEl = (props: Record<string, unknown>) => RenderElement;

export const REVIEW_TOOL = "review";

export const REVIEW_TOOL_DESCRIPTION =
  "The review queue of the D&D pane (tab Prüfen): a person listens to new sounds and looks at new pictures/videos there and says ok or redo (with a note). action add + items puts new things in (each: name = what it is for, spoiler-free, e.g. 'Torknarren'; kind sound|image|video; source = local file path, http(s) URL, or a Studio result's file as the Studio names it (e.g. 'dnd-dland/x.mp3': fetched to this computer with results save, refused when that fails); meta = short facts like 'Geräusch · 4 s, Schleife'; agent = who redoes it, pnp-klang for sounds, pnp-maler for pictures; scene = optional, never shown before the person uncovers it). list (default) shows the queue with verdicts; clear empties it. The person's result arrives later as a prompt naming what passed and what to redo with which note.";

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
  return `- [${i.id}] ${i.kind} ${i.name}${i.meta ? ` · ${i.meta}` : ""}: ${v}`;
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
      ? ` Refused (a Studio path, but its file could not be fetched to this computer; give a local path, or a result made through the Studio's tools): ${refused.join("; ")}.`
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
    return `${items.length} added; ${r.items.filter((i) => !i.verdict).length} waiting for the person in the D&D pane (tab Prüfen).${why}`;
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

/**
 * Brings a Studio file to this computer: its result (by id, else found by file name in results list) saved with
 * results save into the user's temp. Resolves the local path; throws why not (not a result made through the Studio's
 * tools, no such result, save failed).
 */
export async function fetchFromStudio(
  $: EngineInterface,
  item: Pick<ReviewItem, "source" | "resultId" | "local">,
): Promise<string> {
  if (item.local) return item.local;
  const file = studioFile(item.source);
  let id = item.resultId ?? "";
  if (!id) {
    const list = await studioCall($, "results", {
      action: "list",
      name: baseName(file),
      limit: 20,
      brief: true,
    });
    walk(list, (o) => {
      const f = studioFile(str(o.file ?? o.path));
      if (!id && str(o.id) && f && (f === file || f.endsWith(`/${file}`)))
        id = str(o.id);
    });
    if (!id) throw new Error(`no Studio result has the file ${file}`);
  }
  const answer = await studioCall($, "results", {
    action: "save",
    ids: [id],
    folder: await tempDir($),
  });
  const saved = Array.isArray(answer.saved) ? (answer.saved as Obj[]) : [];
  const path = str(saved[0]?.path ?? saved[0]?.file);
  if (path) return path;
  const failed = Array.isArray(answer.failed) ? (answer.failed as Obj[]) : [];
  throw new Error(
    str(failed[0]?.error) || str(answer.text) || "results save saved nothing",
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

/** The prompt "Ergebnis an Claude" sends: what passed, what to redo with which note, and who redoes it. */
export function resultPrompt(items: ReviewItem[]): string {
  const ok = items.filter((i) => i.verdict === "ok");
  const redo = items.filter((i) => i.verdict === "redo");
  const parts = ["Prüfergebnis aus dem D&D-Panel (Tab Prüfen):"];
  if (ok.length)
    parts.push(
      `Passt: ${ok.map((i) => `${i.name} (${i.source})`).join("; ")}.`,
    );
  if (redo.length) {
    parts.push("Nochmal machen:");
    for (const i of redo)
      parts.push(
        `- ${i.name} (${i.kind}, ${i.source}) → ${i.agent}${i.note ? `; Notiz: „${i.note}“` : ""}`,
      );
    const agents = [...new Set(redo.map((i) => i.agent))];
    parts.push(
      `Starte dafür ${agents.join(" und ")} mit diesen Notizen und lege die neuen Fassungen danach wieder mit dem Tool review (action add) in die Prüfliste.`,
    );
  }
  return parts.join("\n");
}

export async function sendResult($: EngineInterface): Promise<void> {
  const r = await readReview($);
  const judged = r.items.filter((i) => i.verdict && !i.sent);
  if (!judged.length) {
    $.ui.toast("Noch nichts beurteilt.");
    return;
  }
  await submitForPerson($, resultPrompt(judged));
  const now = await $.clock.now();
  await patchReview($, (s) => ({
    // Sent items stay in the list, greyed as "erledigt", until Claude adds the new version (same source replaces it).
    items: s.items.map((i) => (i.verdict && !i.sent ? { ...i, sent: true } : i)),
    sentAt: now,
  }));
}

export function openCount(r: ReviewState): number {
  return r.items.filter((i) => !i.verdict).length;
}

function itemRow(
  $: EngineInterface,
  k: Kit,
  Input: InputEl,
  i: ReviewItem,
  playing: boolean,
): RenderElement[] {
  if (i.sent)
    return [
      ListRow(k, {
        key: `rv-${i.id}`,
        icon:
          i.kind === "sound" ? "speaker" : i.kind === "image" ? "camera" : "play",
        tone: "neutral",
        title:
          i.kind !== "sound" && !i.revealed
            ? `${i.kind === "image" ? "Bild" : "Video"} (verdeckt)`
            : i.name,
        meta: i.verdict === "redo" ? "an Claude: nochmal" : "an Claude: passt",
        pill: { text: "erledigt", tone: "neutral", glyph: "✓" },
      }),
    ];
  const covered = i.kind !== "sound" && !i.revealed;
  const kindText =
    i.kind === "sound" ? "Klang" : i.kind === "image" ? "Bild" : "Video";
  const title = covered
    ? `${kindText} · Szene verdeckt, könnte spoilern`
    : i.name;
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
      icon: "eye",
      variant: "secondary",
      onPress: () => void patchItem($, i.id, { revealed: true }),
    });
  else if (i.kind === "sound")
    acts.push({
      key: `rv-play-${i.id}`,
      label: playing ? "Stopp" : "Abspielen",
      icon: playing ? "stop" : "play",
      variant: "secondary",
      onPress: () => void (playing ? stopPlaying($) : playItem($, i)),
    });
  else
    acts.push({
      key: `rv-open-${i.id}`,
      label: "Ansehen",
      icon: "external",
      variant: "secondary",
      onPress: () => void openItem($, i),
    });
  if (!covered && i.heard) {
    acts.push({
      key: `rv-ok-${i.id}`,
      label: "Passt",
      icon: "check",
      variant: "secondary",
      onPress: () =>
        void patchItem($, i.id, { verdict: i.verdict === "ok" ? "" : "ok" }),
    });
    acts.push({
      key: `rv-redo-${i.id}`,
      label: "Nochmal machen",
      icon: "x",
      variant: "secondary",
      onPress: () =>
        void patchItem($, i.id, {
          verdict: i.verdict === "redo" ? "" : "redo",
        }),
    });
  }
  const out: RenderElement[] = [
    ListRow(k, {
      key: `rv-${i.id}`,
      icon:
        i.kind === "sound" ? "speaker" : i.kind === "image" ? "camera" : "play",
      title,
      meta: covered ? "" : i.meta,
      pill,
    }),
    Actions(k, `rv-acts-${i.id}`, acts, 3) as RenderElement,
  ];
  if (i.error)
    out.push(
      ErrorState(k, {
        key: `rv-err-${i.id}`,
        message: i.error,
        onRetry: () =>
          void (i.kind === "sound" ? playItem($, i) : openItem($, i)),
      }),
    );
  else if (!covered && !i.heard)
    out.push(
      Sentence(
        k,
        i.kind === "sound"
          ? "Erst anhören, dann urteilen."
          : "Erst ansehen, dann urteilen.",
        { faint: true },
      ),
    );
  if (i.verdict === "redo")
    out.push(
      i.note
        ? Sentence(k, `Notiz: „${i.note}“ → ${agentLabel(i.agent)}`, { faint: true })
        : Input({
            key: `rv-note-${i.id}`,
            placeholder: "Was soll anders werden?",
            submitLabel: "Notiz",
            onSubmit: (v: string) =>
              void patchItem($, i.id, { note: v.trim() }),
          }),
    );
  return out;
}

export function renderReview(
  $: EngineInterface,
  k: Kit,
  Input: InputEl,
  r: ReviewState,
): RenderElement[] {
  if (!r.items.length)
    return [
      EmptyState(k, {
        icon: "speaker",
        title: "Nichts zu prüfen",
        text: "Neue Klänge und Bilder vom Klang-Macher und vom Maler landen hier, sobald Claude sie zum Prüfen ablegt.",
      }),
    ];
  const done = r.items.filter((i) => i.verdict).length;
  const sounds = r.items.filter((i) => i.kind === "sound");
  const pictures = r.items.filter((i) => i.kind !== "sound");
  const out: RenderElement[] = [];
  out.push(
    ProgressBlock(k, {
      key: "rv-progress",
      label: "Geprüft",
      value: done,
      max: r.items.length,
      valueText: `${done} von ${r.items.length}`,
      tone: done === r.items.length ? "ok" : "warn",
    }),
  );
  if (sounds.length)
    out.push(
      Card(k, {
        key: "rv-sounds",
        children: [
          CardTitle(k, {
            icon: "speaker",
            title: "Neue Klänge prüfen",
            count: `${sounds.filter((i) => i.verdict).length} von ${sounds.length}`,
          }),
          Sentence(
            k,
            "Spoilerfrei: du hörst nur, wofür der Klang ist, nicht in welcher Szene.",
            { faint: true },
          ),
          ...sounds.flatMap((i) => itemRow($, k, Input, i, r.playing === i.id)),
        ],
      }),
    );
  if (pictures.length)
    out.push(
      Card(k, {
        key: "rv-pictures",
        children: [
          CardTitle(k, {
            icon: "camera",
            title: "Neue Bilder und Videos",
            count: `${pictures.filter((i) => i.verdict).length} von ${pictures.length}`,
          }),
          ...pictures.flatMap((i) => itemRow($, k, Input, i, false)),
        ],
      }),
    );
  out.push(
    Actions(
      k,
      "rv-send-acts",
      [
        {
          key: "rv-send",
          label: "Ergebnis an Claude",
          icon: "claude",
          variant: "primary",
          onPress: () => void sendResult($),
        },
      ],
      1,
    ) as RenderElement,
  );
  out.push(
    Sentence(
      k,
      "„Nochmal machen“ geht mit deiner Notiz nach „Ergebnis an Claude“ an den Klang-Macher (Bilder an den Maler).",
      { faint: true },
    ),
  );
  return out;
}
