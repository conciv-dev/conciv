import {basename} from 'node:path'
import {makeRpcClient} from '@conciv/contract'
import {checkEngines, listEngines, withHomeDb, type EngineRow} from '@conciv/db'
import {makeRpc} from '@conciv/plugin'
import {PluginHost} from '@conciv/plugin-host'
import {Context, Effect, Latch, Layer, Ref, Semaphore, Stream} from 'effect'
import {memoize} from 'es-toolkit'
import {logError} from '../lib/debug.js'
import {homeDbReads} from '../lib/home-db-watch.js'

const SERVER_HEALTH_POLL_MS = 10_000

const PROBE_MS = 300

type Servers = Context.Service.Shape<typeof PluginHost.ServersSource>

type ServerRef = NonNullable<ReturnType<Servers['get']>>

type Snapshot = {rows: ReadonlyArray<EngineRow>; reached: ReadonlyArray<string>}

type ServersSourceInput = {home: string; engineId: string}

function connect(apiBase: string): ServerRef['client'] {
  const client = makeRpcClient(apiBase)
  const rpc = makeRpc(client.plugin.call, client.plugin.events)
  return new Proxy(Object.assign(client, {rpc}), {
    get: (target, key) => (key === 'rpc' ? rpc : Reflect.get(target, key)),
  })
}

async function checked(home: string): Promise<Snapshot> {
  const engines = await checkEngines(home, {timeoutMs: PROBE_MS})
  return {rows: withHomeDb(home, listEngines), reached: engines.live.map((row) => row.id)}
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function watchHome(home: string, refresh: Effect.Effect<void>): Effect.Effect<void> {
  return Effect.acquireRelease(
    Effect.sync(() => new AbortController()),
    (controller) => Effect.sync(() => controller.abort()),
  ).pipe(
    Effect.flatMap((controller) =>
      Stream.fromAsyncIterable(
        homeDbReads(home, controller.signal, () => withHomeDb(home, listEngines)),
        errorText,
      ).pipe(Stream.runForEach(() => refresh)),
    ),
    Effect.catch((error) =>
      Effect.sync(() => logError(`[core] the conciv home folder could not be watched: ${error}`)),
    ),
    Effect.scoped,
  )
}

function makeServerRef(
  first: EngineRow,
  current: () => Snapshot,
  engineId: string,
  clientAt: (apiBase: string) => ServerRef['client'],
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
      return clientAt(row().apiBase)
    },
    local: true,
    builtin: first.id === engineId,
    compatible: true,
    get connected() {
      return current().reached.includes(first.id)
    },
  }
}

export function provideServersSource(input: ServersSourceInput) {
  return Layer.effect(
    PluginHost.ServersSource,
    Effect.gen(function* () {
      const snapshot = yield* Ref.make<Snapshot>({rows: [], reached: []})
      const read = yield* Latch.make()
      const serial = yield* Semaphore.make(1)
      const current = (): Snapshot => Ref.getUnsafe(snapshot)
      const refresh = Effect.tryPromise(() => checked(input.home)).pipe(
        Effect.flatMap((next) => Ref.set(snapshot, next)),
        Effect.catch((error) =>
          Effect.sync(() => logError(`[core] the conciv engines could not be listed: ${errorText(error.cause)}`)),
        ),
        Semaphore.withPermit(serial),
      )
      const pollHealth = Effect.sleep(SERVER_HEALTH_POLL_MS).pipe(Effect.andThen(refresh), Effect.forever)
      yield* read.await.pipe(
        Effect.andThen(
          Effect.all([watchHome(input.home, refresh), pollHealth], {concurrency: 'unbounded', discard: true}),
        ),
        Effect.forkScoped,
      )
      const listed = (): ReadonlyArray<EngineRow> => {
        Latch.openUnsafe(read)
        return current().rows
      }
      const clientAt = memoize(connect)
      const serverRef = memoize((first: EngineRow) => makeServerRef(first, current, input.engineId, clientAt), {
        getCacheKey: (row) => row.id,
      })
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
