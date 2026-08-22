import {asc, eq} from 'drizzle-orm'
import type {ConcivDb} from './db.js'
import {pageChanges} from './schema.js'

export type PageChangeEntry = {
  seq: number
  ts: number
  verb: string
  ref?: string
  selector?: string
  args: Record<string, unknown>
}

export async function appendPageChange(
  db: ConcivDb,
  sessionId: string,
  entry: Omit<PageChangeEntry, 'seq' | 'ts'>,
  ts: number,
): Promise<PageChangeEntry> {
  const rows = await db
    .insert(pageChanges)
    .values({
      sessionId,
      verb: entry.verb,
      ref: entry.ref ?? null,
      selector: entry.selector ?? null,
      args: entry.args,
      createdAt: ts,
    })
    .returning({id: pageChanges.id})
  const inserted = rows[0]
  if (!inserted) throw new Error('the page change insert reported no row')
  return {seq: inserted.id, ts, verb: entry.verb, ref: entry.ref, selector: entry.selector, args: entry.args}
}

export async function pageChangesFor(db: ConcivDb, sessionId: string): Promise<PageChangeEntry[]> {
  const rows = await db
    .select()
    .from(pageChanges)
    .where(eq(pageChanges.sessionId, sessionId))
    .orderBy(asc(pageChanges.id))
  return rows.map((row) => ({
    seq: row.id,
    ts: row.createdAt,
    verb: row.verb,
    ref: row.ref ?? undefined,
    selector: row.selector ?? undefined,
    args: row.args,
  }))
}

export async function clearPageChanges(db: ConcivDb, sessionId: string): Promise<void> {
  await db.delete(pageChanges).where(eq(pageChanges.sessionId, sessionId))
}
