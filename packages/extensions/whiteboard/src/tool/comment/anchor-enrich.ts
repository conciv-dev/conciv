import {z} from 'zod'
import {loadResolver} from '../../anchor/load-resolver.js'

const PickAnchor = z.object({
  source: z.object({file: z.string(), line: z.number(), column: z.number().nullable().optional()}),
})

const AnchorSource = z.object({
  source: z.object({
    file: z.string().nullable().optional(),
    component: z.string().nullable().optional(),
    hash: z.string().nullable().optional(),
  }),
})

export type EnrichedAnchor = {anchor: unknown; file: string | null; component: string | null; hash: string | null}

const sourceOf = (anchor: unknown): {file: string | null; component: string | null; hash: string | null} => {
  const parsed = AnchorSource.safeParse(anchor)
  if (!parsed.success) return {file: null, component: null, hash: null}
  return {
    file: parsed.data.source.file ?? null,
    component: parsed.data.source.component ?? null,
    hash: parsed.data.source.hash ?? null,
  }
}

export const enrichAnchor = async (cwd: string, raw: unknown): Promise<EnrichedAnchor> => {
  const parsed = PickAnchor.safeParse(raw)
  const fallback = (): EnrichedAnchor => ({anchor: raw ?? null, ...sourceOf(raw)})
  if (!parsed.success || cwd === '') return fallback()
  try {
    const resolver = await loadResolver(cwd)
    const captured = await resolver.capture({
      file: parsed.data.source.file,
      line: parsed.data.source.line,
      column: parsed.data.source.column ?? 1,
    })
    return {
      anchor: captured,
      file: captured.source.file,
      component: captured.source.component,
      hash: captured.source.hash,
    }
  } catch {
    return fallback()
  }
}
