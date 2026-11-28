import * as IntegrationSchema from '@conciv/protocol/schema/integration'
import {causeFrom, integrationErrors} from '@conciv/errors'
import {Config as EffectConfig, ConfigProvider, Context, Effect, Layer, Option, Ref, Schema, Semaphore} from 'effect'
import {HttpClient, HttpClientRequest, HttpClientResponse} from 'effect/http'
import type {EvlogError} from 'evlog'
import {isDeepStrictEqual} from 'node:util'
import * as Bus from './bus.js'
import * as KV from './kv.js'

export interface Auth extends Schema.Schema.Type<typeof Auth> {}
export const Auth = Schema.Struct({
  command: Schema.Array(Schema.String),
  env: Schema.String,
}).annotate({identifier: 'WellKnown.Auth'})

export interface RemoteConfig extends Schema.Schema.Type<typeof RemoteConfig> {}
export const RemoteConfig = Schema.Struct({
  url: Schema.String,
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
}).annotate({identifier: 'WellKnown.RemoteConfig'})

export type Config = Schema.Schema.Type<typeof Config>
export const Config = Schema.Record(Schema.String, Schema.Json).annotate({identifier: 'WellKnown.Config'})

export interface Manifest extends Schema.Schema.Type<typeof Manifest> {}
export const Manifest = Schema.Struct({
  auth: Schema.optional(Auth),
  config: Schema.optional(Schema.NullOr(Config)),
  remote_config: Schema.optional(RemoteConfig),
}).annotate({identifier: 'WellKnown.Manifest'})

export interface ResolveInput {
  readonly origin: string
  readonly variables?: Readonly<Record<string, string>>
}

export interface Entry {
  readonly origin: string
  readonly integrationId: IntegrationSchema.Id
  readonly manifest: Manifest
}

export interface Interface {
  readonly entries: () => Effect.Effect<readonly Entry[], EvlogError>
  readonly snapshot: () => readonly Entry[]
  readonly refresh: () => Effect.Effect<boolean, EvlogError>
  readonly add: (origin: string) => Effect.Effect<Entry, EvlogError>
  readonly remove: (origin: string) => Effect.Effect<void>
  readonly resolve: (entry: Entry, variables: Readonly<Record<string, string>>) => Effect.Effect<Config[], EvlogError>
  readonly cached: (origin: string) => Effect.Effect<Config[]>
  readonly clearCached: (origin: string) => Effect.Effect<void>
}

export const Service = Context.Service<Interface>('@conciv/WellKnown')

export const Event = {
  Updated: Bus.ephemeral({type: 'wellknown.updated', schema: {}}),
}

const requestTimeout = '15 seconds'

const failure = (reason: string) => (cause: unknown) => integrationErrors.WELL_KNOWN({reason, ...causeFrom(cause)})

export const inspect = Effect.fn('WellKnown.inspect')(function* (origin: string) {
  const url = `${origin.replace(/\/+$/, '')}/.well-known/conciv`
  const http = HttpClient.filterStatusOk(yield* HttpClient.HttpClient)
  return yield* http
    .execute(HttpClientRequest.get(url).pipe(HttpClientRequest.acceptJson))
    .pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Manifest)),
      Effect.timeout(requestTimeout),
      Effect.mapError(failure(`Failed to load wellknown manifest from ${url}`)),
    )
})

export const resolve = Effect.fn('WellKnown.resolve')(function* (input: ResolveInput) {
  const manifest = yield* inspect(input.origin)
  return yield* resolveEntry(
    {origin: input.origin, integrationId: IntegrationSchema.Id.make(input.origin.replace(/\/+$/, '')), manifest},
    input.variables ?? {},
  )
})

const readEnv = Effect.fnUntraced(function* (name: string) {
  const env = yield* ConfigProvider.ConfigProvider
  return Option.getOrUndefined(yield* EffectConfig.option(EffectConfig.String(name)).parse(env).pipe(Effect.orDie))
})

const substitute = Effect.fnUntraced(function* (value: string, variables: Readonly<Record<string, string>>) {
  const names = [...new Set([...value.matchAll(/\{env:([^}]+)\}/g)].map((match) => match[1] ?? ''))]
  const values = new Map(
    yield* Effect.forEach(names, (name) =>
      variables[name] === undefined
        ? readEnv(name).pipe(Effect.map((found) => [name, found ?? ''] as const))
        : Effect.succeed([name, variables[name]] as const),
    ),
  )
  return value.replace(/\{env:([^}]+)\}/g, (_, name: string) => values.get(name) ?? '')
})

const resolveEntry = Effect.fnUntraced(function* (entry: Entry, variables: Readonly<Record<string, string>>) {
  const configs = entry.manifest.config ? [entry.manifest.config] : []
  if (!entry.manifest.remote_config) return configs

  const template = entry.manifest.remote_config.url
  const url = yield* substitute(template, variables)
  const headers = Object.fromEntries(
    yield* Effect.forEach(Object.entries(entry.manifest.remote_config.headers ?? {}), ([key, value]) =>
      substitute(value, variables).pipe(Effect.map((substituted) => [key, substituted] as const)),
    ),
  )
  const http = HttpClient.filterStatusOk(yield* HttpClient.HttpClient)
  const remote = yield* http
    .execute(HttpClientRequest.get(url).pipe(HttpClientRequest.acceptJson, HttpClientRequest.setHeaders(headers)))
    .pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Config)),
      Effect.timeout(requestTimeout),
      Effect.mapError(failure(`Failed to load wellknown remote config from ${template}`)),
    )
  if (Schema.is(Config)(remote.config)) return [...configs, remote.config]
  return [...configs, remote]
})

const sourcesKey = 'wellknown:sources'
const Sources = Schema.Array(Schema.String)
const manifestKey = (origin: string) => `wellknown:manifest:${origin}`
const configKey = (origin: string) => `wellknown:config:${origin}`
const Configs = Schema.Array(Config)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const env = yield* ConfigProvider.ConfigProvider
    const kv = yield* KV.Service
    const bus = yield* Bus.Service
    const cache = yield* Ref.make(new Map<string, Entry>())
    const lock = Semaphore.makeUnsafe(1)
    const loadEntry = Effect.fn('WellKnown.loadEntry')(function* (origin: string) {
      const manifest = yield* inspect(origin).pipe(
        Effect.provideService(HttpClient.HttpClient, http),
        Effect.tap((loaded) => kv.set(manifestKey(origin), loaded)),
        Effect.catch((error) =>
          kv
            .get(manifestKey(origin))
            .pipe(
              Effect.flatMap((cached) =>
                Schema.is(Manifest)(cached)
                  ? Effect.logWarning('failed to load wellknown manifest', {origin, error}).pipe(Effect.as(cached))
                  : Effect.fail(error),
              ),
            ),
        ),
      )
      return {origin, integrationId: IntegrationSchema.Id.make(origin), manifest}
    })

    const loadSource = (origin: string) =>
      loadEntry(origin).pipe(
        Effect.catch((error) =>
          Effect.logWarning('skipping wellknown source', {origin, error}).pipe(Effect.as(undefined)),
        ),
      )

    const readOrigins = kv.get(sourcesKey).pipe(Effect.map((value) => (Schema.is(Sources)(value) ? value : [])))

    const load = Effect.fn('WellKnown.load')(function* () {
      const origins = yield* readOrigins
      const current = yield* Ref.get(cache)
      const loaded = yield* Effect.forEach(origins, (origin) => {
        const cached = current.get(origin)
        if (cached) return Effect.succeed(cached)
        return loadSource(origin)
      })
      const entries = loaded.filter((entry) => entry !== undefined)
      yield* Ref.set(cache, new Map(entries.map((entry) => [entry.origin, entry])))
      return entries
    })

    const refresh = Effect.fn('WellKnown.refresh')(
      function* () {
        const origins = yield* readOrigins
        if (!origins.length) return false
        const entries = yield* Effect.forEach(origins, loadSource)
        const next = new Map(entries.filter((entry) => entry !== undefined).map((entry) => [entry.origin, entry]))
        const changed = !isDeepStrictEqual(Ref.getUnsafe(cache), next)
        if (!changed) return false
        yield* Ref.set(cache, next)
        yield* bus.publish(Event.Updated, {}, {global: true})
        return true
      },
      (effect) => lock.withPermit(effect),
    )

    return Service.of({
      entries: load,
      snapshot: () => Array.from(Ref.getUnsafe(cache).values()),
      refresh,
      add: Effect.fn('WellKnown.add')(
        function* (value) {
          const origin = value.replace(/\/+$/, '')
          const entry = yield* loadEntry(origin)
          if (!entry.manifest.auth)
            return yield* Effect.fail(
              integrationErrors.WELL_KNOWN({reason: `No authentication method found at ${origin}`}),
            )
          const origins = yield* readOrigins
          yield* kv.set(sourcesKey, Array.from(new Set([...origins, origin])))
          yield* Ref.update(cache, (current) => new Map(current).set(origin, entry))
          yield* bus.publish(Event.Updated, {}, {global: true})
          return entry
        },
        (effect) => lock.withPermit(effect),
      ),
      remove: Effect.fn('WellKnown.remove')(
        function* (value) {
          const origin = value.replace(/\/+$/, '')
          const origins = yield* readOrigins
          yield* kv.set(
            sourcesKey,
            origins.filter((item) => item !== origin),
          )
          yield* kv.remove(manifestKey(origin))
          yield* kv.remove(configKey(origin))
          yield* Ref.update(cache, (current) => {
            const next = new Map(current)
            next.delete(origin)
            return next
          })
          yield* bus.publish(Event.Updated, {}, {global: true})
        },
        (effect) => lock.withPermit(effect),
      ),
      resolve: Effect.fn('WellKnown.resolveEntry')(function* (entry, variables) {
        const configs = yield* resolveEntry(entry, variables).pipe(
          Effect.provideService(HttpClient.HttpClient, http),
          Effect.provideService(ConfigProvider.ConfigProvider, env),
        )
        yield* kv.set(configKey(entry.origin), configs)
        return configs
      }),
      cached: Effect.fn('WellKnown.cached')(function* (origin) {
        const value = yield* kv.get(configKey(origin))
        return Schema.is(Configs)(value) ? [...value] : []
      }),
      clearCached: Effect.fn('WellKnown.clearCached')(function* (origin) {
        yield* kv.remove(configKey(origin))
      }),
    })
  }),
)
