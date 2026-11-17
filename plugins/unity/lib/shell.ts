/**
 * Background-shell helpers. The Bash tool runs bash on macOS and Git Bash on Windows, so one POSIX line serves both;
 * paths in it use `/` (Git Bash takes `C:/Program Files/...`).
 */

/** The line the wrapper prints after the command ends: `[unity-run] exit <code>`. */
export const EXIT_MARKER = '[unity-run] exit '

const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/

/** Single-quotes `s` for a POSIX shell (no expansion). */
export function shQuote(s: string): string {
  if (s !== '' && SAFE.test(s)) return s
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** Quotes and joins words into one command line. */
export function shJoin(words: readonly string[]): string {
  return words.map(shQuote).join(' ')
}

/** Wraps `command` so it prints {@link EXIT_MARKER} with its exit code when it ends (the pane polls for it). */
export function wrapCommand(command: string, cwd?: string): string {
  const steps = cwd ? [`cd ${shQuote(cwd)}`, command] : [command]
  return `(${steps.join(' && ')}\n); __u_rc=$?; printf '\\n${EXIT_MARKER}%s\\n' "$__u_rc"; exit "$__u_rc"`
}

/** The exit code from a wrapped command's output, or undefined while it runs. */
export function exitCodeOf(output: string): number | undefined {
  const at = output.lastIndexOf(EXIT_MARKER)
  if (at < 0) return undefined
  const m = /^(\d+)/.exec(output.slice(at + EXIT_MARKER.length))
  return m ? Number(m[1]) : undefined
}

/** Strips ANSI escapes and control characters (a Pane refuses a Text holding one) and splits into lines. */
export function cleanLines(text: string): string[] {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .split(/\r?\n/)
      .map(line => {
        const cr = line.lastIndexOf('\r')
        // eslint-disable-next-line no-control-regex
        return (cr >= 0 ? line.slice(cr + 1) : line).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').replace(/\t/g, '  ')
      })
  )
}

/** The last `n` non-marker lines of an output, cleaned; trailing blanks dropped. */
export function tailLines(text: string, n: number): string[] {
  const lines = cleanLines(text).filter(l => !l.startsWith(EXIT_MARKER))
  while (lines.length && lines[lines.length - 1]?.trim() === '') lines.pop()
  return lines.slice(-n)
}

/** Task id and output file from a Bash background result (structured fields first, then the text). */
export function backgroundInfo(result: unknown, text: string | undefined): { taskId?: string; outputPath?: string } {
  const r = (typeof result === 'object' && result ? result : {}) as {
    backgroundTaskId?: unknown
    backgroundOutputPath?: unknown
  }
  const t = text ?? ''
  const taskId = typeof r.backgroundTaskId === 'string' ? r.backgroundTaskId : /with ID: ([^\s.]+)/.exec(t)?.[1]
  const outputPath =
    typeof r.backgroundOutputPath === 'string'
      ? r.backgroundOutputPath
      : /written to: (\S+?\.output)(?=[.\s]|$)/.exec(t)?.[1]
  return { ...(taskId ? { taskId } : {}), ...(outputPath ? { outputPath } : {}) }
}
