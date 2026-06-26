import {z} from 'zod'
import type {LiveDb} from '../../shared/db-types.js'
import type {SnapshotStore} from '../../shared/sync-types.js'

const SnapshotSchema = z.object({cid: z.string(), ybin: z.string()})
type Snapshot = z.infer<typeof SnapshotSchema>

export function createSnapshotStore(db: LiveDb): SnapshotStore {
  const snapshots = db.collection<Snapshot>('canvas_snapshots', {
    schema: SnapshotSchema,
    columns: 'ybin TEXT NOT NULL',
  })
  return {
    load: async (room) => {
      const [row] = await snapshots.query({cid: room})
      if (!row) return null
      return new Uint8Array(Buffer.from(row.ybin, 'base64'))
    },
    save: async (room, ybin) => {
      const value = Buffer.from(ybin).toString('base64')
      const [existing] = await snapshots.query({cid: room})
      if (existing) {
        await snapshots.update(room, {ybin: value})
        return
      }
      await snapshots.insert({cid: room, ybin: value})
    },
  }
}

export function createMemorySnapshotStore(): SnapshotStore {
  const store = new Map<string, Uint8Array>()
  return {
    load: async (room) => store.get(room) ?? null,
    save: async (room, ybin) => void store.set(room, ybin),
  }
}
