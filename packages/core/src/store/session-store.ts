import {type Storage} from 'unstorage'
import {SessionRecordSchema, type SessionRecord, type SessionRecordInput} from '@conciv/protocol/chat-types'

export type SessionStore = {
  create(record: Omit<SessionRecordInput, 'createdAt' | 'updatedAt'>): Promise<SessionRecord>
  get(id: string): Promise<SessionRecord | null>
  update(id: string, patch: Partial<SessionRecordInput>): Promise<SessionRecord>
  delete(id: string): Promise<void>
  list(): Promise<SessionRecord[]>
  findByHarnessId(harnessSessionId: string): Promise<SessionRecord | null>
}

function makeStore(storage: Storage, now: () => number): SessionStore {
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

export function createSessionStore(storage: Storage, now: () => number = Date.now): SessionStore {
  return makeStore(storage, now)
}
