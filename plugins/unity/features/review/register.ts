/**
 * Review wiring: the two tools (show pictures to the developer, read their marked answer back) and the paint overlay's posts.
 * `features/register.tsx` registers REVIEW_TOOLS in its one session.start hook and calls registerReview(on, options).
 */
import type { EngineInterface, On } from 'claude-code'

import type { Options } from '../state'
import { patchReview, readBase64, readReview, resolvePath } from './store'
import { addMark, newView } from './tab'

export const REVIEW_TOOLS: { name: string; description: string; inputSchema?: Record<string, unknown> }[] = [
  {
    name: 'unity_review_show',
    description:
      "Shows the developer pictures in the Unity pane's Review tab and asks them a question about them: one picture, a frame " +
      'sequence (animation), several directions or 3D views (one group each, e.g. N/NE/E… or Vorne/Seite/Oben, or ' +
      'Vorher/Nachher). The developer can step/play frames, paint marks on them and answer; the answer arrives as a new message, ' +
      'the picture with their marks through unity_review_feedback. Render the files first (PNG). Keep each frame small ' +
      '(about 256–384 px wide, under 90 KB) so the pane can draw it inline; larger files are shown by path only.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short name, e.g. "Fuchs · Laufen".' },
        question: { type: 'string', description: 'What the developer should judge.' },
        groups: {
          type: 'array',
          description: 'One entry per direction/view; frames in playback order.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              frames: {
                type: 'array',
                items: { type: 'string' },
                description: 'PNG paths (absolute or repo-relative).',
              },
            },
            required: ['label', 'frames'],
          },
        },
      },
      required: ['title', 'groups'],
    },
  },
  {
    name: 'unity_review_feedback',
    description:
      'The developer\'s last answer from the Unity Review tab (viewer or "Problem melden"): the text, the picture they looked at ' +
      'and where their marks are (the marks are also saved as an SVG over the picture).',
  },
]

type ShowInput = { title?: unknown; question?: unknown; groups?: unknown }

/** Validates the tool input into viewer groups (absolute paths). */
export function showGroups(root: string, input: ShowInput): { label: string; frames: string[] }[] {
  if (!Array.isArray(input.groups)) return []
  const out: { label: string; frames: string[] }[] = []
  for (const g of input.groups.slice(0, 16)) {
    const o = g as { label?: unknown; frames?: unknown }
    const frames = Array.isArray(o?.frames)
      ? o.frames
          .filter((f): f is string => typeof f === 'string' && !!f.trim())
          .slice(0, 120)
          .map(f => resolvePath(root, f))
      : []
    if (frames.length)
      out.push({ label: typeof o.label === 'string' && o.label ? o.label : `Ansicht ${out.length + 1}`, frames })
  }
  return out
}

async function onShow($: EngineInterface, input: ShowInput): Promise<string> {
  const root = await $.session.root()
  const groups = showGroups(root, input)
  if (!groups.length) return 'Nothing shown: give at least one group with one PNG frame.'
  const title = typeof input.title === 'string' && input.title ? input.title : 'Ansehen'
  const question = typeof input.question === 'string' ? input.question : undefined
  await patchReview($, { view: newView('claude', `show-${Date.now()}`, title, question, groups), notice: undefined })
  void $.ui.toast(`Unity-Review: ${title} wartet auf dich`)
  const frames = groups.reduce((n, g) => n + g.frames.length, 0)
  return `Shown in the Unity pane (Review tab): ${groups.length} view(s), ${frames} frame(s). The developer's answer arrives as a message; then call unity_review_feedback for the marked picture.`
}

async function onFeedback($: EngineInterface): Promise<unknown> {
  const fb = (await readReview($)).feedback
  if (!fb) return 'No answer from the Review tab yet.'
  const b64 = fb.image ? await readBase64($, fb.image) : undefined
  if (!b64) return fb.image ? `${fb.text}\n(Picture not readable: ${fb.image})` : fb.text
  return [
    { type: 'text' as const, text: fb.text },
    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: b64 } },
  ]
}

/** A post of the paint overlay: a finished stroke or a playback tick. */
export async function onPaintMessage($: EngineInterface, data: unknown): Promise<void> {
  const d = data as { type?: unknown; pts?: unknown } | null
  if (d?.type === 'mark' && Array.isArray(d.pts))
    await patchReview($, s => (s.view ? { view: addMark(s.view, d.pts as [number, number][]) } : {}))
  else if (d?.type === 'tick')
    await patchReview($, s => {
      const v = s.view
      const n = v?.groups[v.group]?.frames.length ?? 0
      return v && v.playing && n > 1 ? { view: { ...v, frame: (v.frame + 1) % n } } : {}
    })
}

export function registerReview(on: On, _options: Options): void {
  on('tool.call', { tool: 'mcp__unity__unity_review_show' }, async ($, e) => ({
    result: await onShow($, e as unknown as ShowInput),
  })).catch(() => ({ deny: 'unity: review show failed.' }))

  on('tool.call', { tool: 'mcp__unity__unity_review_feedback' }, async $ => ({
    result: (await onFeedback($)) as never,
  })).catch(() => ({ deny: 'unity: review feedback failed.' }))

  on('ui.message', async ($, e, next) => {
    if (e.element !== 'rv-paint') return next(e)
    await onPaintMessage($, e.data)
    return {}
  })
}
