export * as PluginModule from './module.js'

import type {Plugin, Services, TaggedError} from '@conciv/plugin/effect/plugin'
import * as Host from '@conciv/plugin/host'
import {ExperimentalBundle, type Source} from '@conciv/plugin/schema/plugin'
import {createPluginSources} from '../../plugin/source.js'
import {Hash} from '../../util/hash.js'
import {Npm} from '../../util/npm.js'
import {Deferred, Duration, Effect, FiberSet, PubSub, RcMap, Schema, Stream} from 'effect'
import path from 'path'
import {existsSync} from 'node:fs'
import {readFile, stat} from 'node:fs/promises'
import {z} from 'zod'
import {fileURLToPath, pathToFileURL} from 'url'
import type {ConfigPluginSource} from '../config/plugin/source.js'
import type {Chunks, Generation} from './service.js'
import {PluginPromise} from './promise.js'
import {ManagedPolicy} from '../managed-policy.js'
import {Watcher} from '../filesystem/watcher.js'

export const make = Effect.fn('PluginModule.make')(function* () {
  const policies = yield* ManagedPolicy.ConfiguredPolicies
  const watcher = yield* Watcher.Service
  const runPromise = yield* FiberSet.makeRuntimePromise()
  const changes = yield* PubSub.unbounded<void>()
  const watches = yield* RcMap.make({
    lookup: Effect.fn('PluginModule.watch')(function* (file: string) {
      const ready = yield* Deferred.make<void>()
      const target = yield* Effect.promise(() => watchTarget(file))
      const updates = yield* watcher.subscribe(target, Deferred.succeed(ready, undefined))
      yield* updates.pipe(
        Stream.runForEach(() => PubSub.publish(changes, undefined)),
        Effect.ensuring(Deferred.succeed(ready, undefined)),
        Effect.forkScoped({startImmediately: true}),
      )
      yield* Deferred.await(ready)
    }),
    idleTimeToLive: Duration.infinity,
  })
  const watch = (file: string) => Effect.scoped(RcMap.get(watches, file))
  const sources = yield* Effect.acquireRelease(
    Effect.sync(() => createPluginSources((file) => runPromise(watch(file)))),
    (created) => Effect.sync(() => created.dispose()),
  )
  return {
    load: (operation: Extract<ConfigPluginSource.Operation, {type: 'add'}>, options?: {readonly install?: boolean}) =>
      Effect.gen(function* () {
        const version = operation.target.lastIndexOf('@')
        const target =
          path.isAbsolute(operation.target) || version <= 0 ? operation.target : operation.target.slice(0, version)
        if (ManagedPolicy.decision(ManagedPolicy.statements(policies), 'plugin.use', target) === 'deny')
          return {blocked: true as const}
        return yield* load(operation, sources, watch, options)
      }),
    changes: () => Stream.fromPubSub(changes),
  }
})

export function source(target: string, version?: string): Source {
  if (path.isAbsolute(target)) return {type: 'local', path: target}
  return {type: 'package', target, ...(version ? {version} : {})}
}

function watchTarget(file: string): Promise<Watcher.WatchInput> {
  return stat(file).then(
    (info) => ({path: file, type: info.isDirectory() ? 'directory' : 'file'}),
    (cause) => {
      if (path.dirname(file) === file) throw cause
      return watchTarget(path.dirname(file))
    },
  )
}

const ExperimentalOptions = ExperimentalBundle.fields.options

const Module = Schema.Struct({
  default: Schema.Union([
    Schema.Struct({
      id: Schema.String,
      effect: Schema.declare<Plugin<Services, TaggedError>['effect']>(
        (input): input is Plugin<Services, TaggedError>['effect'] => typeof input === 'function',
      ),
    }),
    Schema.Struct({
      id: Schema.String,
      setup: Schema.declare<Parameters<typeof PluginPromise.fromPromise>[0]['setup']>(
        (input): input is Parameters<typeof PluginPromise.fromPromise>[0]['setup'] => typeof input === 'function',
      ),
    }),
  ]),
})

export const LoadError = Schema.TaggedStruct('PluginModule.LoadError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
})
export type LoadError = typeof LoadError.Type & globalThis.Error

export const makeLoadError = (fields: Omit<typeof LoadError.Type, '_tag'>): LoadError =>
  Object.assign(new globalThis.Error(fields.message, {cause: fields.cause}), LoadError.make(fields), {
    name: 'PluginModule.LoadError',
  })

const load = Effect.fn('PluginModule.load')(function* (
  operation: Extract<ConfigPluginSource.Operation, {type: 'add'}>,
  sources: ReturnType<typeof createPluginSources>,
  watch: (file: string) => Effect.Effect<void>,
  options?: {readonly install?: boolean},
) {
  const local = path.isAbsolute(operation.target)
  const npm = yield* Npm.Service
  const installed = local
    ? undefined
    : options?.install === false
      ? yield* npm.resolve(operation.target)
      : yield* npm.add(operation.target)
  const entrypoints: Host.Entrypoints =
    local && (yield* Effect.promise(() => stat(operation.target))).isFile()
      ? {server: pathToFileURL(operation.target).href}
      : yield* Effect.sync(() => Host.resolve(installed ?? {directory: operation.target}))
  const entrypoint = entrypoints.server
  const found = entrypoint || entrypoints.experimental
  if (!local && options?.install === false && !found) return {pending: true as const}
  if (!found) return yield* Effect.fail(makeLoadError({message: `Plugin entrypoint not found: ${operation.target}`}))
  yield* Effect.log({msg: 'loading plugin', id: operation.target, entrypoint: found})
  const server = entrypoint
    ? yield* loadServer(entrypoint, local ? sources : undefined, installed?.revision)
    : undefined
  const plugin = server?.plugin ?? {
    id: Host.packageId(installed ?? {directory: operation.target}),
    effect: () => Effect.void,
  }
  const revision = JSON.stringify([operation, server ? server.version : installed?.revision])
  const experimental = entrypoints.experimental
    ? yield* loadExperimental(entrypoints.experimental, local ? watch : undefined, revision, operation.options)
    : undefined
  return {
    id: plugin.id,
    features: {
      ...(entrypoint ? {server: true as const} : {}),
      ...(entrypoint && entrypoints.rpc ? {rpc: true as const} : {}),
      ...(entrypoints.experimental ? {experimental: true as const} : {}),
    },
    experimental,
    revision,
    source: source(operation.target, installed?.version),
    effect: (host) => plugin.effect({...host, options: operation.options}),
  } satisfies Generation
})

const loadExperimental = Effect.fn('PluginModule.loadExperimental')(function* (
  file: string,
  watch: ((file: string) => Effect.Effect<void>) | undefined,
  revision: string,
  options: unknown,
) {
  const entry = fileURLToPath(file)
  if (watch) yield* watch(entry)
  const code = yield* Effect.tryPromise({
    try: () => readFile(entry, 'utf8'),
    catch: (cause) => makeLoadError({message: `The ./plugin-experimental file ${entry} can't be read`, cause}),
  })
  return {
    file,
    code,
    revision: Hash.sha256(JSON.stringify([revision, watch ? Hash.sha256(code) : undefined])),
    options: yield* Schema.decodeUnknownEffect(ExperimentalOptions)(options).pipe(
      Effect.mapError((cause) =>
        makeLoadError({message: 'Plugin options must be JSON to reach its ./plugin-experimental', cause}),
      ),
    ),
    chunks: yield* readChunks(entry),
  }
})

const ChunkFile = z.string().regex(/^[\w.-]+\.cjs$/)

const ChunkImports = z.array(z.string()).optional()

const Manifest = z.record(
  z.string(),
  z.union([
    z.object({file: z.string(), isEntry: z.literal(true), imports: ChunkImports}),
    z.object({file: ChunkFile, isEntry: z.literal(false).optional(), imports: ChunkImports}),
  ]),
)

const readChunks = Effect.fn('PluginModule.readChunks')(function* (entry: string) {
  const manifest = `${entry}.manifest.json`
  if (!existsSync(manifest)) return {start: [], files: new Map()} satisfies Chunks
  const refusal = (problem: string, cause?: unknown) =>
    makeLoadError({message: `The chunk manifest of ${entry} ${problem}`, cause})
  const records = new Map(
    Object.entries(
      yield* Effect.tryPromise({
        try: async () => Manifest.parse(JSON.parse(await readFile(manifest, 'utf8'))),
        catch: (cause) => refusal('is malformed', cause),
      }),
    ),
  )
  const chunkKey = (key: string) => !records.get(key)?.isEntry
  const imported = (keys: readonly string[] = []) =>
    Effect.forEach(keys.filter(chunkKey), (key) => {
      const file = records.get(key)?.file
      if (file === undefined) return Effect.fail(refusal(`imports ${key}, which it does not list`))
      if (!ChunkFile.safeParse(file).success)
        return Effect.fail(refusal(`imports ${key}, whose file ${file} is not a chunk`))
      return Effect.succeed(file)
    })
  const listed = [...records.values()]
  const start = yield* Effect.forEach(
    listed.filter((record) => record.isEntry),
    (record) => imported(record.imports),
  )
  const files = yield* Effect.forEach(
    listed.filter((record) => !record.isEntry),
    (record) =>
      Effect.all({
        sha256: Effect.tryPromise({
          try: () => readFile(path.join(path.dirname(manifest), record.file)),
          catch: (cause) => refusal(`lists ${record.file}, which can't be read`, cause),
        }).pipe(Effect.map(Hash.sha256)),
        imports: imported(record.imports),
      }).pipe(Effect.map((chunk) => [record.file, chunk] as const)),
    {concurrency: 'unbounded'},
  )
  return {start: start.flat(), files: new Map(files)} satisfies Chunks
})

const loadServer = Effect.fn('PluginModule.loadServer')(function* (
  entrypoint: string,
  sources: ReturnType<typeof createPluginSources> | undefined,
  revision: string | undefined,
) {
  const loaded = yield* Effect.promise(() =>
    sources ? sources.read(entrypoint) : Host.load(entrypoint).then((module) => ({module, version: revision})),
  )
  const value = (yield* Schema.decodeUnknownEffect(Module)(loaded.module).pipe(
    Effect.mapError((cause) =>
      makeLoadError({
        message: 'Plugin must export a default definition with an id and an effect or setup function.',
        cause,
      }),
    ),
  )).default
  return {plugin: 'effect' in value ? value : PluginPromise.fromPromise(value), version: loaded.version}
})
