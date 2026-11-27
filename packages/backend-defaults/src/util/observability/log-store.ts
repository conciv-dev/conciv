import {and, desc, gte, inArray, like, lt, lte, or, eq, type SQL} from 'drizzle-orm'
import {Context, Cron, Deferred, Effect, Layer, PubSub, Result, Schedule, Stream} from 'effect'
import type {DrainContext, WideEvent} from 'evlog'
import {createDrainPipeline} from 'evlog/pipeline'
import {z} from 'zod'
import type {Retention} from '@conciv/types/config-types'
import type {ConcivDb} from '../../db/connection.js'
import {logEvents} from '../../db/schema.js'

export type LogRow = typeof logEvents.$inferSelect

export type EventLevel = WideEvent['level']

export type LogQuery = {
  readonly since?: string | undefined
  readonly until?: string | undefined
  readonly level?: readonly EventLevel[] | undefined
  readonly source?: 'engine' | 'client' | undefined
  readonly text?: string | undefined
  readonly sessionId?: string | undefined
  readonly limit: number
}

export type CleanupResult = {readonly result: 'success' | 'error'; readonly deleted: number}

export interface Interface {
  readonly drain: (event: WideEvent) => void
  readonly bind: (db: ConcivDb) => Effect.Effect<void>
  readonly query: (input: LogQuery) => Effect.Effect<readonly LogRow[]>
  readonly tail: Stream.Stream<LogRow>
  readonly cleanup: Effect.Effect<CleanupResult>
  readonly dropped: () => number
}

export const Service = Context.Service<Interface>('@conciv/LogStore')

const INDEXED_FIELDS: readonly string[] = [
  'timestamp',
  'level',
  'service',
  'environment',
  'message',
  'method',
  'path',
  'status',
  'durationMs',
  'duration',
  'requestId',
  'source',
  'sessionId',
  'error',
]

function coalesceString(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null
}

function parseDurationMs(event: WideEvent): number | null {
  if (typeof event.durationMs === 'number') return event.durationMs
  if (typeof event.duration === 'number') return event.duration
  if (typeof event.duration !== 'string') return null
  const [, ms] = /^([\d.]+)\s*ms$/.exec(event.duration) ?? []
  if (ms !== undefined) return Math.round(Number.parseFloat(ms))
  const [, seconds] = /^([\d.]+)\s*s$/.exec(event.duration) ?? []
  return seconds === undefined ? null : Math.round(Number.parseFloat(seconds) * 1000)
}

function errorText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function extractRow(context: DrainContext): LogRow {
  const {event, request} = context
  const data = Object.fromEntries(
    Object.entries(event).filter(([key, value]) => !INDEXED_FIELDS.includes(key) && value !== undefined),
  )
  return {
    id: crypto.randomUUID(),
    timestamp: event.timestamp,
    level: event.level,
    service: event.service,
    environment: event.environment,
    message: coalesceString(event.message),
    method: coalesceString(request?.method, event.method),
    path: coalesceString(request?.path, event.path),
    status: typeof event.status === 'number' ? event.status : null,
    durationMs: parseDurationMs(event),
    requestId: coalesceString(request?.requestId, event.requestId),
    source: coalesceString(event.source),
    sessionId: coalesceString(event.sessionId),
    error: errorText(event.error),
    data: Object.keys(data).length > 0 ? JSON.stringify(data) : null,
    createdAt: new Date().toISOString(),
  }
}

const SQLITE_BUSY = 5

const BusyError = z.union([
  z.object({errcode: z.literal(SQLITE_BUSY)}),
  z.object({code: z.literal('SQLITE_BUSY')}),
  z.object({message: z.string().regex(/SQLITE_BUSY|database is locked/)}),
])

const Caused = z.object({cause: z.unknown()})

function isBusy(error: unknown, depth = 0): boolean {
  if (BusyError.safeParse(error).success) return true
  const caused = Caused.safeParse(error)
  return caused.success && depth < 8 && isBusy(caused.data.cause, depth + 1)
}

export function retentionToCron(retention: Retention): string {
  const halfMinutes = Math.max(1, Math.floor(retention.totalMinutes / 2))
  if (halfMinutes < 60) return `*/${halfMinutes} * * * *`
  const halfHours = Math.floor(halfMinutes / 60)
  if (halfHours >= 24) return '0 3 * * *'
  return `0 */${halfHours} * * *`
}

function queryWhere(input: LogQuery): SQL | undefined {
  const text = input.text === undefined ? undefined : `%${input.text}%`
  return and(
    input.since === undefined ? undefined : gte(logEvents.timestamp, input.since),
    input.until === undefined ? undefined : lte(logEvents.timestamp, input.until),
    input.level === undefined || input.level.length === 0 ? undefined : inArray(logEvents.level, [...input.level]),
    input.source === undefined ? undefined : eq(logEvents.source, input.source),
    input.sessionId === undefined ? undefined : eq(logEvents.sessionId, input.sessionId),
    text === undefined ? undefined : or(like(logEvents.message, text), like(logEvents.data, text)),
  )
}

const FLUSH_WAIT = '2 seconds'

export function layer(retention: Retention) {
  return Layer.effect(
    Service,
    Effect.gen(function* () {
      const ready = yield* Deferred.make<ConcivDb>()
      const inserted = yield* PubSub.unbounded<LogRow>()
      const counts = {dropped: 0}
      const services = yield* Effect.context<never>()
      const run = Effect.runPromiseWith(services)

      const insert = (db: ConcivDb, rows: LogRow[]) =>
        db
          .insert(logEvents)
          .values(rows)
          .pipe(Effect.retry({schedule: Schedule.exponential('500 millis'), times: 2, while: (error) => isBusy(error)}))

      const store = (batch: DrainContext[]) =>
        Effect.gen(function* () {
          if (batch.length === 0) return
          const db = yield* Deferred.await(ready)
          const rows = batch.map(extractRow)
          const written = yield* insert(db, rows).pipe(Effect.result)
          if (Result.isFailure(written)) {
            counts.dropped += rows.length
            return
          }
          yield* PubSub.publishAll(inserted, rows)
        })

      const batches = createDrainPipeline<DrainContext>({
        onDropped: (events) => {
          counts.dropped += events.length
        },
      })((batch) => run(store(batch)))

      yield* Effect.addFinalizer(() =>
        Deferred.isDone(ready).pipe(
          Effect.flatMap((bound) =>
            bound ? Effect.promise(() => batches.flush()).pipe(Effect.timeout(FLUSH_WAIT), Effect.ignore) : Effect.void,
          ),
        ),
      )

      const cleanup = Effect.gen(function* () {
        const db = yield* Deferred.await(ready)
        const cutoff = new Date(Date.now() - retention.totalMs).toISOString()
        const deleted = yield* db.delete(logEvents).where(lt(logEvents.createdAt, cutoff)).returning({id: logEvents.id})
        yield* Effect.logDebug('[logs] cleanup deleted the logs older than the retention').pipe(
          Effect.annotateLogs({retentionMinutes: retention.totalMinutes, cutoff, deleted: deleted.length}),
        )
        return {result: 'success', deleted: deleted.length} satisfies CleanupResult
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning('[logs] the cleanup of the stored logs failed').pipe(
            Effect.annotateLogs({error}),
            Effect.as({result: 'error', deleted: 0} satisfies CleanupResult),
          ),
        ),
      )

      yield* cleanup.pipe(
        Effect.andThen(Effect.repeat(cleanup, Schedule.cron(Cron.parseUnsafe(retentionToCron(retention))))),
        Effect.ignore,
        Effect.forkScoped,
      )

      return Service.of({
        drain: (event) => batches({event}),
        bind: (db) => Deferred.succeed(ready, db).pipe(Effect.asVoid),
        query: (input) =>
          Effect.gen(function* () {
            const db = yield* Deferred.await(ready)
            yield* Effect.promise(() => batches.flush())
            return yield* db
              .select()
              .from(logEvents)
              .where(queryWhere(input))
              .orderBy(desc(logEvents.timestamp))
              .limit(input.limit)
          }).pipe(Effect.orDie),
        tail: Stream.fromPubSub(inserted),
        cleanup,
        dropped: () => counts.dropped,
      })
    }),
  )
}
