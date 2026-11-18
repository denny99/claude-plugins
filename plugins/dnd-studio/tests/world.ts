/** A faked engine and D&D Studio for the tests (the Studio's answer shapes follow desktop/src/mcp.js and app.js). */
import { mock } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

export type Call = { tool: string; args: Record<string, unknown> };
type On = Parameters<TestBody>[1];

export const PREFIX = "mcp__plugin_dnd-studio_dnd-studio__";

export function pane(cols = 70, rows = 40) {
  return {
    plugin: "dnd-studio",
    component: "Pane",
    requestId: "dnd",
    props: {
      title: "D&D",
      isFocused: false,
      bodyColumns: cols,
      placement: "dock",
      scroll: { offset: 0, bodyRows: rows },
      view: {},
    },
  } as const;
}

export function band(cols = 120) {
  return {
    plugin: "dnd-studio",
    component: "AbovePrompt",
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: cols,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  } as const;
}

export const TABLE: Record<string, unknown> = {
  listening: false,
  paused: false,
  players_window: true,
  discord: true,
  party: ["Thorin", "Mara"],
  scene: { title: "Das Tor" },
  status: { Thorin: { values: { Ausdauer: "18/22" }, conditions: [] } },
  log: [{ kind: "roll", who: "Thorin", label: "Athletik", total: 14 }],
};

export const CAMPAIGN: Record<string, unknown> = {
  open: "Breeland",
  threads: ["Der Brief"],
  partyAt: "Bree",
  worldMap: "Eriador",
  brokenReferences: [],
  npcs: [
    {
      name: "Bartel",
      place: "Bree",
      portrait: "/view?p=1",
      voice: "warm",
      sheet: "",
      stock: { greet: [{ text: "Na, ihr da!", how: "say:warm:normal" }] },
    },
    {
      name: "Wirtin",
      place: "Bree",
      portrait: "/view?p=2",
      voice: "hell",
      sheet: "Wirtin",
      stock: { greet: ["Hallo"] },
    },
    { name: "Hund", notes: "stumm, bellt nur" },
  ],
  places: [
    { name: "Bree", map: "Bree", marker: { x: 0.4, y: 0.5 } },
    { name: "Wald", map: "", marker: null },
  ],
  scenes: [
    {
      title: "Das Tor",
      place: "Bree",
      text: "Regen.",
      notes: "Startfelder A1, B2",
      picture: "/view?s=1",
    },
    { title: "Im Wald", place: "Wald", text: "", notes: "", picture: "" },
  ],
};

export const MAPS = {
  maps: [
    {
      name: "Bree",
      tiles: ["0,0"],
      planned: ["0,0", "0,1"],
      usedBy: ["Bree (Breeland)"],
    },
    {
      name: "Eriador",
      tiles: ["0,0"],
      planned: false,
      usedBy: ["campaign map of Breeland"],
    },
  ],
};

export const STATUS = {
  connected: true,
  version: "loaded",
  app_version: "3.20.0",
  profile: { name: "Test", folder: "/p" },
  jobs: [
    { id: "1", mode: "picture", running: true, progress: 40, step: "KSampler" },
    { id: "2", mode: "picture", running: false },
  ],
};

export const DISCORD = {
  connected: true,
  voice: { id: "v", name: "Tisch" },
  members: [
    { id: "1", name: "anna", character: "Mara" },
    { id: "2", name: "bob", character: null },
  ],
  missing: [],
  here: "Tisch",
  rooms: [
    { name: "Tisch", table: true, bot: true, members: ["Mara"] },
    { name: "Keller", members: ["bob"] },
  ],
};

export type World = {
  /** Set: $.tool.register throws this (an old MCP server holds the plugin's tool names). */
  registerError?: string;
  calls: Call[];
  /** Pane ids opened ($.ui.open). */
  opened: string[];
  writes: { path: string; text: string }[];
  toasts: string[];
  /** Theme calls: the backdrop scene of each set ("dnd-table"), "clear" for each clear. */
  themes: string[];
  submitted: string[];
  store: Map<string, unknown>;
  answers: Record<string, unknown>;
  clock: { advance: (ms: number) => Promise<void> };
};

export function world(on: On, answers: Record<string, unknown> = {}): World {
  const w: World = {
    calls: [],
    writes: [],
    toasts: [],
    themes: [],
    submitted: [],
    opened: [],
    store: new Map(),
    answers: {
      table_state: TABLE,
      campaign: CAMPAIGN,
      map: MAPS,
      studio_status: STATUS,
      discord: DISCORD,
      ...answers,
    },
    clock: mock.clock(on, { now: 1_700_000_000_000 }) as never,
  };
  on("command.register", (_, e) => ({ value: { command: e.name } }));
  on("tool.register", () => {
    if (w.registerError) throw new Error(w.registerError);
    return { value: {} as never };
  });
  on("ui.open", (_, e) => {
    w.opened.push(String((e as { id?: string }).id ?? ""));
    return { value: { isPlaced: true } };
  });
  on("ui.toast", (_, e) => {
    w.toasts.push(String((e as { text?: string }).text ?? JSON.stringify(e)));
    return { value: undefined };
  });
  on("store.get", (_, e) => ({ value: w.store.get(e.key) as never }));
  on("store.set", (_, e) => {
    w.store.set(e.key, e.value);
    return { value: undefined };
  });
  on("store.delete", (_, e) => {
    w.store.delete(e.key);
    return { value: undefined };
  });
  on("theme.set", (_, e) => {
    w.themes.push(String((e as { backdrop?: { scene?: string } }).backdrop?.scene));
    return { value: { isDrawn: true } as never };
  });
  on("theme.clear", () => {
    w.themes.push("clear");
    return { value: { isDrawn: true } as never };
  });
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("session.id", () => ({ value: "s-1" }));
  const env: Record<string, string> = {
    HOME: "/Users/d",
    PATH: "/usr/bin",
    TMPDIR: "/var/tmp/",
  };
  on("env.get", (_, e) => ({ value: env[e.name] }));
  on("fs.write", (_, e) => {
    w.writes.push({ path: e.path, text: e.text });
    return { value: undefined };
  });
  on("fs.read", (_, e) => {
    if (e.path === "/Users/d/kampagne/plan.md")
      return { value: "# Bauplan\n- Szene 1" };
    if (e.path.endsWith("/.claude-plugin/plugin.json"))
      return { value: '{"name":"dnd-studio","version":"9.8.7"}' };
    throw new Error("missing");
  });
  on("prompt.submit", (_, e) => {
    w.submitted.push(e.text);
    return { text: e.text };
  });
  on("turn.complete", () => ({ text: "" }));
  on("turn.start", (_, e) => ({ turnId: e.turnId }));
  on("agent.spawn", (_, e) => ({ model: "opus", agentId: e.description }));
  on("mcp.connect", () => ({
    value: { isConnected: true, server: "plugin:dnd-studio:dnd-studio" },
  }));
  on("mcp.call", (_, e) => {
    w.calls.push({ tool: e.tool, args: e.args });
    const body = w.answers[e.tool] ?? { ok: true };
    // a function answers with raw MCP content blocks (a cut answer, several blocks)
    if (typeof body === "function")
      return {
        value: {
          content: (body as (a: Record<string, unknown>) => unknown[])(
            e.args,
          ),
          isError: false,
        } as never,
      };
    return {
      value: {
        content: [{ type: "text", text: JSON.stringify(body) }],
        isError: false,
      },
    };
  });
  return w;
}

/** A model's own tool call that the Studio answers with `body`. */
export function toolResult(body: unknown) {
  return {
    result: [
      {
        type: "text",
        text: typeof body === "string" ? body : JSON.stringify(body),
      },
    ],
  };
}
