import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs-lite'
import {SessionRecordSchema, type SessionRecord} from '@aidx/protocol/chat-types'

// Domain interface — the only thing the rest of core imports. No storage primitives leak past it.
export type SessionStore = {
  create(record: Omit<SessionRecord, 'createdAt' | 'updatedAt'>): Promise<SessionRecord>
  get(id: string): Promise<SessionRecord | null>
  update(id: string, patch: Partial<SessionRecord>): Promise<SessionRecord>
  delete(id: string): Promise<void>
  list(): Promise<SessionRecord[]>
  findByHarnessId(harnessSessionId: string): Promise<SessionRecord | null>
}

// `now` is injected so tests are deterministic and the store stays pure.
function makeStore(storage: Storage, now: () => number): SessionStore {
  const read = async (id: string) => {
    const raw = await storage.getItem(id)
    return raw ? SessionRecordSchema.parse(raw) : null
  }
  const listAll = async () => {
    const keys = await storage.getKeys()
    const recs = await Promise.all(keys.map((k) => read(k)))
    return recs.filter((r): r is SessionRecord => r !== null)
  }
  return {
    create: async (input) => {
      const ts = now()
      const record = SessionRecordSchema.parse({...input, createdAt: ts, updatedAt: ts})
      await storage.setItem(record.id, record)
      return record
    },
    get: read,
    update: async (id, patch) => {
      const cur = await read(id)
      if (!cur) throw new Error(`session ${id} not found`)
      const next = SessionRecordSchema.parse({...cur, ...patch, id: cur.id, updatedAt: now()})
      await storage.setItem(id, next)
      return next
    },
    delete: async (id) => {
      await storage.removeItem(id)
    },
    list: listAll,
    findByHarnessId: async (harnessSessionId) =>
      (await listAll()).find((r) => r.harnessSessionId === harnessSessionId) ?? null,
  }
}

// Build a store over any unstorage backend — the seam where the driver swaps (fs in prod, memory or
// sqlite/redis later) without any caller or the domain interface changing.
export function createSessionStore(storage: Storage, now: () => number = Date.now): SessionStore {
  return makeStore(storage, now)
}

// fs: one file per session under <stateRoot>/.aidx/sessions/<previewId>/ — atomic per session.
export function createFsSessionStore(opts: {stateRoot: string; previewId: string; now?: () => number}): SessionStore {
  const storage = createStorage<SessionRecord>({
    driver: fsDriver({base: `${opts.stateRoot}/.aidx/sessions/${opts.previewId}`}),
  })
  return createSessionStore(storage, opts.now ?? Date.now)
}
