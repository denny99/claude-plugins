/**
 * Kit cases taken over from the kit source (ds-solutions-flow `tests/ui-kit.test.tsx`, PR #68): a press moves nothing
 * (two-step button in place, fixed status line), the tab strip's „+N“ measures against the pane width, a pill with
 * `onPress` is a button.
 */
import type { RenderElement } from "claude-code";
import { expect, type Engine } from "claude-code/testing";
import { test } from "./limits";

import {
  KIT_STRINGS,
  ListRow,
  PaneBody,
  Pill,
  StatusLine,
  STATUS_BLANK,
  Tabs,
  themeTokens,
  type Brand,
  type Kit,
  type Mode,
} from "../lib/ui";

type Opts = {
  brand: Brand;
  mode?: Mode;
  cols: number;
  more?: string[];
  logMore?: string[];
  details?: string[];
};

/** A kit without `$` (the test's own `$` may not read the plugin's atom): fixed state, no-op toggles. */
function fakeKit(
  x: { ui: { resolve: (e: never) => unknown } },
  e: unknown,
  surface: string,
  o: Opts,
): Kit {
  const els = x.ui.resolve(e as never) as Record<
    string,
    (p: Record<string, unknown>) => RenderElement
  >;
  const mode = o.mode ?? "dark";
  const state = {
    toggled: [],
    more: o.more ?? [],
    details: o.details ?? [],
    logMore: o.logMore ?? [],
  };
  return {
    Box: els.Box!,
    Text: els.Text!,
    Button: els.Button!,
    Svg: els.Svg,
    Progress: els.Progress,
    cols: o.cols,
    rows: 30,
    compact: surface === "mobile" || o.cols < 60,
    narrow: o.cols < 48,
    surface,
    graphical: surface !== "terminal" && typeof els.Svg === "function",
    brand: o.brand,
    mode,
    t: themeTokens(o.brand, mode),
    s: KIT_STRINGS.de,
    state,
    isOpen: () => true,
    toggle: () => undefined,
    isMore: (key) => state.more.includes(key as never),
    toggleMore: () => undefined,
    isConfirming: () => false,
    askConfirm: () => undefined,
    clearConfirm: () => undefined,
    hasDetails: (key) => state.details.includes(key as never),
    toggleDetails: () => undefined,
    isLogMore: (key) => state.logMore.includes(key as never),
    toggleLogMore: () => undefined,
    copy: () => undefined,
    asked: { busy: false, sent: {} },
  } as unknown as Kit;
}

type Surface = "desktop" | "terminal" | "mobile";

function mountBoard($: Engine, id: string, surface: Surface, cols: number) {
  return $.ui.mount({
    plugin: "dnd-studio",
    component: "Pane",
    requestId: id,
    surface,
    viewport: { columns: cols, rows: 60 },
    props: {
      title: "KIT",
      isFocused: false,
      bodyColumns: cols,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 60 },
      view: {},
    },
  } as never);
}

type El0 = {
  type?: string;
  props?: { key?: string };
  press?: unknown;
  onPress?: () => void;
  children?: unknown[];
};

/** Depth-first search through a drawn element tree. */
function findEl(node: unknown, hit: (el: El0) => boolean): El0 | undefined {
  if (!node || typeof node !== "object") return undefined;
  const el = node as El0;
  if (hit(el)) return el;
  for (const c of el.children ?? []) {
    const f = findEl(c, hit);
    if (f) return f;
  }
  return undefined;
}

/** Every Button in a drawn tree, with whether an Svg sits inside it. */
function buttonsOf(
  node: unknown,
  out: { key?: string; svg: boolean }[] = [],
): { key?: string; svg: boolean }[] {
  if (!node || typeof node !== "object") return out;
  const el = node as El0;
  if (el.type === "Button")
    out.push({
      key: el.props?.key,
      svg: !!findEl(el, (c) => c !== el && c.type === "Svg"),
    });
  for (const c of el.children ?? []) buttonsOf(c, out);
  return out;
}

type ElP = {
  type?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
};

/** The text of an element's string children (what the test harness reports as a Button's `text`). */
function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return ((node as ElP).children ?? []).map(textOf).join("");
}

// --- [Q-Sprung] a press moves nothing; [Q-PlusN] the tab strip measures against the pane width ---

type Shape = { type?: string; key?: string; n: number; kids: Shape[] };

/** The layout skeleton of a tree: element types, keys of boxes and child counts, without any text. */
function shapeOf(node: unknown): Shape | string {
  if (!node || typeof node !== "object") return "text";
  const el = node as El0;
  const kids = (el.children ?? [])
    .filter((c) => c && typeof c === "object")
    .map((c) => shapeOf(c) as Shape);
  return {
    type: el.type,
    n: kids.length,
    kids: el.type === "Button" || el.type === "Text" ? [] : kids,
  };
}

test("Rückfrage und Statuszeile: ein Druck verschiebt nichts (Zeile bleibt eine Zeile, Frage in der festen Zeile)", async ($, on) => {
  const QUESTION =
    "ImporterMS auf 7.26.0 ziehen und neu starten? Der Dienst ist kurz nicht erreichbar.";
  const trees: Record<
    string,
    { idle: unknown; asked: unknown; rowIdle: unknown; rowAsked: unknown }
  > = {};
  for (const surface of ["desktop", "terminal"] as const)
    on(
      "ui.render",
      { component: "Pane", requestId: `jump-${surface}` },
      async (x, e) => {
        const k = fakeKit(x as never, e, surface, {
          brand: "neutral",
          cols: 80,
        });
        const armed: Kit = {
          ...k,
          state: {
            ...k.state,
            confirm: "upd-ImporterMS",
            confirmText: QUESTION,
          } as never,
          isConfirming: (key) => key === "upd-ImporterMS",
        };
        const row = (kk: Kit) =>
          ListRow(kk, {
            key: "svc-ImporterMS",
            title: "ImporterMS",
            meta: "7.25.0 → 7.26.0",
            status: "update",
            actions: [
              {
                key: "upd-ImporterMS",
                label: "Aktualisieren",
                icon: "refresh",
                confirm: QUESTION,
                onPress: () => undefined,
              },
            ],
          });
        const pane = (kk: Kit, r: RenderElement) =>
          PaneBody(kk, { key: "infra", header: null, children: [r] });
        const rowIdle = row(k);
        const rowAsked = row(armed);
        trees[surface] = {
          idle: pane(k, rowIdle),
          asked: pane(armed, rowAsked),
          rowIdle,
          rowAsked,
        };
        return trees[surface]!.asked as RenderElement;
      },
    );
  for (const surface of ["desktop", "terminal"] as const) {
    const ui = await mountBoard($, `jump-${surface}`, surface, 80);
    const t = trees[surface]!;
    const line = (tree: unknown) =>
      findEl(tree, (el) => (el as ElP).props?.key === "infra-status");
    // the terminal holds the line before and after the press, with the same box (blank, then the question in one
    // line); a graphical surface draws no empty line (kit: no hole under the header), the question makes it appear
    if (surface === "desktop") expect(line(t.idle)).toBeUndefined();
    else {
      expect(line(t.idle)).toBeDefined();
      expect(textOf(line(t.idle))).toBe(STATUS_BLANK);
    }
    // (the terminal cuts it at the body width; the kit then also toasts it in full)
    if (surface === "desktop") expect(textOf(line(t.asked))).toBe(QUESTION);
    else
      expect(textOf(line(t.asked))).toMatch(
        /^ImporterMS auf 7\.26\.0 ziehen und neu starten\? .*…$/,
      );
    if (surface !== "desktop")
      expect({ ...(line(t.asked) as ElP).props }).toEqual({
        ...(line(t.idle) as ElP).props,
      });
    // the question stands nowhere else: not in the row, not in a button
    expect(textOf(t.rowAsked)).not.toContain("neu starten?");
    // in place of the one button: two short ones in one row, the action label and ✕
    const pair = findEl(
      t.rowAsked,
      (el) => (el as ElP).props?.key === "upd-ImporterMS-ask",
    ) as ElP;
    expect((pair.props as { flexDirection?: string }).flexDirection).toBe(
      "row",
    );
    const both = (pair.children ?? []).filter(
      (c) => (c as El0).type === "Button",
    ) as ElP[];
    // graphical: „Abbrechen“ (kit: a ✕ is only the terminal's short cancel)
    expect(both.map((b) => String(b.props?.label ?? textOf(b)))).toEqual([
      "Aktualisieren",
      surface === "desktop" ? "Abbrechen" : "✕",
    ]);
    expect(both.map((b) => b.props?.key)).toEqual([
      "upd-ImporterMS",
      "upd-ImporterMS-cancel",
    ]);
    // the row keeps its shape: the same boxes with the same number of children, only the button became the pair
    const BTN = '{"type":"Button","n":0,"kids":[]}';
    const shape = (tree: unknown) =>
      JSON.stringify(shapeOf(tree)).replace(
        `{"type":"Box","n":2,"kids":[${BTN},${BTN}]}`,
        BTN,
      );
    expect(shape(t.rowAsked)).toBe(shape(t.rowIdle));
    await ui.unmount();
  }
});

test("Statuszeile: läuft, Ergebnis und Fehler stehen in derselben einen Zeile; leer hält sie den Platz", async ($, on) => {
  const out: Record<string, unknown[]> = {};
  for (const surface of ["desktop", "terminal"] as const)
    on(
      "ui.render",
      { component: "Pane", requestId: `status-${surface}` },
      async (x, e) => {
        const k = fakeKit(x as never, e, surface, {
          brand: "neutral",
          cols: 40,
        });
        const { Box } = k;
        out[surface] = [
          StatusLine(k, { key: "s" }),
          StatusLine(k, {
            key: "s",
            status: { text: "Fetch läuft …", running: true },
          }),
          StatusLine(k, {
            key: "s",
            status: { text: "Fetch: 3 neue Commits", tone: "ok" },
          }),
          StatusLine(k, {
            key: "s",
            status: {
              text: `Fetch gescheitert: ${"x".repeat(200)}\nzweite Zeile`,
              tone: "bad",
            },
          }),
          StatusLine(k, { key: "s", status: "nur Text" }),
        ];
        return (
          <Box flexDirection="column">{out[surface] as RenderElement[]}</Box>
        );
      },
    );
  for (const surface of ["desktop", "terminal"] as const) {
    const ui = await mountBoard($, `status-${surface}`, surface, 40);
    const lines = out[surface] as ElP[];
    expect(lines.map((l) => textOf(l)).slice(0, 3)).toEqual([
      STATUS_BLANK,
      "◷ Fetch läuft …",
      "Fetch: 3 neue Commits",
    ]);
    for (const l of lines) {
      expect({ ...l.props }).toEqual({ ...lines[0]!.props });
      expect(textOf(l)).not.toContain("\n");
      expect((l.children ?? []).length).toBe(1);
    }
    if (surface === "terminal")
      expect([...textOf(lines[3])].length).toBeLessThanOrEqual(40);
    else
      expect(
        (findEl(lines[3], (el) => el.type === "Text") as ElP).props,
      ).toMatchObject({ wrap: "truncate-end" });
    await ui.unmount();
  }
});

const HUB_TEN = [
  "Projekt",
  "Git",
  "Run",
  "Infra",
  "Nx",
  "Probleme",
  "Docker",
  "Forge",
  "Wiki",
  "Meldungen",
];

/**
 * Body columns of a desktop pane of `px` width. Calibrated on the two Hub screenshots of 2026-11-19: at about 1300 px
 * the old estimate (label + 2) hid exactly one of the ten tabs, which puts the body at 74 to 80 columns.
 */
const colsAt = (px: number) => Math.max(20, Math.round((px * 77) / 1300));

test("tabs „+N“: zehn Hub-Tabs bei 1300, 900, 600 und 320 px; nie „+1“, wenn der eine Tab Platz hat", async ($, on) => {
  const WIDTHS = [1300, 900, 600, 320];
  const trees: Record<number, unknown> = {};
  for (const px of WIDTHS)
    on(
      "ui.render",
      { component: "Pane", requestId: `plusn-${px}` },
      async (x, e) => {
        const k = fakeKit(x as never, e, "desktop", {
          brand: "neutral",
          cols: colsAt(px),
        });
        trees[px] = Tabs(k, {
          tabs: HUB_TEN.map((label) => ({
            id: label.toLowerCase(),
            label,
            icon: "folder" as const,
          })),
          active: "projekt",
          keyPrefix: "hub-",
          onSelect: () => undefined,
        });
        return trees[px] as RenderElement;
      },
    );
  // the desktop width of a tab in columns, as the pane really draws it (0.9 per character + 1.5 padding, 1 gap)
  const w = (label: string) => [...label].length * 0.9 + 1.5;
  const seen: Record<number, string[]> = {};
  for (const px of WIDTHS) {
    const ui = await mountBoard($, `plusn-${px}`, "desktop", colsAt(px));
    const labels = buttonsOf(trees[px]).map((b) =>
      String(b.key).replace(/^hub-/, ""),
    );
    seen[px] = labels;
    const tabs = labels.filter((l) => l !== "more" && l !== "prev");
    const hidden = HUB_TEN.length - tabs.length;
    const more = findEl(
      trees[px],
      (el) => (el as ElP).props?.key === "hub-more",
    );
    expect({ px, more: more ? textOf(more) : undefined }).toEqual({
      px,
      more: hidden ? `+${hidden}` : undefined,
    });
    // what is shown fits the width, together with the "+N" button
    const used =
      tabs.reduce((sum, id, i) => sum + w(HUB_TEN[i]!) + (i ? 1 : 0), 0) +
      (hidden ? w(`+${hidden}`) + 1 : 0);
    expect({ px, fits: used <= colsAt(px) + 1 }).toEqual({ px, fits: true });
    // and nothing is hidden that had room: the next tab (with the "+N" then left) would not fit
    if (hidden) {
      const next = w(HUB_TEN[tabs.length]!) + 1;
      const then = hidden > 1 ? w(`+${hidden - 1}`) + 1 : 0;
      const rest = used - (w(`+${hidden}`) + 1);
      expect({
        px,
        room: rest + next + then <= colsAt(px) + (hidden === 1 ? 1 : 0),
      }).toEqual({ px, room: false });
    }
    await ui.unmount();
  }
  // 1300 px: all ten, no "+1" (the screenshot's case); narrower widths page, the narrowest still shows a tab
  expect(seen[1300]).toEqual(HUB_TEN.map((l) => l.toLowerCase()));
  expect(seen[320]!.length).toBeGreaterThanOrEqual(2);
});

test("tabs „+N“: ein letzter Tab, der so schmal ist wie „+1“, steht selbst da", async ($, on) => {
  const trees: Record<string, unknown> = {};
  // desktop, 22 columns: Projekt 7.8 + Probleme 9.7 + Git 5.2 = 22.7, within the reserve of 1, so Git stands there;
  // at 21 columns not even „Probleme“ fits beside a paging button, the strip pages after „Projekt“ ("+2")
  const cases = [
    {
      id: "fits",
      surface: "desktop" as const,
      cols: 22,
      keys: ["tab-projekt", "tab-probleme", "tab-git"],
    },
    {
      id: "pages",
      surface: "desktop" as const,
      cols: 21,
      keys: ["tab-projekt", "tab-more"],
    },
  ];
  for (const c of cases)
    on(
      "ui.render",
      { component: "Pane", requestId: `last-${c.id}` },
      async (x, e) => {
        const k = fakeKit(x as never, e, c.surface, {
          brand: "neutral",
          cols: c.cols,
        });
        trees[c.id] = Tabs(k, {
          tabs: ["Projekt", "Probleme", "Git"].map((label) => ({
            id: label.toLowerCase(),
            label,
            icon: "folder" as const,
          })),
          active: "projekt",
          onSelect: () => undefined,
        });
        return trees[c.id] as RenderElement;
      },
    );
  for (const c of cases) {
    const ui = await mountBoard($, `last-${c.id}`, c.surface, c.cols);
    expect({
      id: c.id,
      keys: buttonsOf(trees[c.id]).map((b) => b.key),
    }).toEqual({
      id: c.id,
      keys: c.keys,
    });
    await ui.unmount();
  }
});

test("Pill mit onPress: ein Button (kein Svg), sichtbar klickbar, ui.press erreicht ihn", async ($, on) => {
  const trees: Record<string, unknown> = {};
  let pressed = 0;
  for (const surface of ["desktop", "terminal"] as const)
    on(
      "ui.render",
      { component: "Pane", requestId: `pill-${surface}` },
      async (x, e) => {
        const k = fakeKit(x as never, e, surface, {
          brand: "neutral",
          cols: 80,
        });
        const { Box } = k;
        trees[surface] = (
          <Box flexDirection="row" gap={1}>
            {Pill(k, {
              key: "p-red",
              text: "3 rot",
              tone: "bad",
              onPress: () => void pressed++,
            })}
            {Pill(k, { text: "ruhig", tone: "ok" })}
          </Box>
        );
        return trees[surface] as RenderElement;
      },
    );
  for (const surface of ["desktop", "terminal"] as const) {
    const ui = await mountBoard($, `pill-${surface}`, surface, 80);
    const b = findEl(trees[surface], (el) => el.type === "Button") as ElP;
    expect(b.props?.key).toBe("p-red");
    expect(String(b.props?.label ?? textOf(b))).toBe("✕ 3 rot ›");
    expect(buttonsOf(trees[surface])).toEqual([{ key: "p-red", svg: false }]);
    if (surface === "desktop")
      expect(b.props).toMatchObject({
        label: "✕ 3 rot ›",
        variant: "secondary",
      });
    await ui.press({ key: "p-red", plugin: "test" } as never);
    await ui.unmount();
  }
  expect(pressed).toBe(2);
});
