/**
 * Brings the Unity editor to the front (and back) on macOS, without an Automation permission dialog: JXA in
 * `osascript` through AppKit (NSWorkspace / NSRunningApplication), not System Events. A click in Claude sends Unity to
 * the background, where the editor throttles Play mode and pauses its audio (Testrunde 3).
 *
 * The script text is fixed: the process id goes in as an argument (`run(argv)`), never into the text.
 */
import type { Host } from './host'

/** Activates the app with the pid in argv[0]; prints the pid of the app that was in front before (or `none`). */
export const FRONT_JXA = [
  "ObjC.import('AppKit')",
  'function run(argv) {',
  '  const ws = $.NSWorkspace.sharedWorkspace',
  '  const prev = ws.frontmostApplication.processIdentifier',
  '  const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[0]))',
  "  if (!app || (typeof app.isNil === 'function' && app.isNil())) return 'none'",
  '  app.activateWithOptions(2)',
  '  return String(prev)',
  '}',
].join('\n')

/** Only macOS can do it this way; elsewhere the panel says „Unity-Fenster nach vorn holen“. */
export function canFront(platform: string | undefined): boolean {
  return platform === 'macos'
}

export const FRONT_HINT = 'Unity-Fenster nach vorn holen'

export type FrontResult = { ok: true; prev?: number } | { ok: false; error: string }

const validPid = (pid: unknown): pid is number => typeof pid === 'number' && Number.isInteger(pid) && pid > 0

/**
 * Activates the app with `pid`. Answers the pid of the app that was in front before (to give the focus back with a
 * second call), unless that was the app itself.
 */
export async function activatePid(host: Pick<Host, 'run' | 'platform' | 'home'>, pid: number): Promise<FrontResult> {
  if (!canFront(host.platform)) return { ok: false, error: `${FRONT_HINT} (nur auf macOS per Knopf).` }
  if (!validPid(pid)) return { ok: false, error: 'Unity meldet keine Prozess-ID (Bridge läuft nicht?).' }
  const r = await host.run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', FRONT_JXA, String(pid)], {
    cwd: host.home || '/',
    log: () => undefined,
  })
  const out = r.stdout.trim()
  if (r.code !== 0) return { ok: false, error: `Unity ließ sich nicht nach vorn holen (osascript ${r.code}).` }
  if (out === 'none') return { ok: false, error: 'Kein laufendes Programm mit dieser Prozess-ID (Unity beendet?).' }
  const prev = Number(out)
  return validPid(prev) && prev !== pid ? { ok: true, prev } : { ok: true }
}
