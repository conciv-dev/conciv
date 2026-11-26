import {basename} from 'node:path'
import {engineTooOld, makeRpcClient} from '@conciv/client'
import {checkEngines, listEngines, prepareHome, withHomeDb, type EngineRow, type PreparedHome} from '@conciv/home'
import {Conciv} from '@conciv/client/plugin'
import {PluginHost} from '@conciv/backend-app-api'
import {Context, Effect, Latch, Layer, Ref, Schedule, Semaphore, Stream} from 'effect'
import {isEqual, memoize, uniqBy} from 'es-toolkit'
import {homeDbReads} from '../lib/home-db-watch.js'

const SERVER_HEALTH_POLL_MS = 10_000

const PROBE_MS = 300

type Servers = Context.Service.Shape<typeof PluginHost.ServersSource>

type ServerRef = NonNullable<ReturnType<Servers['get']>>

type Snapshot = {rows: ReadonlyArray<EngineRow>; reached: ReadonlyArray<string>}

type ServersSourceInput = {home: string; engineId: string}

function connect(row: EngineRow, tooOld: (apiBase: string) => void): ServerRef['client'] {
  const {apiBase, token} = row
  const client = makeRpcClient(apiBase, {
    token,
    interceptors: [
      ({next}) =>
        next().catch((error: unknown) => {
          if (engineTooOld(error)) tooOld(apiBase)
          throw error
        }),
    ],
  })
  return Conciv.make(client, {server: () => apiBase})
}

type HomeReach = {ok: true; home: PreparedHome} | {ok: false; error: Error}

function reachHome(home: string): Promise<HomeReach> {
  return prepareHome(home).then(
    (prepared): HomeReach => ({ok: true, home: prepared}),
    (error: unknown): HomeReach => ({ok: false, error: error instanceof Error ? error : new Error(String(error))}),
  )
}

function listedIn(reach: HomeReach): ReadonlyArray<EngineRow> {
  if (!reach.ok) throw reach.error
  return withHomeDb(reach.home, listEngines)
}

async function checked(home: string, reach: HomeReach): Promise<Snapshot> {
  const engines = await checkEngines(home, {timeoutMs: PROBE_MS})
  return {rows: listedIn(reach), reached: engines.live.map((row) => row.id)}
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function watchHome(home: string, reach: HomeReach, refresh: Effect.Effect<void>): Effect.Effect<void> {
  return Effect.acquireRelease(
    Effect.sync(() => new AbortController()),
    (controller) => Effect.sync(() => controller.abort()),
  ).pipe(
    Effect.flatMap((controller) =>
      Stream.fromAsyncIterable(
        homeDbReads(home, controller.signal, async () => listedIn(reach)),
        errorText,
      ).pipe(Stream.runForEach(() => refresh)),
    ),
    Effect.catch((error) =>
      Effect.logError('[core] the conciv home folder could not be watched').pipe(Effect.annotateLogs({home, error})),
    ),
    Effect.scoped,
  )
}

function makeServerRef(
  first: EngineRow,
  current: () => Snapshot,
  engineId: string,
  clientAt: (row: EngineRow) => ServerRef['client'],
  incompatible: () => ReadonlyArray<EngineRow>,
): ServerRef {
  const row = (): EngineRow => current().rows.find((candidate) => candidate.id === first.id) ?? first
  return {
    id: first.id,
    get name() {
      return basename(row().root)
    },
    get url() {
      return row().apiBase
    },
    get client() {
      return clientAt(row())
    },
    local: true,
    builtin: first.id === engineId,
    get compatible() {
      return !incompatible().some((marked) => isEqual(marked, row()))
    },
    get connected() {
      return current().reached.includes(first.id)
    },
  }
}

export function provideServersSource(input: ServersSourceInput) {
  return Layer.effect(
    PluginHost.ServersSource,
    Effect.gen(function* () {
      const reach = yield* Effect.promise(() => reachHome(input.home))
      const snapshot = yield* Ref.make<Snapshot>({rows: [], reached: []})
      const read = yield* Latch.make()
      const serial = yield* Semaphore.make(1)
      const current = (): Snapshot => Ref.getUnsafe(snapshot)
      const refresh = Effect.tryPromise(() => checked(input.home, reach)).pipe(
        Effect.flatMap((next) => Ref.set(snapshot, next)),
        Effect.catch((error) =>
          Effect.logError('[core] the conciv engines could not be listed').pipe(
            Effect.annotateLogs({home: input.home, error: errorText(error.cause)}),
          ),
        ),
        Semaphore.withPermit(serial),
      )
      const pollHealth = refresh.pipe(Effect.schedule(Schedule.spaced(SERVER_HEALTH_POLL_MS)))
      yield* read.await.pipe(
        Effect.andThen(
          Effect.all([watchHome(input.home, reach, refresh), pollHealth], {concurrency: 'unbounded', discard: true}),
        ),
        Effect.forkScoped,
      )
      const listed = (): ReadonlyArray<EngineRow> => {
        Latch.openUnsafe(read)
        return listedIn(reach)
      }
      const incompatible = yield* Ref.make<ReadonlyArray<EngineRow>>([])
      const markTooOld = (apiBase: string): void =>
        Effect.runSync(
          Ref.update(incompatible, (marked) =>
            uniqBy([...current().rows.filter((row) => row.apiBase === apiBase), ...marked], (row) => row.id),
          ),
        )
      const clientAt = memoize((row: EngineRow) => connect(row, markTooOld), {
        getCacheKey: (row) => `${row.apiBase} ${row.token}`,
      })
      const serverRef = memoize(
        (first: EngineRow) =>
          makeServerRef(first, current, input.engineId, clientAt, () => Ref.getUnsafe(incompatible)),
        {getCacheKey: (row) => row.id},
      )
      return PluginHost.ServersSource.of({
        list: () => listed().map((row) => row.id),
        get: (id) => {
          const found = listed().find((row) => row.id === id)
          return found === undefined ? undefined : serverRef(found)
        },
      })
    }),
  )
}
