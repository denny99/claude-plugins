/**
 * Path helpers for macOS and Windows (no `path` module in a mod). Internally every path uses `/`: `$.fs` accepts it on
 * Windows too, and so does Git Bash, which the Bash tool runs there. {@link norm} turns `C:\a\b` into `C:/a/b`.
 */

/** Backslashes to `/`, duplicate slashes collapsed (a leading `//` UNC prefix kept). */
export function norm(p: string): string {
  const s = p.replace(/\\/g, '/')
  const unc = s.startsWith('//')
  const out = s.replace(/\/{2,}/g, '/')
  return unc ? `/${out}` : out
}

/** Joins segments with `/`. */
export function join(...parts: string[]): string {
  return norm(parts.filter(p => p !== '').join('/'))
}

/** Last path segment. */
export function basename(p: string): string {
  const t = norm(p).replace(/\/+$/, '')
  return t.slice(t.lastIndexOf('/') + 1)
}

/** Everything before the last segment (`/a/b` → `/a`, `C:/a` → `C:/`, `c` → `.`). */
export function dirname(p: string): string {
  const t = norm(p).replace(/\/+$/, '')
  const cut = t.lastIndexOf('/')
  if (cut < 0) return '.'
  if (cut === 0) return '/'
  if (/^[A-Za-z]:$/.test(t.slice(0, cut))) return `${t.slice(0, cut)}/`
  return t.slice(0, cut)
}

/** `to` relative to `from` when it lies under it (case-insensitive on Windows drive paths), else `to` normalized. */
export function relative(from: string, to: string): string {
  const base = norm(from).replace(/\/+$/, '')
  const t = norm(to)
  const drive = /^[A-Za-z]:/.test(base)
  const eq = (a: string, b: string): boolean => (drive ? a.toLowerCase() === b.toLowerCase() : a === b)
  if (eq(t, base)) return ''
  return eq(t.slice(0, base.length + 1), `${base}/`) ? t.slice(base.length + 1) : t
}

/** True for `/x`, `C:/x`, `C:\x` and UNC paths. */
export function isAbsolute(p: string): boolean {
  return /^([A-Za-z]:)?[\\/]/.test(p)
}
