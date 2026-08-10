import {eq, inArray, notInArray} from 'drizzle-orm'
import type {PageCaptureBundle, SessionCaptures} from '@conciv/protocol/element-capture-types'
import type {ConcivDb} from './db.js'
import {cssBundles, toolCaptures} from './schema.js'

export async function writeToolCapture(
  db: ConcivDb,
  params: {sessionId: string; toolCallId: string; bundle: PageCaptureBundle},
): Promise<void> {
  const createdAt = Date.now()
  const {before, after} = params.bundle
  db.transaction((tx) => {
    for (const bundle of params.bundle.cssBundles ?? []) {
      tx.insert(cssBundles).values({hash: bundle.hash, css: bundle.css, createdAt}).onConflictDoNothing().run()
    }
    for (const capture of [before, after]) {
      if (capture === undefined) continue
      const row = {
        toolCallId: params.toolCallId,
        kind: capture.kind,
        sessionId: params.sessionId,
        cssBundleId: capture.cssBundleId ?? null,
        payload: capture,
        createdAt,
      }
      tx.insert(toolCaptures)
        .values(row)
        .onConflictDoUpdate({
          target: [toolCaptures.toolCallId, toolCaptures.kind, toolCaptures.sessionId],
          set: {cssBundleId: row.cssBundleId, payload: row.payload, createdAt: row.createdAt},
        })
        .run()
    }
  })
}

export async function sessionCaptures(db: ConcivDb, sessionId: string): Promise<SessionCaptures> {
  const rows = await db
    .select({
      toolCallId: toolCaptures.toolCallId,
      kind: toolCaptures.kind,
      payload: toolCaptures.payload,
      cssBundleId: toolCaptures.cssBundleId,
    })
    .from(toolCaptures)
    .where(eq(toolCaptures.sessionId, sessionId))
  const hashes = [...new Set(rows.flatMap((row) => (row.cssBundleId ? [row.cssBundleId] : [])))]
  const bundles =
    hashes.length === 0
      ? []
      : await db
          .select({hash: cssBundles.hash, css: cssBundles.css})
          .from(cssBundles)
          .where(inArray(cssBundles.hash, hashes))
  return {
    captures: rows.map((row) => ({toolCallId: row.toolCallId, kind: row.kind, capture: row.payload})),
    cssBundles: Object.fromEntries(bundles.map((bundle) => [bundle.hash, bundle.css])),
  }
}

export async function deleteSessionCaptures(db: ConcivDb, sessionId: string): Promise<void> {
  db.transaction((tx) => {
    tx.delete(toolCaptures).where(eq(toolCaptures.sessionId, sessionId)).run()
    const referenced = tx
      .selectDistinct({hash: toolCaptures.cssBundleId})
      .from(toolCaptures)
      .all()
      .flatMap((row) => (row.hash === null ? [] : [row.hash]))
    if (referenced.length === 0) {
      tx.delete(cssBundles).run()
      return
    }
    tx.delete(cssBundles).where(notInArray(cssBundles.hash, referenced)).run()
  })
}
