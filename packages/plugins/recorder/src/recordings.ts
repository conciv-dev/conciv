import {randomUUID} from 'node:crypto'
import {mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import PQueue from 'p-queue'
import {z} from 'zod'
import {RrwebEventSchema, jsonByteLength, type RrwebEvent} from './protocol.js'

const StoredRecording = z.object({events: z.array(RrwebEventSchema)})
const MAX_RECORDINGS = 50
const MAX_RECORDING_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_RECORDING_BYTES = 200 * 1024 * 1024
const RECORDING_TTL_MS = 7 * 24 * 60 * 60 * 1000

type SaveResult =
  | {saved: true; recordingId: string; events: RrwebEvent[]}
  | {saved: false; error: 'too-large' | 'empty' | 'io-error'}

export type ReadResult = {kind: 'found'; events: RrwebEvent[]} | {kind: 'expired'} | {kind: 'missing'}

export type RecordingStore = {
  save: (events: RrwebEvent[]) => Promise<SaveResult>
  get: (id: string) => Promise<ReadResult>
  videoFile: (id: string) => string | null
  sweep: () => Promise<void>
}

const RECORDING_ID = /^[A-Za-z0-9-]+$/

const SAVED_RECORDING_ID = /^(\d+)-[0-9a-z]{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const MISSING: ReadResult = {kind: 'missing'}

const EXPIRED: ReadResult = {kind: 'expired'}

function isPastRetention(id: string): boolean {
  const savedAt = SAVED_RECORDING_ID.exec(id)?.[1]
  return savedAt !== undefined && Number(savedAt) <= Date.now() - RECORDING_TTL_MS
}

function readStored(raw: string): ReadResult {
  try {
    const parsed = StoredRecording.safeParse(JSON.parse(raw))
    return parsed.success ? {kind: 'found', events: parsed.data.events} : MISSING
  } catch {
    return MISSING
  }
}

function removeRecording(dir: string, name: string): Promise<void> {
  const video = join(dir, `${name.slice(0, -'.json'.length)}.webm`)
  return Promise.all([rm(join(dir, name), {force: true}), rm(video, {force: true})]).then(() => undefined)
}

function trimToCap(events: RrwebEvent[]): RrwebEvent[] | null {
  const snapshotIndexes = events.flatMap((event, index) => (event.type === 2 ? [index] : []))
  const starts = [...new Set([0, ...snapshotIndexes])]
  for (const start of starts) {
    const slice = events.slice(start)
    if (jsonByteLength({events: slice}) <= MAX_RECORDING_BYTES) return slice
  }
  return null
}

function parseTimestamp(name: string): number {
  const prefix = name.split('-')[0]
  const parsed = Number(prefix)
  return Number.isFinite(parsed) ? parsed : 0
}

async function listByRecency(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [])
  return names.filter((name) => name.endsWith('.json')).toSorted((a, b) => b.localeCompare(a))
}

async function prune(dir: string): Promise<void> {
  const names = await listByRecency(dir)
  const sized = await Promise.all(
    names.map(async (name) => ({name, bytes: (await stat(join(dir, name)).catch(() => null))?.size ?? 0})),
  )
  let total = 0
  const doomed = sized.filter((entry, index) => {
    total += entry.bytes
    return index >= MAX_RECORDINGS || total > MAX_TOTAL_RECORDING_BYTES
  })
  await Promise.all(doomed.map((entry) => removeRecording(dir, entry.name)))
}

async function clearStrayTmp(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => [])
  const strays = names.filter((name) => name.endsWith('.tmp'))
  await Promise.all(strays.map((name) => unlink(join(dir, name)).catch(() => {})))
}

export function createRecordingStore(dir: string): RecordingStore {
  let sequence = 0
  const changes = new PQueue({concurrency: 1})
  const publish = async (events: RrwebEvent[]): Promise<SaveResult> => {
    sequence += 1
    const recordingId = `${Date.now()}-${sequence.toString(36).padStart(6, '0')}-${randomUUID()}`
    const target = join(dir, `${recordingId}.json`)
    try {
      await mkdir(dir, {recursive: true})
      await writeFile(`${target}.tmp`, JSON.stringify({events}), 'utf8')
      await rename(`${target}.tmp`, target)
    } catch {
      await unlink(`${target}.tmp`).catch(() => {})
      return {saved: false, error: 'io-error'}
    }
    await prune(dir).catch((error: unknown) => {
      console.error(`[recorder] pruning old recordings failed: ${String(error)}`)
    })
    return {saved: true, recordingId, events}
  }
  return {
    async save(events) {
      if (events.length < 2) return {saved: false, error: 'empty'}
      const trimmed = trimToCap(events)
      if (!trimmed || trimmed.length < 2) return {saved: false, error: 'too-large'}
      return changes.add(() => publish(trimmed))
    },
    async get(id) {
      if (!RECORDING_ID.test(id)) return MISSING
      if (isPastRetention(id)) return EXPIRED
      const raw = await readFile(join(dir, `${id}.json`), 'utf8').catch(() => null)
      return raw === null ? MISSING : readStored(raw)
    },
    videoFile(id) {
      return RECORDING_ID.test(id) ? join(dir, `${id}.webm`) : null
    },
    sweep() {
      return changes.add(async () => {
        await clearStrayTmp(dir)
        const names = await listByRecency(dir)
        const cutoff = Date.now() - RECORDING_TTL_MS
        const expired = names.filter((name) => parseTimestamp(name) < cutoff)
        await Promise.all(expired.map((name) => removeRecording(dir, name)))
        await prune(dir)
      })
    },
  }
}
