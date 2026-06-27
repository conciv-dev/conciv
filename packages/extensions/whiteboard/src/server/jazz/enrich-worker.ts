import {z} from 'zod'
import {RowChangeKind, type JsonValue} from 'jazz-tools'
import type {Db} from 'jazz-tools/backend'
import {app} from '../../shared/schema.js'
import {enrichAnchor} from '../../tool/comment/anchor-enrich.js'

const SourceAnchor = z.object({source: z.object({file: z.string()})})

async function enrichRow(db: Db, cwd: string, id: string, anchor: JsonValue): Promise<void> {
  const enriched = await enrichAnchor(cwd, anchor)
  if (!enriched.hash) return
  await db
    .update(app.comments, id, {
      anchor: (enriched.anchor ?? undefined) as JsonValue,
      anchorFile: enriched.file ?? undefined,
      anchorComponent: enriched.component ?? undefined,
      anchorHash: enriched.hash,
      updatedAt: new Date(),
    })
    .wait({tier: 'edge'})
}

export function startCommentEnrichment(db: Db, cwd: string): () => void {
  const attempted = new Set<string>()
  return db.subscribeAll(app.comments.where({kind: 'source-linked'}), (delta) => {
    delta.delta.forEach((change) => {
      if (change.kind === RowChangeKind.Removed) return void attempted.delete(change.id)
      const row = change.item
      if (!row || attempted.has(row.id) || row.anchorHash) return
      if (!SourceAnchor.safeParse(row.anchor).success) return
      attempted.add(row.id)
      void enrichRow(db, cwd, row.id, row.anchor as JsonValue)
    })
  })
}
