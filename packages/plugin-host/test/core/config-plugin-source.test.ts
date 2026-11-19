import {describe, expect} from 'vitest'
import {NodeFileSystem} from '@effect/platform-node'
import {Deferred, Effect, Fiber, Layer, Queue, Schedule, Stream} from 'effect'
import {mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {ConfigPluginSource} from '../../src/core/config/plugin/source.js'
import {Watcher} from '../../src/core/filesystem/watcher.js'
import {Location} from '../../src/core/location.js'
import {ProjectId} from '@conciv/plugin/schema/project-id'
import {AbsolutePath} from '@conciv/plugin/schema/schema'
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
        Layer.succeed(
          Location.Service,
          Location.Service.of({
            directory: AbsolutePath.make(root),
            project: {id: ProjectId.global, directory: AbsolutePath.make(root), canonical: AbsolutePath.make(root)},
          }),
        ),
      ),
    ),
  )

describe('ConfigPluginSource', () => {
  it.live(
    'lists the plugin folder before the configured entries and reports a write in a configured folder, also after that folder is deleted and created again and while it has no entrypoint',
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

          const later = yield* Queue.unbounded<void>()
          yield* source.changes().pipe(
            Stream.runForEach((change) => Queue.offer(later, change)),
            Effect.forkScoped({startImmediately: true}),
          )
          const localTime = source
            .operations()
            .pipe(
              Effect.map((operations) =>
                operations.flatMap((operation) =>
                  operation.type === 'add' && operation.target === local ? [operation.mtime] : [],
                ),
              ),
            )
          const untilLocalTime = (write: Effect.Effect<void>, expected: readonly (number | undefined)[]) =>
            Effect.gen(function* () {
              yield* Queue.clear(later)
              const writes = yield* write.pipe(
                Effect.uninterruptible,
                Effect.repeat(Schedule.spaced('10 millis')),
                Effect.forkScoped,
              )
              return yield* Queue.take(later).pipe(
                Effect.andThen(localTime),
                Effect.repeat({
                  until: (times) =>
                    times.length === expected.length && times.every((time, index) => time === expected[index]),
                }),
                Effect.ensuring(Fiber.interrupt(writes)),
              )
            })
          const entrypoint = path.join(local, 'index.ts')

          expect(
            yield* untilLocalTime(
              Effect.promise(() => rm(local, {recursive: true, force: true})),
              [undefined],
            ),
          ).toEqual([undefined])
          expect(yield* untilLocalTime(writeAt(entrypoint, 'export default {}\n', 4_000), [4_000_000])).toEqual([
            4_000_000,
          ])
          expect(yield* untilLocalTime(writeAt(path.join(local, 'package.json'), '{}\n', 5_000), [5_000_000])).toEqual([
            5_000_000,
          ])
          expect(
            yield* untilLocalTime(
              Effect.promise(() => rm(entrypoint, {force: true})),
              [],
            ),
          ).toEqual([])
          expect(yield* untilLocalTime(writeAt(entrypoint, 'export default {}\n', 6_000), [6_000_000])).toEqual([
            6_000_000,
          ])
        }).pipe(Effect.provide(services(root, ['./local-plugin', 'some-package'])))
      }),
    5_000,
  )
  it.live(
    'reports a plugins folder created after start, a plugin folder in it, its deletion, its recreation and a plugin added to it again',
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
          const folderTargets = source
            .operations()
            .pipe(Effect.map((operations) => operations.map(({target}) => target)))
          const untilState = (expected: readonly string[]) =>
            Queue.take(changes).pipe(
              Effect.andThen(folderTargets),
              Effect.repeat({until: (targets) => targets.join('\n') === expected.join('\n')}),
            )
          const untilSeen = (write: Effect.Effect<void, unknown>, expected: readonly string[]) =>
            Effect.gen(function* () {
              yield* Queue.clear(changes)
              const writes = yield* write.pipe(
                Effect.uninterruptible,
                Effect.repeat(Schedule.spaced('10 millis')),
                Effect.forkScoped,
              )
              return yield* untilState(expected).pipe(Effect.ensuring(Fiber.interrupt(writes)))
            })
          const recreatePlugins = Effect.suspend(() =>
            fs.remove(concivFolder, {recursive: true, force: true}).pipe(Effect.andThen(fs.ensureDir(plugins))),
          )
          const alpha = path.join(plugins, 'alpha')
          const writeAlpha = Effect.promise(() =>
            mkdir(alpha, {recursive: true}).then(() => writeFile(path.join(alpha, 'index.ts'), 'export default {}\n')),
          )

          expect(yield* untilSeen(recreatePlugins, [])).toEqual([])

          expect(yield* untilSeen(writeAlpha, [alpha])).toEqual([alpha])

          yield* Queue.clear(changes)
          yield* fs.remove(concivFolder, {recursive: true, force: true})
          expect(yield* untilState([])).toEqual([])

          yield* Queue.clear(changes)
          yield* fs.ensureDir(plugins)
          expect(yield* untilState([])).toEqual([])

          expect(yield* untilSeen(writeAlpha, [alpha])).toEqual([alpha])
        }).pipe(Effect.provide(services(root, [])))
      }),
    5_000,
  )
  it.live(
    'picks up a second plugin file added after the first in a project opened through a symlink',
    () =>
      Effect.gen(function* () {
        const temporary = yield* temporaryProject
        const real = path.join(temporary, 'real')
        const root = path.join(temporary, 'link')
        yield* Effect.promise(() => mkdir(real).then(() => symlink(real, root)))
        const plugins = path.join(root, 'conciv', 'plugins')
        const alpha = path.join(plugins, 'alpha.ts')
        const beta = path.join(plugins, 'beta.ts')

        yield* Effect.gen(function* () {
          const source = yield* ConfigPluginSource.Service
          const changes = yield* Queue.unbounded<void>()
          yield* source.changes().pipe(
            Stream.runForEach((change) => Queue.offer(changes, change)),
            Effect.forkScoped({startImmediately: true}),
          )
          const untilSeen = (file: string, expected: readonly string[]) =>
            Effect.gen(function* () {
              yield* Queue.clear(changes)
              const writes = yield* Effect.promise(() =>
                mkdir(plugins, {recursive: true}).then(() => writeFile(file, 'export default {}\n')),
              ).pipe(Effect.repeat(Schedule.spaced('10 millis')), Effect.forkScoped)
              return yield* Queue.take(changes).pipe(
                Effect.andThen(source.operations()),
                Effect.map((operations) => operations.map(({target}) => target)),
                Effect.repeat({until: (targets) => targets.join('\n') === expected.join('\n')}),
                Effect.ensuring(Fiber.interrupt(writes)),
              )
            })

          expect(yield* untilSeen(alpha, [alpha])).toEqual([alpha])
          expect(yield* untilSeen(beta, [alpha, beta])).toEqual([alpha, beta])
        }).pipe(Effect.provide(services(root, [])))
      }),
    5_000,
  )
})
