/**
 * The Host: processes, files and HTTP, built from `$`, the same on macOS, Windows and Linux.
 *
 * Copied from ds-solutions-flow/lib/host.ts and made cross-platform: the OS comes from the environment (`detectPlatform`: OS, WSL_DISTRO_NAME, HOME),
 * PATH is split and joined with that OS's delimiter, and the extra tool folders are per OS. No POSIX-only command is
 * used in a shared path.
 */
import type { EngineInterface } from "claude-code";

export type Platform = "macos" | "windows" | "wsl" | "linux" | "unknown";

export type CommandResult = { code: number; stdout: string; stderr: string };

export type Runner = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
) => Promise<CommandResult>;

export interface Host {
  run: Runner;
  platform: Platform;
  home: string;
  path: string;
  /** `%LOCALAPPDATA%` on Windows, else ''. */
  localAppData: string;
  readText(path: string): Promise<string | undefined>;
  /** Any HTTP answer at all (401, 404 included) means something listens there. */
  reachable(url: string): Promise<{ isUp: boolean; detail: string }>;
}

/** `;` on Windows, `:` elsewhere. */
export function pathDelimiter(platform: Platform): string {
  return platform === "windows" ? ";" : ":";
}

/** The folders a Dock- or Start-menu-started Claude Code may miss, per OS, in front of the current PATH. */
export function augmentedPath(
  platform: Platform,
  home: string,
  current: string,
): string {
  const sep = pathDelimiter(platform);
  const extras =
    platform === "macos"
      ? [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          `${home}/.volta/bin`,
          "/usr/bin",
          "/bin",
        ]
      : platform === "windows"
        ? [
            `${home}\\AppData\\Roaming\\npm`,
            `${home}\\.volta\\bin`,
            "C:\\Windows\\System32",
          ]
        : ["/usr/local/bin", `${home}/.volta/bin`, "/usr/bin", "/bin"];
  const seen = new Set<string>();
  const key = (p: string): string =>
    platform === "windows" ? p.toLowerCase() : p;
  return [...extras, ...current.split(sep)]
    .filter((p) => p && !seen.has(key(p)) && seen.add(key(p)))
    .join(sep);
}

/** The argv that starts the D&D Studio desktop app, or undefined where only a hint helps. */
export function startArgv(
  platform: Platform,
  localAppData: string,
): string[] | undefined {
  if (platform === "macos") return ["open", "-a", "DnD Studio"];
  if (platform === "windows" && localAppData)
    return [
      "explorer.exe",
      `${localAppData}\\Programs\\DnD Studio\\DnD Studio.exe`,
    ];
  return undefined;
}

/** How a person starts the app on this OS. */
export function startHint(platform: Platform): string {
  if (platform === "macos")
    return 'Start "DnD Studio" from Applications (or the Dock) and wait until the Studio is open.';
  if (platform === "windows")
    return 'Start "DnD Studio" from the Start menu and wait until the Studio is open; the tray icon is enough.';
  if (platform === "wsl")
    return 'Start "DnD Studio" on Windows; from WSL the MCP server on 127.0.0.1 is only reachable with mirrored networking.';
  return "Start the dnd-studio desktop app and wait until the Studio is open.";
}

let cached:
  | { platform: Platform; home: string; path: string; localAppData: string }
  | undefined;

/** The OS, read off the environment (the engine has no platform call). */
export async function detectPlatform($: EngineInterface): Promise<Platform> {
  const read = (v: Promise<string | undefined>) => v.catch(() => undefined);
  if ((await read($.env.get("OS"))) === "Windows_NT") return "windows";
  if (await read($.env.get("WSL_DISTRO_NAME"))) return "wsl";
  const home = (await read($.env.get("HOME"))) ?? "";
  if (home.startsWith("/Users/")) return "macos";
  if (home.startsWith("/")) return "linux";
  return "unknown";
}

/** Builds the real Host from the `$` of the hook you are in. */
export async function createHost($: EngineInterface): Promise<Host> {
  if (!cached) {
    const platform = await detectPlatform($);
    const home =
      (platform === "windows"
        ? await $.env.get("USERPROFILE")
        : await $.env.get("HOME")) ?? "";
    const current = (await $.env.get("PATH")) ?? "";
    const localAppData =
      platform === "windows" ? ((await $.env.get("LOCALAPPDATA")) ?? "") : "";
    cached = {
      platform,
      home,
      path: augmentedPath(platform, home, current),
      localAppData,
    };
  }
  const env = cached;
  return {
    ...env,
    run: async (cmd, args, opts) => {
      try {
        const r = await $.process.run([cmd, ...args], {
          cwd: opts?.cwd,
          env: { PATH: env.path, ...opts?.env },
          timeoutMs: 15000,
        });
        return { code: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
      } catch (err) {
        return {
          code: 127,
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err),
        };
      }
    },
    readText: async (p) => {
      try {
        return (await $.fs.read(p)) as string;
      } catch {
        return undefined;
      }
    },
    reachable: async (url) => {
      try {
        const res = await $.http.fetch(url, { method: "GET" });
        return { isUp: true, detail: `HTTP ${res.status}` };
      } catch (err) {
        return {
          isUp: false,
          detail: tidyError(err instanceof Error ? err.message : String(err)),
        };
      }
    },
  };
}

/** For tests: forget the cached OS/env. */
export function resetHostCache(): void {
  cached = undefined;
}

/**
 * An engine error as one readable detail: without the `dnd-studio: `, `$.tool.register: ` and `$.http.fetch(…) failed: `
 * wrapping and with
 * a repeated code said once (`ECONNREFUSED: ECONNREFUSED: Unable…` → `ECONNREFUSED: Unable…`).
 */
export function tidyError(message: string): string {
  return message
    .replace(/^(?:dnd-studio:\s*)+/i, "")
    .replace(/\$\.http\.fetch\([^)]*\) failed:\s*/g, "")
    .replace(/^\$\.[a-z]+\.[a-zA-Z]+:\s*/, "")
    .replace(/\b([A-Z][A-Z0-9_]+):\s+(?:\1:\s+)+/g, "$1: ")
    .trim();
}
