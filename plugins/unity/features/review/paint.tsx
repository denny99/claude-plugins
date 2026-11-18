/**
 * Surface module (a `Client`) laid over the picture viewer's Svg: it draws nothing visible, takes the pointer and
 * posts each finished stroke as normalized points (`{ type: 'mark', pts }`) to the hooks module, which keeps the
 * marks and repaints them into the Svg. While `playing`, it posts a `{ type: 'tick' }` on its frame clock so the
 * viewer steps to the next frame. Self-contained (runs on the drawing thread, no `$`, no imports).
 */
type Props = { playing?: boolean; fps?: number }
type Local = { started: true }
type Surface = {
  elements: { Box: (p: Record<string, unknown>) => unknown }
  state: Local | undefined
  setState: (s: Local) => void
  columns: number
  rows: number
  every: (ms: number, fn: () => void) => () => void
  onPointer: (
    fn: (e: { type: string; x: number; y: number; fine?: { x: number; y: number }; button?: string }) => void,
  ) => () => void
  post: (data: unknown) => void
}

const live = new WeakMap<object, { props: Props; pts: [number, number][]; down: boolean; last: number }>()

export default function Paint(props: Props, surface: Surface): unknown {
  let me = live.get(surface)
  if (!me) {
    me = { props, pts: [], down: false, last: 0 }
    live.set(surface, me)
  }
  me.props = props ?? {}
  const self = me
  const at = (e: { x: number; y: number; fine?: { x: number; y: number } }): [number, number] => {
    const c = (v: number) => Math.max(0, Math.min(1, Math.round(v * 1000) / 1000))
    const x = e.fine?.x ?? e.x + 0.5
    const y = e.fine?.y ?? e.y + 0.5
    return [c(surface.columns > 0 ? x / surface.columns : 0), c(surface.rows > 0 ? y / surface.rows : 0)]
  }
  surface.onPointer(e => {
    if (e.type === 'down' && (e.button ?? 'left') === 'left') {
      self.down = true
      self.pts = [at(e)]
    } else if (e.type === 'move' && self.down) {
      const p = at(e)
      const q = self.pts[self.pts.length - 1]
      if (!q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 0.004) self.pts.push(p)
      if (self.pts.length > 400) self.pts = self.pts.filter((_, i) => i % 2 === 0)
    } else if (e.type === 'up' && self.down) {
      self.down = false
      if (self.pts.length) surface.post({ type: 'mark', pts: self.pts })
      self.pts = []
    }
  })
  if (surface.state === undefined) {
    surface.every(100, () => {
      if (!self.props.playing) return
      const fps = Math.max(1, Math.min(12, self.props.fps ?? 8))
      const t = Date.now()
      if (t - self.last < 1000 / fps) return
      self.last = t
      surface.post({ type: 'tick' })
    })
    surface.setState({ started: true })
  }
  return surface.elements.Box({ flexGrow: 1, width: '100%', height: '100%' })
}
