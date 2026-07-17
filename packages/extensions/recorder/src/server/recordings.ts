import {randomUUID} from 'node:crypto'
import {mkdir, readFile, readdir, rename, stat, unlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'
import {RrwebEventSchema, type RrwebEvent} from '../shared/protocol.js'

const StoredRecording = z.object({events: z.array(RrwebEventSchema)})
const MAX_RECORDINGS = 50
const MAX_RECORDING_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_RECORDING_BYTES = 200 * 1024 * 1024
const RECORDING_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type SaveResult = {ok: true; recordingId: string} | {ok: false; reason: 'too-large' | 'empty' | 'io-error'}

export type RecordingStore = {
  save: (events: RrwebEvent[]) => Promise<SaveResult>
  get: (id: string) => Promise<RrwebEvent[] | null>
  sweep: () => Promise<void>
}

function trimToCap(events: RrwebEvent[]): RrwebEvent[] | null {
  const snapshotIndexes = events.flatMap((event, index) => (event.type === 2 ? [index] : []))
  const starts = [0, ...snapshotIndexes]
  for (let cursor = starts.length - 1; cursor >= 0; cursor -= 1) {
    const start = starts[cursor]
    if (start === undefined) continue
    const slice = events.slice(start)
    if (JSON.stringify({events: slice}).length <= MAX_RECORDING_BYTES) return slice
    if (cursor === starts.length - 1) return null
  }
  return null
}

function timestampOf(name: string): number {
  const prefix = name.split('-')[0]
  const parsed = Number(prefix)
  return Number.isFinite(parsed) ? parsed : 0
}

async function listByRecency(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [])
  return names.filter((name) => name.endsWith('.json')).toSorted((a, b) => b.localeCompare(a))
}

async function prune(dir: string, reserved: {bytes: number; count: number}): Promise<void> {
  const names = await listByRecency(dir)
  const sized = await Promise.all(
    names.map(async (name) => ({name, bytes: (await stat(join(dir, name)).catch(() => null))?.size ?? 0})),
  )
  let total = reserved.bytes
  const doomed = sized.filter((entry, index) => {
    total += entry.bytes
    return index + reserved.count >= MAX_RECORDINGS || total > MAX_TOTAL_RECORDING_BYTES
  })
  await Promise.all(doomed.map((entry) => unlink(join(dir, entry.name)).catch(() => {})))
}

async function clearStrayTmp(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => [])
  const strays = names.filter((name) => name.endsWith('.tmp'))
  await Promise.all(strays.map((name) => unlink(join(dir, name)).catch(() => {})))
}

export function createRecordingStore(dir: string): RecordingStore {
  let sequence = 0
  return {
    async save(events) {
      if (events.length < 2) return {ok: false, reason: 'empty'}
      const trimmed = trimToCap(events)
      if (!trimmed || trimmed.length < 2) return {ok: false, reason: 'too-large'}
      const payload = JSON.stringify({events: trimmed})
      try {
        await mkdir(dir, {recursive: true})
        await prune(dir, {bytes: payload.length, count: 1})
        sequence += 1
        const recordingId = `${Date.now()}-${sequence.toString(36).padStart(6, '0')}-${randomUUID()}`
        const target = join(dir, `${recordingId}.json`)
        await writeFile(`${target}.tmp`, payload, 'utf8')
        await rename(`${target}.tmp`, target)
        return {ok: true, recordingId}
      } catch {
        return {ok: false, reason: 'io-error'}
      }
    },
    async get(id) {
      if (!/^[A-Za-z0-9-]+$/.test(id)) return null
      const raw = await readFile(join(dir, `${id}.json`), 'utf8').catch(() => null)
      if (raw === null) return null
      try {
        const parsed = StoredRecording.safeParse(JSON.parse(raw))
        return parsed.success ? parsed.data.events : null
      } catch {
        return null
      }
    },
    async sweep() {
      await clearStrayTmp(dir)
      const names = await listByRecency(dir)
      const cutoff = Date.now() - RECORDING_TTL_MS
      const expired = names.filter((name) => timestampOf(name) < cutoff)
      await Promise.all(expired.map((name) => unlink(join(dir, name)).catch(() => {})))
      await prune(dir, {bytes: 0, count: 0})
    },
  }
}
