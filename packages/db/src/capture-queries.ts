import {eq, inArray, notInArray} from 'drizzle-orm'
import type {PageCaptureBundle, SessionCaptures} from '@conciv/protocol/element-capture-types'
import type {ConcivDb} from './db.js'
import {cssBundles, toolCaptures} from './schema.js'

export async function writeToolCapture(
  db: ConcivDb,
  params: {sessionId: string; toolCallId: string; bundle: PageCaptureBundle},
): Promise<void> {
  const createdAt = Date.now()
  const {before, after, cssBundle} = params.bundle
  if (cssBundle !== undefined) {
    await db
      .insert(cssBundles)
      .values({hash: cssBundle.hash, sessionId: params.sessionId, css: cssBundle.css, createdAt})
      .onConflictDoNothing()
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
    await db
      .insert(toolCaptures)
      .values(row)
      .onConflictDoUpdate({
        target: [toolCaptures.toolCallId, toolCaptures.kind],
        set: {sessionId: row.sessionId, cssBundleId: row.cssBundleId, payload: row.payload, createdAt: row.createdAt},
      })
  }
}

export async function sessionCaptures(db: ConcivDb, sessionId: string): Promise<SessionCaptures> {
  const rows = await db
    .select({toolCallId: toolCaptures.toolCallId, kind: toolCaptures.kind, payload: toolCaptures.payload})
    .from(toolCaptures)
    .where(eq(toolCaptures.sessionId, sessionId))
  const hashes = [...new Set(rows.flatMap((row) => (row.payload.cssBundleId ? [row.payload.cssBundleId] : [])))]
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
  await db.delete(toolCaptures).where(eq(toolCaptures.sessionId, sessionId))
  const referenced = (await db.selectDistinct({hash: toolCaptures.cssBundleId}).from(toolCaptures)).flatMap((row) =>
    row.hash === null ? [] : [row.hash],
  )
  if (referenced.length === 0) {
    await db.delete(cssBundles)
    return
  }
  await db.delete(cssBundles).where(notInArray(cssBundles.hash, referenced))
}
