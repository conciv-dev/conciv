import {Effect} from 'effect'
import {z} from 'zod'
import type {SourceUnreadable} from './anchor-confine.js'
import type {AnchorResolver} from './anchor-resolver.js'

export type LoadResolver = Effect.Effect<AnchorResolver, SourceUnreadable>

const PickAnchor = z.looseObject({
  source: z.object({file: z.string(), line: z.number(), column: z.number().nullable().optional()}),
})

const AnchorSource = z.object({
  source: z.object({
    file: z.string().nullable().optional(),
    component: z.string().nullable().optional(),
    hash: z.string().nullable().optional(),
  }),
})

type EnrichedAnchor = {anchor: unknown; file: string | null; component: string | null; hash: string | null}

const readSource = (anchor: unknown): {file: string | null; component: string | null; hash: string | null} => {
  const parsed = AnchorSource.safeParse(anchor)
  if (!parsed.success) return {file: null, component: null, hash: null}
  return {
    file: parsed.data.source.file ?? null,
    component: parsed.data.source.component ?? null,
    hash: parsed.data.source.hash ?? null,
  }
}

export const enrichAnchor = Effect.fn('whiteboard.anchor.enrich')(function* (resolver: LoadResolver, raw: unknown) {
  const parsed = PickAnchor.safeParse(raw)
  const fallback: EnrichedAnchor = {anchor: raw ?? null, ...readSource(raw)}
  if (!parsed.success) return fallback
  return yield* resolver.pipe(
    Effect.flatMap((loaded) =>
      loaded.capture({
        file: parsed.data.source.file,
        line: parsed.data.source.line,
        column: parsed.data.source.column ?? 1,
      }),
    ),
    Effect.map((captured): EnrichedAnchor => ({
      anchor: {...parsed.data, ...captured},
      file: captured.source.file,
      component: captured.source.component,
      hash: captured.source.hash,
    })),
    Effect.catchTag('SourceUnreadable', () => Effect.succeed(fallback)),
  )
})
