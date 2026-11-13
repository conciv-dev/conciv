import {describe, expect} from 'vitest'
import {NodeFileSystem} from '@effect/platform-node'
import {Deferred, Effect, Fiber, Layer, Queue, Schedule, Stream} from 'effect'
import {mkdir, mkdtemp, realpath, rm, utimes, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {ConfigPluginSource} from '../../src/core/config/plugin/source.js'
import {Watcher} from '../../src/core/filesystem/watcher.js'
import {Location} from '../../src/core/location.js'
import {AbsolutePath} from '../../src/schema/schema.js'
import {FSUtil} from '../../src/util/fs-util.js'
import {it} from './lib/effect'

const temporaryProject = Effect.acquireRelease(
  Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), 'config-plugin-source-')))),
  (directory) => Effect.promise(() => rm(directory, {recursive: true, force: true})),
)

const writeAt = (file: string, content: string, seconds: number) =>
  Effect.promise(async () => {
    await mkdir(path.dirname(file), {recursive: true})
    await writeFile(file, content)
    await utimes(file, seconds, seconds)
  })

const services = (root: string, plugins: readonly string[]) =>
  ConfigPluginSource.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Watcher.layer().pipe(Layer.provide(Watcher.nativeLayer)),
        FSUtil.layer.pipe(Layer.provide(NodeFileSystem.layer)),
        Layer.succeed(ConfigPluginSource.ConfiguredPlugins, plugins),
        Layer.succeed(Location.Service, Location.Service.of({directory: AbsolutePath.make(root)})),
      ),
    ),
  )

describe('ConfigPluginSource', () => {
  it.live(
    'lists the plugin folder before the configured entries and reports a write in a configured folder',
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryProject
        const discovered = path.join(root, 'conciv', 'plugins', 'alpha')
        const local = path.join(root, 'local-plugin')
        yield* writeAt(path.join(discovered, 'index.ts'), 'export default {}\n', 1_000)
        yield* writeAt(path.join(discovered, 'package.json'), '{"name": "alpha"}\n', 2_000)
        yield* writeAt(path.join(local, 'index.ts'), 'export default {}\n', 3_000)

        yield* Effect.gen(function* () {
          const source = yield* ConfigPluginSource.Service
          const watcher = yield* Watcher.Service

          expect(yield* source.operations()).toEqual([
            {type: 'add', target: discovered, options: {}, mtime: 2_000_000},
            {type: 'add', target: local, options: {}, mtime: 3_000_000},
            {type: 'add', target: 'some-package', options: {}},
          ])

          const changes = yield* source
            .changes()
            .pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped({startImmediately: true}))
          const watching = yield* Deferred.make<void>()
          yield* Stream.unwrap(
            watcher.subscribe({path: local, type: 'directory'}, Deferred.succeed(watching, undefined)),
          ).pipe(Stream.runDrain, Effect.forkScoped({startImmediately: true}))
          yield* Deferred.await(watching)

          yield* Effect.promise(() => writeFile(path.join(local, 'added.ts'), 'export {}\n'))
          expect(yield* Fiber.join(changes)).toEqual([undefined])
        }).pipe(Effect.provide(services(root, ['./local-plugin', 'some-package'])))
      }),
    5_000,
  )
  it.live(
    'reports a plugins folder created after start, a plugin folder in it, its deletion and its recreation',
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryProject
        const concivFolder = path.join(root, 'conciv')
        const plugins = path.join(concivFolder, 'plugins')

        yield* Effect.gen(function* () {
          const source = yield* ConfigPluginSource.Service
          const fs = yield* FSUtil.Service
          const changes = yield* Queue.unbounded<void>()
          yield* source.changes().pipe(
            Stream.runForEach((change) => Queue.offer(changes, change)),
            Effect.forkScoped({startImmediately: true}),
          )
          const untilSeen = (write: Effect.Effect<void, unknown>) =>
            Effect.gen(function* () {
              yield* Queue.clear(changes)
              const writes = yield* write.pipe(Effect.repeat(Schedule.spaced('10 millis')), Effect.forkScoped)
              return yield* Queue.take(changes).pipe(Effect.ensuring(Fiber.interrupt(writes)))
            })
          const recreatePlugins = Effect.suspend(() =>
            fs.remove(concivFolder, {recursive: true, force: true}).pipe(Effect.andThen(fs.ensureDir(plugins))),
          )

          expect(yield* untilSeen(recreatePlugins)).toBeUndefined()

          expect(
            yield* untilSeen(Effect.suspend(() => fs.ensureDir(path.join(plugins, `alpha-${Math.random()}`)))),
          ).toBeUndefined()

          yield* Queue.clear(changes)
          yield* fs.remove(concivFolder, {recursive: true, force: true})
          expect(yield* Queue.take(changes)).toBeUndefined()

          expect(yield* untilSeen(recreatePlugins)).toBeUndefined()
        }).pipe(Effect.provide(services(root, [])))
      }),
    5_000,
  )
})
