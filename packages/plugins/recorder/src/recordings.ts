export * as RecordingStoreModel from './recordings.js'
import {Clock, Context, Effect, FileSystem, Layer, Path, Ref, Semaphore, Schema} from 'effect'
import {z} from 'zod'
import {RrwebEventSchema, jsonByteLength, type RrwebEvent} from './rpc.js'

const StoredRecording = z.object({events: z.array(RrwebEventSchema)})
const MAX_RECORDINGS = 50
const MAX_RECORDING_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_RECORDING_BYTES = 200 * 1024 * 1024
const RECORDING_TTL_MS = 7 * 24 * 60 * 60 * 1000
const RECORDING_ID = /^[A-Za-z0-9-]+$/

const SAVED_RECORDING_ID = /^(\d+)-[0-9a-z]{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type SaveResult =
  | {saved: true; recordingId: string; events: RrwebEvent[]}
  | {saved: false; error: 'too-large' | 'empty' | 'io-error'}

const RecordingNotFound = Schema.TaggedStruct('RecorderRecordingNotFound', {id: Schema.String})
type RecordingNotFound = typeof RecordingNotFound.Type

const RecordingExpired = Schema.TaggedStruct('RecorderRecordingExpired', {id: Schema.String})
type RecordingExpired = typeof RecordingExpired.Type

type RecordingStoreInterface = {
  readonly save: (events: RrwebEvent[]) => Effect.Effect<SaveResult>
  readonly get: (id: string) => Effect.Effect<RrwebEvent[], RecordingNotFound | RecordingExpired>
  readonly videoFile: (id: string) => Effect.Effect<string, RecordingNotFound>
  readonly sweep: Effect.Effect<void>
}

export const RecordingStore = Context.Service<RecordingStoreInterface>('@conciv/plugin-recorder/RecordingStore')

function trimToCap(events: RrwebEvent[]): RrwebEvent[] | undefined {
  const snapshotIndexes = events.flatMap((event, index) => (event.type === 2 ? [index] : []))
  return [0, ...snapshotIndexes.filter((index) => index > 0)]
    .map((start) => events.slice(start))
    .find((slice) => jsonByteLength({events: slice}) <= MAX_RECORDING_BYTES)
}

function parseTimestamp(name: string): number {
  const parsed = Number(name.split('-')[0])
  return Number.isFinite(parsed) ? parsed : 0
}

function isPastRetention(id: string, now: number): boolean {
  const savedAt = SAVED_RECORDING_ID.exec(id)?.[1]
  return savedAt !== undefined && Number(savedAt) <= now - RECORDING_TTL_MS
}

function decodeRecording(raw: string): RrwebEvent[] | undefined {
  const parsed = StoredRecording.safeParse(JSON.parse(raw))
  return parsed.success ? parsed.data.events : undefined
}

export function recordingStoreLayer(directory: string) {
  return Layer.effect(
    RecordingStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const changes = yield* Semaphore.make(1)
      const sequence = yield* Ref.make(0)

      const remove = (name: string) =>
        Effect.all(
          [
            fs.remove(path.join(directory, name), {force: true}),
            fs.remove(path.join(directory, `${name.slice(0, -'.json'.length)}.webm`), {force: true}),
          ],
          {discard: true},
        )

      const listByRecency = fs.readDirectory(directory).pipe(
        Effect.orElseSucceed((): readonly string[] => []),
        Effect.map((names) => names.filter((name) => name.endsWith('.json')).toSorted((a, b) => b.localeCompare(a))),
      )

      const prune = Effect.gen(function* () {
        const names = yield* listByRecency
        const sized = yield* Effect.forEach(names, (name) =>
          fs.stat(path.join(directory, name)).pipe(
            Effect.map((info) => ({name, bytes: Number(info.size)})),
            Effect.orElseSucceed(() => ({name, bytes: 0})),
          ),
        )
        const doomed = sized.reduce<{total: number; names: string[]}>(
          (kept, entry, index) => {
            const total = kept.total + entry.bytes
            const drop = index >= MAX_RECORDINGS || total > MAX_TOTAL_RECORDING_BYTES
            return {total, names: drop ? [...kept.names, entry.name] : kept.names}
          },
          {total: 0, names: []},
        )
        yield* Effect.forEach(doomed.names, remove, {discard: true})
      })

      const publish = Effect.fn('recorder.recordings.publish')(function* (events: RrwebEvent[]) {
        const now = yield* Clock.currentTimeMillis
        const count = yield* Ref.updateAndGet(sequence, (value) => value + 1)
        const recordingId = `${now}-${count.toString(36).padStart(6, '0')}-${crypto.randomUUID()}`
        const target = path.join(directory, `${recordingId}.json`)
        const written = yield* fs.makeDirectory(directory, {recursive: true}).pipe(
          Effect.andThen(fs.writeFileString(`${target}.tmp`, JSON.stringify({events}))),
          Effect.andThen(fs.rename(`${target}.tmp`, target)),
          Effect.as(true),
          Effect.catch(() => Effect.as(fs.remove(`${target}.tmp`, {force: true}).pipe(Effect.ignore), false)),
        )
        if (!written) return {saved: false, error: 'io-error'} satisfies SaveResult
        yield* prune.pipe(Effect.catch((error) => Effect.logError('pruning old recordings failed', error)))
        return {saved: true, recordingId, events} satisfies SaveResult
      })

      const clearStrayTmp = Effect.gen(function* () {
        const names = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed((): readonly string[] => []))
        const strays = names.filter((name) => name.endsWith('.tmp'))
        yield* Effect.forEach(strays, (name) => fs.remove(path.join(directory, name)).pipe(Effect.ignore), {
          discard: true,
        })
      })

      const sweep = Effect.gen(function* () {
        yield* clearStrayTmp
        const names = yield* listByRecency
        const cutoff = (yield* Clock.currentTimeMillis) - RECORDING_TTL_MS
        yield* Effect.forEach(
          names.filter((name) => parseTimestamp(name) < cutoff),
          remove,
          {discard: true},
        )
        yield* prune
      })

      return RecordingStore.of({
        save: (events) => {
          if (events.length < 2) return Effect.succeed({saved: false, error: 'empty'})
          const trimmed = trimToCap(events)
          if (!trimmed || trimmed.length < 2) return Effect.succeed({saved: false, error: 'too-large'})
          return changes.withPermits(1)(publish(trimmed))
        },
        get: (id) =>
          Effect.gen(function* () {
            if (!RECORDING_ID.test(id)) return yield* Effect.fail(RecordingNotFound.make({id}))
            if (isPastRetention(id, yield* Clock.currentTimeMillis))
              return yield* Effect.fail(RecordingExpired.make({id}))
            const raw = yield* fs
              .readFileString(path.join(directory, `${id}.json`))
              .pipe(Effect.mapError(() => RecordingNotFound.make({id})))
            const events = yield* Effect.try({
              try: () => decodeRecording(raw),
              catch: () => RecordingNotFound.make({id}),
            })
            if (!events) return yield* Effect.fail(RecordingNotFound.make({id}))
            return events
          }),
        videoFile: (id) =>
          RECORDING_ID.test(id)
            ? Effect.succeed(path.join(directory, `${id}.webm`))
            : Effect.fail(RecordingNotFound.make({id})),
        sweep: changes.withPermits(1)(
          sweep.pipe(Effect.catch((error) => Effect.logError('sweeping old recordings failed', error))),
        ),
      })
    }),
  )
}
