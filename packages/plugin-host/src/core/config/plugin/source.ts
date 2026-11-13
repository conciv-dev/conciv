export * as ConfigPluginSource from './source.js'

import type {PluginOptions} from '@conciv/plugin'
import {ConfigPlugin} from '../../../schema/config/plugin.js'
import {FSUtil} from '../../../util/fs-util.js'
import * as Host from '@conciv/plugin/host'
import {Context, Effect, Layer, Option, PubSub, Scope, Stream} from 'effect'
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

export const Service = Context.Service<Interface>('@opencode/ConfigPluginSource')

export const ConfiguredPlugins = Context.Service<readonly ConfigPlugin.Plugin[]>('@conciv/ConfiguredPlugins')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const plugins = yield* ConfiguredPlugins
    const watcher = yield* Watcher.Service
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const configuredChanges = yield* PubSub.unbounded<void>()
    const watched = new Set<string>()
    const concivDirectory = path.join(location.directory, 'conciv')

    const watchConfiguredSources = Effect.fn('ConfigPluginSource.watchConfiguredSources')(function* (
      operations: readonly Operation[],
    ) {
      for (const operation of operations) {
        if (operation.type !== 'add' || !path.isAbsolute(operation.target)) continue
        if (watched.has(operation.target)) continue
        if (isDirectorySource(concivDirectory, operation.target)) continue
        watched.add(operation.target)
        const updates = yield* watcher.subscribe({
          path: operation.target,
          type: (yield* fs.isDir(operation.target)) ? 'directory' : 'file',
        })
        yield* updates.pipe(
          Stream.runForEach(() => PubSub.publish(configuredChanges, undefined)),
          Effect.catchCause((cause) =>
            Effect.logError('configured plugin watch failed', {target: operation.target, cause}),
          ),
          Effect.forkScoped({startImmediately: true}),
        )
      }
    })

    return Service.of({
      operations: Effect.fn('ConfigPluginSource.operations')(function* () {
        const operations = yield* scan(fs, location, concivDirectory, plugins)
        yield* watchConfiguredSources(operations)
        return operations
      }),
      changes: () =>
        Stream.merge(
          Stream.merge(
            Stream.unwrap(
              watcher.subscribe({path: concivDirectory, type: 'directory', ignore: FSUtil.ignoreGlobs}),
            ).pipe(Stream.filter((update) => isDirectorySource(concivDirectory, update.path))),
            Stream.unwrap(
              watcher.subscribe({path: location.directory, type: 'entries', names: [path.basename(concivDirectory)]}),
            ),
          ).pipe(Stream.map(() => undefined)),
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

const scan = Effect.fn('ConfigPluginSource.scan')(function* (
  fs: FSUtil.Interface,
  location: Location.Interface,
  concivDirectory: string,
  plugins: readonly ConfigPlugin.Plugin[],
) {
  const discovered = yield* PluginSourceDirectory.discover(fs, concivDirectory).pipe(
    Effect.map((targets) => targets.map((target): Operation => ({type: 'add', target, options: {}}))),
  )
  const configured = plugins.map(parse).map((operation) => {
    if (operation.type === 'remove') return operation
    const target = operation.target.startsWith('file://')
      ? fileURLToPath(operation.target)
      : operation.target.startsWith('./') || operation.target.startsWith('../')
        ? path.resolve(location.directory, operation.target)
        : operation.target
    return {...operation, target}
  })
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
        ? yield* Effect.sync(() => Host.resolve({directory: operation.target}))
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
