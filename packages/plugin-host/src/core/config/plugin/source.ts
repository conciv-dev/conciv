export * as ConfigPluginSource from './source.js'

import type {PluginOptions} from '@conciv/plugin'
import {ConfigPlugin} from '../../../schema/config/plugin.js'
import {FSUtil} from '../../../util/fs-util.js'
import * as Host from '@conciv/plugin/host'
import {Context, Effect, FiberMap, Layer, Option, PubSub, Schedule, Scope, Semaphore, Stream} from 'effect'
import path from 'path'
import {fileURLToPath, pathToFileURL} from 'url'
import {Watcher} from '../../filesystem/watcher.js'
import {Location} from '../../location.js'
import {PluginSourceDirectory} from '../../plugin/source-directory.js'

export type Operation =
  | {
      readonly type: 'add'
      readonly target: string
      readonly options: PluginOptions
      readonly mtime?: number
    }
  | {
      readonly type: 'remove'
      readonly target: string
    }

export interface Interface {
  readonly operations: () => Effect.Effect<readonly Operation[], never, Scope.Scope>
  readonly changes: () => Stream.Stream<void>
}

export const Service = Context.Service<Interface>('@conciv/ConfigPluginSource')

export const ConfiguredPlugins = Context.Service<readonly ConfigPlugin.Plugin[]>('@conciv/ConfiguredPlugins')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const plugins = yield* ConfiguredPlugins
    const watcher = yield* Watcher.Service
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const configuredChanges = yield* PubSub.unbounded<void>()
    const concivDirectory = path.join(location.directory, 'conciv')
    const watchUpdates = yield* PubSub.unbounded<Watcher.Update>()
    const reloads = yield* PubSub.sliding<void>(1)
    const requestReload = PubSub.publish(reloads, undefined).pipe(Effect.asVoid)
    const reloadLock = Semaphore.makeUnsafe(1)
    const watches = yield* FiberMap.make<string>()
    const configuredWatches = yield* FiberMap.make<string>()
    const announceWhenEnded = (announce: Effect.Effect<void>) =>
      Effect.flatMap(Option.match({onNone: () => Effect.void, onSome: () => announce}))
    const untilArmed = (watch: Effect.Effect<Option.Option<Watcher.Update>>) =>
      watch.pipe(Effect.repeat({schedule: Schedule.exponential('100 millis'), times: 4, until: Option.isSome}))
    const reconcile = Effect.fn('ConfigPluginSource.reconcileWatches')(function* () {
      const plan = watchPlan(location.directory, concivDirectory, yield* fs.isDir(concivDirectory))
      for (const key of Array.from(watches, ([existing]) => existing)) {
        if (!plan.has(key)) yield* FiberMap.remove(watches, key)
      }
      for (const [key, target] of plan) {
        if (yield* FiberMap.has(watches, key)) continue
        yield* watcher.subscribe(target, requestReload).pipe(
          Effect.flatMap((updates) =>
            updates.pipe(
              Stream.tap((update) => PubSub.publish(watchUpdates, update).pipe(Effect.andThen(requestReload))),
              Stream.runLast,
            ),
          ),
          untilArmed,
          announceWhenEnded(requestReload),
          FiberMap.run(watches, key, {startImmediately: true}),
        )
      }
    })
    const reload = Effect.fn('ConfigPluginSource.reload')(
      function* () {
        yield* reconcile()
      },
      (effect) => reloadLock.withPermit(effect),
    )

    const pendingReloads = yield* PubSub.subscribe(reloads)
    yield* Stream.fromSubscription(pendingReloads).pipe(
      Stream.debounce('100 millis'),
      Stream.runForEach(() =>
        reload().pipe(Effect.catchCause((cause) => Effect.logError('failed to reload plugin watches', {cause}))),
      ),
      Effect.forkScoped({startImmediately: true}),
    )

    const configuredChanged = PubSub.publish(configuredChanges, undefined).pipe(Effect.asVoid)
    const configuredTargets = Effect.sync(() =>
      configuredOperations(location, plugins).flatMap((operation) =>
        operation.type === 'add' &&
        path.isAbsolute(operation.target) &&
        !isDirectorySource(concivDirectory, operation.target)
          ? [operation.target]
          : [],
      ),
    )
    const watchConfiguredSources = Effect.fn('ConfigPluginSource.watchConfiguredSources')(
      function* () {
        const targets = yield* configuredTargets
        const inputs = yield* Effect.forEach(
          targets,
          (target) =>
            fs
              .isDir(target)
              .pipe(
                Effect.map((directory): Watcher.WatchInput => ({path: target, type: directory ? 'directory' : 'file'})),
              ),
          {concurrency: 8},
        )
        const plan = new Map(inputs.map((input) => [JSON.stringify(input), input]))
        for (const key of Array.from(configuredWatches, ([existing]) => existing)) {
          if (!plan.has(key)) yield* FiberMap.remove(configuredWatches, key)
        }
        for (const [key, input] of plan) {
          if (yield* FiberMap.has(configuredWatches, key)) continue
          yield* watcher.subscribe(input).pipe(
            Effect.flatMap((updates) =>
              updates.pipe(
                Stream.tap(() => configuredChanged),
                Stream.runLast,
              ),
            ),
            untilArmed,
            Effect.catchCause((cause) =>
              Effect.logError('configured plugin watch failed', {target: input.path, cause}).pipe(
                Effect.as(Option.none<Watcher.Update>()),
              ),
            ),
            announceWhenEnded(configuredChanged),
            FiberMap.run(configuredWatches, key, {startImmediately: true}),
          )
        }
      },
      (effect) => reloadLock.withPermit(effect),
    )

    yield* reloadLock.withPermit(reconcile())

    return Service.of({
      operations: Effect.fn('ConfigPluginSource.operations')(function* () {
        const operations = yield* scan(fs, location, concivDirectory, plugins)
        yield* watchConfiguredSources()
        return operations
      }),
      changes: () =>
        Stream.merge(
          Stream.fromPubSub(watchUpdates).pipe(
            Stream.filterEffect((update) =>
              Effect.map(fs.resolve(concivDirectory), (realConcivDirectory) =>
                [concivDirectory, realConcivDirectory].some(
                  (directory) => update.path === directory || isDirectorySource(directory, update.path),
                ),
              ),
            ),
            Stream.map(() => undefined),
          ),
          Stream.fromPubSub(configuredChanges),
        ),
    })
  }),
)

export const empty = Layer.succeed(
  Service,
  Service.of({
    operations: () => Effect.succeed([]),
    changes: () => Stream.never,
  }),
)

function watchPlan(root: string, concivDirectory: string, present: boolean) {
  const directory: Watcher.WatchInput = {path: concivDirectory, type: 'directory', ignore: FSUtil.ignoreGlobs}
  const entries: Watcher.WatchInput = {path: root, type: 'entries', names: [path.basename(concivDirectory)]}
  const targets = present ? [directory, entries] : [entries]
  return new Map(targets.map((target) => [JSON.stringify(target), target]))
}

function isDirectorySource(concivDirectory: string, file: string) {
  return PluginSourceDirectory.names.some((name) => FSUtil.contains(path.join(concivDirectory, name), file))
}

function parse(input: ConfigPlugin.Plugin): Operation {
  if (typeof input !== 'string') {
    return {type: 'add', target: input[0], options: input[1]}
  }
  if (!input.startsWith('-')) return {type: 'add', target: input, options: {}}
  if (input.length === 1) throw new Error('Plugin remove operation requires a target')
  return {type: 'remove', target: input.slice(1)}
}

function configuredOperations(location: Location.Interface, plugins: readonly ConfigPlugin.Plugin[]) {
  return plugins.map(parse).map((operation): Operation => {
    if (operation.type === 'remove') return operation
    const target = operation.target.startsWith('file://')
      ? fileURLToPath(operation.target)
      : operation.target.startsWith('./') || operation.target.startsWith('../')
        ? path.resolve(location.directory, operation.target)
        : operation.target
    return {...operation, target}
  })
}

const scan = Effect.fn('ConfigPluginSource.scan')(function* (
  fs: FSUtil.Interface,
  location: Location.Interface,
  concivDirectory: string,
  plugins: readonly ConfigPlugin.Plugin[],
) {
  const discovered = yield* PluginSourceDirectory.discover(fs, concivDirectory).pipe(
    Effect.map((targets) => targets.map((target): Operation => ({type: 'add', target, options: {}}))),
  )
  const configured = configuredOperations(location, plugins)
  const resolved = yield* Effect.forEach(configured, (operation) =>
    Effect.gen(function* () {
      if (operation.type === 'remove' || !path.isAbsolute(operation.target)) return Option.some(operation)
      if (yield* fs.isFile(operation.target)) {
        yield* Effect.logWarning('configured plugin path must be a directory', {target: operation.target})
        return Option.none<Operation>()
      }
      return Option.some<Operation>(operation)
    }),
  ).pipe(Effect.map((operations) => operations.flatMap(Option.toArray)))
  return yield* Effect.forEach([...discovered, ...resolved], (operation) =>
    Effect.gen(function* () {
      if (operation.type === 'remove' || !path.isAbsolute(operation.target)) return [operation]
      if (!(yield* fs.existsSafe(operation.target))) return [operation]
      const directory = yield* fs.isDir(operation.target)
      const entrypoints: Host.Entrypoints = directory
        ? yield* Effect.promise(() => Host.resolve({directory: operation.target}))
        : {server: pathToFileURL(operation.target).href}
      const entrypoint = entrypoints.server ?? entrypoints.experimental
      if (!entrypoint) return []
      if (directory) {
        const root = yield* fs.resolve(operation.target)
        const resolved = yield* fs.resolve(fileURLToPath(entrypoint))
        if (!FSUtil.contains(root, resolved)) return []
      }
      const times = yield* Effect.forEach(
        [
          ...Object.values(entrypoints)
            .filter((entry) => entry !== entrypoints.experimental)
            .filter((entry) => entry !== undefined)
            .map((entry) => fileURLToPath(entry)),
          path.join(directory ? operation.target : path.dirname(operation.target), 'package.json'),
        ],
        (entry) =>
          fs.stat(entry).pipe(
            Effect.map((info) => Option.getOrElse(info.mtime, () => new Date(0)).getTime()),
            Effect.orElseSucceed(() => 0),
          ),
      )
      return [{...operation, mtime: Math.max(...times)}]
    }),
  ).pipe(Effect.map((operations) => operations.flat()))
})
