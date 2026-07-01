import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs-lite'
import {SessionRecordSchema, type SessionRecord, type SessionRecordInput} from '@conciv/protocol/chat-types'

// Domain interface — the only thing the rest of core imports. No storage primitives leak past it.
// Inputs accept raw (unbranded) data; the schema validates + brands it, so reads return SessionRecord.
export type SessionStore = {
  create(record: Omit<SessionRecordInput, 'createdAt' | 'updatedAt'>): Promise<SessionRecord>
  get(id: string): Promise<SessionRecord | null>
  update(id: string, patch: Partial<SessionRecordInput>): Promise<SessionRecord>
  delete(id: string): Promise<void>
  list(): Promise<SessionRecord[]>
  findByHarnessId(harnessSessionId: string): Promise<SessionRecord | null>
}

// `now` is injected so tests are deterministic and the store stays pure.
function makeStore(storage: Storage, now: () => number): SessionStore {
  // One promise chain per key serializes that session's read-modify-writes, so concurrent writes
  // (e.g. onSessionId token + turn-end usage) never tear a non-atomic fs file. This is the "atomic
  // per-session" guarantee; distinct sessions still proceed in parallel.
  const queues = new Map<string, Promise<unknown>>()
  const withKey = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const run = (queues.get(key) ?? Promise.resolve()).then(fn, fn)
    queues.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    )
    return run
  }
  const readRaw = async (id: string) => {
    const raw = await storage.getItem(id)
    return raw ? SessionRecordSchema.parse(raw) : null
  }
  const listAll = async () => {
    const keys = await storage.getKeys()
    const recs = await Promise.all(keys.map((k) => withKey(k, () => readRaw(k))))
    return recs.filter((r): r is SessionRecord => r !== null)
  }
  return {
    create: (input) => {
      const ts = now()
      const record = SessionRecordSchema.parse({...input, createdAt: ts, updatedAt: ts})
      return withKey(record.id, async () => {
        await storage.setItem(record.id, record)
        return record
      })
    },
    get: (id) => withKey(id, () => readRaw(id)),
    update: (id, patch) =>
      withKey(id, async () => {
        const cur = await readRaw(id)
        if (!cur) throw new Error(`session ${id} not found`)
        const next = SessionRecordSchema.parse({...cur, ...patch, id: cur.id, updatedAt: now()})
        await storage.setItem(id, next)
        return next
      }),
    delete: (id) => withKey(id, async () => void (await storage.removeItem(id))),
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

// fs: one file per session under <stateRoot>/.conciv/sessions/ — atomic per session.
export function createFsSessionStore(opts: {stateRoot: string; now?: () => number}): SessionStore {
  const storage = createStorage({
    driver: fsDriver({base: `${opts.stateRoot}/.conciv/sessions`}),
  })
  return createSessionStore(storage, opts.now ?? Date.now)
}
