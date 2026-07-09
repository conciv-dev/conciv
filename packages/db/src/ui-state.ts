import {randomUUID} from 'node:crypto'
import {asc, eq} from 'drizzle-orm'
import type {DraftRow, MarkerRow} from '@conciv/contract'
import type {ConcivDb} from './db.js'
import {drafts, markers} from './schema.js'

export type UiState = {
  getDraft: (sessionId: string) => Promise<DraftRow | null>
  setDraft: (input: Omit<DraftRow, 'updatedAt'>) => Promise<void>
  clearDraft: (sessionId: string) => Promise<void>
  listMarkers: (sessionId: string) => Promise<MarkerRow[]>
  addMarker: (input: Omit<MarkerRow, 'id'>) => Promise<MarkerRow>
  deleteFor: (sessionId: string) => Promise<void>
  watch: (listener: () => void) => () => void
}

export function makeUiState(db: ConcivDb, now: () => number = Date.now): UiState {
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())
  return {
    getDraft: async (sessionId) => {
      const rows = await db.select().from(drafts).where(eq(drafts.sessionId, sessionId))
      return rows[0] ?? null
    },
    setDraft: async (input) => {
      const row = {...input, updatedAt: now()}
      await db.insert(drafts).values(row).onConflictDoUpdate({target: drafts.sessionId, set: row})
      emit()
    },
    clearDraft: async (sessionId) => {
      await db.delete(drafts).where(eq(drafts.sessionId, sessionId))
      emit()
    },
    listMarkers: async (sessionId) =>
      db.select().from(markers).where(eq(markers.sessionId, sessionId)).orderBy(asc(markers.afterTurn)),
    addMarker: async (input) => {
      const row = {...input, id: randomUUID()}
      await db.insert(markers).values(row)
      emit()
      return row
    },
    deleteFor: async (sessionId) => {
      await db.delete(drafts).where(eq(drafts.sessionId, sessionId))
      await db.delete(markers).where(eq(markers.sessionId, sessionId))
      emit()
    },
    watch: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
