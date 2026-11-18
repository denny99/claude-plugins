/**
 * Review (Prüfen): new sounds, pictures and videos waiting for a person's verdict. Claude (pnp-klang, pnp-maler or the
 * main thread) fills the queue with the plugin's own tool `review`; the person plays a sound locally, says "passt" or
 * "nochmal machen" with a note, uncovers pictures only on purpose (they may spoil a scene), and sends the result to
 * Claude, which hands every redo with its note to the maker agent.
 */
import type { EngineInterface, RenderElement } from "claude-code";

import { autoOpen } from "./dnd-ui";
import { submitForPerson } from "./evening";
import { createHost } from "../lib/host";
import type { Platform } from "../lib/host";
import { patchReview, readReview } from "../lib/state";
import {
  Actions,
  Card,
  CardTitle,
  EmptyState,
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
  "The review queue of the D&D pane (tab Prüfen): a person listens to new sounds and looks at new pictures/videos there and says ok or redo (with a note). action add + items puts new things in (each: name = what it is for, spoiler-free, e.g. 'Torknarren'; kind sound|image|video; source = local file path or http(s) URL from the Studio's results; meta = short facts like 'Geräusch · 4 s, Schleife'; agent = who redoes it, pnp-klang for sounds, pnp-maler for pictures; scene = optional, never shown before the person uncovers it). list (default) shows the queue with verdicts; clear empties it. The person's result arrives later as a prompt naming what passed and what to redo with which note.";

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
    const r = await patchReview($, (s) => ({
      items: [
        ...s.items.filter((o) => !items.some((i) => i.source === o.source)),
        ...items,
      ],
    }));
    await autoOpen($, "build", "review");
    return `${items.length} added; ${r.items.filter((i) => !i.verdict).length} waiting for the person in the D&D pane (tab Prüfen).`;
  }
  const r = await readReview($);
  return r.items.length
    ? r.items.map(line).join("\n")
    : "The review queue is empty.";
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

/** Plays a sound locally (afplay & co.); a URL opens in the browser. One at a time. */
export async function playItem(
  $: EngineInterface,
  item: ReviewItem,
): Promise<void> {
  await stopPlaying($);
  const { platform, path } = await resolvePath($, item.source);
  const argv = isUrl(path)
    ? openArgv(platform, path)
    : playArgv(platform, path);
  if (!argv) {
    $.ui.toast(`Kann hier nicht abspielen: ${item.source}`);
    return;
  }
  if (isUrl(path)) {
    void $.process.run(argv, {} as never).catch(() => undefined);
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
      $.ui.toast(`✗ Abspielen: ${String(err).split("\n")[0]}`);
    }
    if (player === it) {
      player = null;
      await patchReview($, () => ({ playing: "" }));
    }
  })();
}

/** Opens an uncovered picture or video with the system viewer. */
export async function openItem(
  $: EngineInterface,
  item: ReviewItem,
): Promise<void> {
  const { platform, path } = await resolvePath($, item.source);
  const argv = openArgv(platform, path);
  if (!argv) {
    $.ui.toast(`Kann hier nicht öffnen: ${item.source}`);
    return;
  }
  void $.process.run(argv, {} as never).catch(() => undefined);
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
  const judged = r.items.filter((i) => i.verdict);
  if (!judged.length) {
    $.ui.toast("Noch nichts beurteilt.");
    return;
  }
  await submitForPerson($, resultPrompt(judged));
  const now = await $.clock.now();
  await patchReview($, (s) => ({
    items: s.items.filter((i) => !i.verdict),
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
  if (!covered) {
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
  if (i.verdict === "redo")
    out.push(
      i.note
        ? Sentence(k, `Notiz: „${i.note}“ → ${i.agent}`, { faint: true })
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
        text: "Neue Klänge und Bilder landen hier, sobald Claude sie zum Prüfen ablegt (pnp-klang, pnp-maler).",
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
      "„Nochmal machen“ geht mit deiner Notiz direkt an den Klang-Macher (Bilder an den Maler).",
      { faint: true },
    ),
  );
  return out;
}
