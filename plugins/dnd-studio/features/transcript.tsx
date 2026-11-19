/**
 * Cards in the transcript (the game master's place; the players see their own window): a roll's answer as a card at
 * `roll_dice`'s result row (on desktop under the app's ToolUse row), and the review actions under a reviewed picture that `results get` shows. The pane keeps
 * the lasting state (the evening's dice, the review list).
 *
 * Nothing here sends anything to the players' window or Discord: the roll card only reads the answer, the picture
 * card only changes the review verdict. A hidden roll stays covered while spoiler-safe is on, as in the pane.
 */
import type {
  EngineInterface,
  On,
  RenderElement,
  RenderInput,
} from "claude-code";

import { verdictDe } from "../lib/model";
import { patchReview, readReview, readRules } from "../lib/state";
import {
  Card,
  kit,
  ListRow,
  Sentence,
  type Action,
  type Kit,
  type PillProps,
} from "../lib/ui";
import type { ReviewItem } from "../types";

const PREFIX = "mcp__plugin_dnd-studio_dnd-studio__";
export const ROLL_TOOL = `${PREFIX}roll_dice`;
export const RESULTS_TOOL = `${PREFIX}results`;

type Obj = Record<string, unknown>;

/** The text of a tool's stored result: a string, or the text blocks of MCP content. */
export function outputText(output: unknown): string {
  if (typeof output === "string") return output;
  const blocks = Array.isArray(output)
    ? output
    : output &&
        typeof output === "object" &&
        Array.isArray((output as Obj).content)
      ? ((output as Obj).content as unknown[])
      : [];
  return blocks
    .map((b) =>
      b && typeof b === "object" && (b as Obj).type === "text"
        ? String((b as Obj).text ?? "")
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

function jsonOf(text: string): Obj | undefined {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Obj)
      : undefined;
  } catch {
    return undefined;
  }
}

export type RollLine = {
  who: string;
  label: string;
  total: string;
  verdict: string;
  face: string;
  hidden: boolean;
};

/** The rolls of one `roll_dice` answer (`rolls: [...]` or one roll on top); none when it is not readable. */
export function rollsOfAnswer(text: string): RollLine[] {
  const json = jsonOf(text);
  if (!json) return [];
  const list = Array.isArray(json.rolls) ? (json.rolls as unknown[]) : [json];
  const s = (v: unknown): string =>
    v === undefined || v === null ? "" : String(v);
  return list
    .filter((r): r is Obj => !!r && typeof r === "object")
    .filter((r) => r.total !== undefined)
    .map((r) => ({
      who: s(r.who),
      label: s(r.label),
      total: s(r.total),
      verdict: verdictDe(s(r.verdict)),
      face: s(r.face),
      hidden:
        r.hidden === true ||
        (typeof r.whisper === "string" && r.whisper !== ""),
    }));
}

/** The roll card (exported for tests): one row per roll; a hidden one shows no number while spoiler-safe is on. */
export function rollCard(
  k: Kit,
  rolls: RollLine[],
  spoilerSafe: boolean,
  tag: string,
): RenderElement {
  const covered = (r: RollLine): boolean => r.hidden && spoilerSafe;
  const one = rolls.length === 1 ? rolls[0] : undefined;
  const pill: PillProps | undefined =
    one && !covered(one)
      ? { text: one.verdict || one.total, tone: "neutral" }
      : undefined;
  return Card(k, {
    key: `roll-card-${tag}`,
    title: {
      icon: "dice",
      title: rolls.length > 1 ? "Würfe" : "Wurf",
      ...(pill
        ? { pill }
        : { count: rolls.length > 1 ? rolls.length : undefined }),
    },
    children: rolls.map((r, i) =>
      ListRow(k, {
        key: `roll-${tag}-${i}`,
        title: [r.who || "Wurf", r.label].filter(Boolean).join(" · "),
        meta: covered(r)
          ? "verdeckter Wurf"
          : [r.total, r.verdict, r.face, r.hidden ? "verdeckt" : ""]
              .filter(Boolean)
              .join(" · "),
      }),
    ),
  });
}

/** Review items a `results get` answer shows (by the Studio's result id), not yet sent to Claude. */
export function reviewedIn(text: string, items: ReviewItem[]): ReviewItem[] {
  return items.filter(
    (i) =>
      !i.sent &&
      i.kind === "image" &&
      !!i.resultId &&
      text.includes(i.resultId),
  );
}

async function judge(
  $: EngineInterface,
  id: string,
  verdict: "ok" | "redo",
): Promise<void> {
  // seen here: it counts as looked at (heard) and uncovered, as „Ansehen“ in the pane would
  await patchReview($, (s) => ({
    items: s.items.map((i) =>
      i.id === id
        ? {
            ...i,
            heard: true,
            revealed: true,
            verdict: i.verdict === verdict ? "" : verdict,
          }
        : i,
    ),
  }));
}

/** The verdict card under a reviewed picture (exported for tests): „Passt“ main, „Nochmal“ beside it. */
export function pictureCard(
  $: EngineInterface,
  k: Kit,
  items: ReviewItem[],
): RenderElement {
  const one = items.length === 1;
  return Card(k, {
    key: `pic-card-${items.map((i) => i.id).join("-")}`,
    title: {
      icon: "camera",
      title: one ? items[0]!.name : "Zur Abnahme",
      ...(one ? {} : { count: items.length }),
    },
    children: one
      ? [
          Sentence(
            k,
            items[0]!.verdict === "ok"
              ? "Als passend markiert."
              : items[0]!.verdict === "redo"
                ? "Zum Nachmachen markiert."
                : "Steht in der Abnahme.",
            { faint: true },
          ),
        ]
      : items.map((i) =>
          ListRow(k, {
            key: `pic-${i.id}`,
            title: i.name,
            pill:
              i.verdict === "ok"
                ? { text: "passt", tone: "ok" }
                : i.verdict === "redo"
                  ? { text: "nochmal", tone: "warn" }
                  : undefined,
            actions: verdictActions($, i),
          }),
        ),
    actions: one ? verdictActions($, items[0]!) : [],
  });
}

function verdictActions($: EngineInterface, i: ReviewItem): Action[] {
  return [
    {
      key: `pic-ok-${i.id}`,
      label: "Passt",
      variant: i.verdict === "ok" ? "secondary" : "primary",
      onPress: () => void judge($, i.id, "ok"),
    },
    {
      key: `pic-redo-${i.id}`,
      label: "Nochmal",
      variant: "secondary",
      onPress: () => void judge($, i.id, "redo"),
    },
  ];
}

type CardInput = RenderInput<"ToolResult"> | RenderInput<"ToolUse">;

/** The roll card of a call (shared by the ToolResult and the ToolUse hook); undefined when the answer has no roll. */
async function rollCardOf(
  $: EngineInterface,
  e: CardInput,
): Promise<RenderElement | undefined> {
  const p = e.props;
  const rolls = rollsOfAnswer(outputText(p.output));
  if (!rolls.length) return undefined;
  const k = await kit($, e as unknown as RenderInput<"Pane">, {
    brand: "dnd",
    lang: "de",
  });
  return rollCard(
    k,
    rolls,
    (await readRules($)).spoilerSafe,
    (p.tool_use_id || e.requestId).slice(-8),
  );
}

/** The verdict card under a reviewed picture (shared by both hooks); undefined when the answer shows none. */
async function pictureCardOf(
  $: EngineInterface,
  e: CardInput,
): Promise<RenderElement | undefined> {
  const items = reviewedIn(
    outputText(e.props.output),
    (await readReview($)).items,
  );
  if (!items.length) return undefined;
  const k = await kit($, e as unknown as RenderInput<"Pane">, {
    brand: "dnd",
    lang: "de",
  });
  return pictureCard($, k, items);
}

export function registerTranscript(on: On): void {
  on(
    "ui.render",
    { component: "ToolResult", plugin: "*", props: { tool: ROLL_TOOL } },
    async ($, e, next) => {
      const p = e.props;
      if (p.isErrored || p.isExpanded) return next(e);
      return (await rollCardOf($, e)) ?? next(e);
    },
  ).catch(($, e, next) => next(e));

  on(
    "ui.render",
    { component: "ToolResult", plugin: "*", props: { tool: RESULTS_TOOL } },
    async ($, e, next) => {
      if (e.props.isErrored) return next(e);
      const card = await pictureCardOf($, e);
      if (!card) return next(e);
      const { Box } = await kit($, e as unknown as RenderInput<"Pane">, {
        brand: "dnd",
        lang: "de",
      });
      // the Studio's own result (the preview picture) stays; the verdict stands under it
      return (
        <Box flexDirection="column" gap={1}>
          {await next(e)}
          {card}
        </Box>
      );
    },
  ).catch(($, e, next) => next(e));

  // Desktop: the app keeps the tool row as its own and never asks for ToolResult, it asks for ToolUse. The app's
  // row stays, the same card stands under it. Terminal and mobile stay with the ToolResult hooks above; a running,
  // failed or interrupted call keeps the app's row alone.
  on(
    "ui.render",
    { component: "ToolUse", plugin: "*" },
    async ($, e, next) => {
      if (e.surface !== "desktop") return next(e);
      const tool = String(e.props.tool ?? "");
      if (tool !== ROLL_TOOL && tool !== RESULTS_TOOL) return next(e);
      const p = e.props;
      if (p.isRunning || p.isErrored || p.isInterrupted) return next(e);
      const card =
        tool === ROLL_TOOL
          ? await rollCardOf($, e)
          : await pictureCardOf($, e);
      if (!card) return next(e);
      const { Box } = await kit($, e as unknown as RenderInput<"Pane">, {
        brand: "dnd",
        lang: "de",
      });
      return (
        <Box flexDirection="column">
          {await next(e)}
          {card}
        </Box>
      );
    },
  ).catch(($, e, next) => next(e));
}
