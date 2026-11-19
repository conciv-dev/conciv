import {eq, inArray, notInArray} from 'drizzle-orm'
import {Effect} from 'effect'
import type {PageCaptureBundle, SessionCaptures} from '@conciv/protocol/element-capture-types'
import type {ConcivDb} from './db.js'
import {cssBundles, toolCaptures} from './schema.js'

export async function writeToolCapture(
  db: ConcivDb,
  params: {sessionId: string; toolCallId: string; bundle: PageCaptureBundle},
): Promise<void> {
  const createdAt = Date.now()
  const {before, after} = params.bundle
  const captures = [before, after].flatMap((capture) => (capture === undefined ? [] : [capture]))
  await Effect.runPromise(
    db.transaction((tx) =>
      Effect.gen(function* () {
        yield* Effect.forEach(params.bundle.cssBundles ?? [], (bundle) =>
          tx.insert(cssBundles).values({hash: bundle.hash, css: bundle.css, createdAt}).onConflictDoNothing(),
        )
        yield* Effect.forEach(captures, (capture) => {
          const row = {
            toolCallId: params.toolCallId,
            kind: capture.kind,
            sessionId: params.sessionId,
            cssBundleId: capture.cssBundleId ?? null,
            payload: capture,
            createdAt,
          }
          return tx
            .insert(toolCaptures)
            .values(row)
            .onConflictDoUpdate({
              target: [toolCaptures.toolCallId, toolCaptures.kind, toolCaptures.sessionId],
              set: {cssBundleId: row.cssBundleId, payload: row.payload, createdAt: row.createdAt},
            })
        })
      }),
    ),
  )
}

export async function sessionCaptures(db: ConcivDb, sessionId: string): Promise<SessionCaptures> {
  const rows = await Effect.runPromise(
    db
      .select({
        toolCallId: toolCaptures.toolCallId,
        kind: toolCaptures.kind,
        payload: toolCaptures.payload,
        cssBundleId: toolCaptures.cssBundleId,
      })
      .from(toolCaptures)
      .where(eq(toolCaptures.sessionId, sessionId)),
  )
  const hashes = [...new Set(rows.flatMap((row) => (row.cssBundleId ? [row.cssBundleId] : [])))]
  const bundles =
    hashes.length === 0
      ? []
      : await Effect.runPromise(
          db
            .select({hash: cssBundles.hash, css: cssBundles.css})
            .from(cssBundles)
            .where(inArray(cssBundles.hash, hashes)),
        )
  return {
    captures: rows.map((row) => ({toolCallId: row.toolCallId, kind: row.kind, capture: row.payload})),
    cssBundles: Object.fromEntries(bundles.map((bundle) => [bundle.hash, bundle.css])),
  }
}

export async function deleteSessionCaptures(db: ConcivDb, sessionId: string): Promise<void> {
  await Effect.runPromise(
    db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.delete(toolCaptures).where(eq(toolCaptures.sessionId, sessionId))
        const rows = yield* tx.selectDistinct({hash: toolCaptures.cssBundleId}).from(toolCaptures)
        const referenced = rows.flatMap((row) => (row.hash === null ? [] : [row.hash]))
        if (referenced.length === 0) {
          yield* tx.delete(cssBundles)
          return
        }
        yield* tx.delete(cssBundles).where(notInArray(cssBundles.hash, referenced))
      }),
    ),
  )
}
