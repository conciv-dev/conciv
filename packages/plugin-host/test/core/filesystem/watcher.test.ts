import {describe, expect, test} from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import {NodeFileSystem, NodeServices} from '@effect/platform-node'
import {ConfigProvider, Deferred, Effect, Fiber, Layer, Logger, Option, Schedule, Schema, Stream} from 'effect'
import {FetchHttpClient} from 'effect/http'
import {AbsolutePath} from '@conciv/plugin/schema/schema'
import {FSUtil} from '../../../src/util/fs-util.js'
import {Global} from '../../../src/util/global.js'
import {Watcher} from '../../../src/core/filesystem/watcher.js'
import {FileSystem} from '../../../src/core/filesystem.js'
import * as FileSystemSearch from '../../../src/core/filesystem/search.js'
import {Location} from '../../../src/core/location.js'
import * as Ripgrep from '../../../src/core/ripgrep.js'
import * as RipgrepBinary from '../../../src/core/ripgrep/binary.js'
import {tmpdir} from '../fixture/tmpdir'
import {testEffect} from '../lib/effect'

const describeNative = process.env.CI ? describe.skip : describe

const it = testEffect(FSUtil.layer.pipe(Layer.provide(NodeFileSystem.layer)))

const watcherLayer = Watcher.layer().pipe(Layer.provide(Watcher.nativeLayer))

function withNative(native: Watcher.NativeInterface) {
  return Effect.provide(Watcher.layer().pipe(Layer.provide(Layer.succeed(Watcher.Native, native))))
}

function countingNative() {
  const counts = {subscribes: 0, unsubscribes: 0}
  const native: Watcher.NativeInterface = {
    subscribe: () =>
      Effect.sync(() => {
        counts.subscribes++
        return {
          unsubscribe: () => {
            counts.unsubscribes++
            return Promise.resolve()
          },
        }
      }),
  }
  return {native, counts}
}

describe('Watcher lifecycle', () => {
  it.live('ends the stream without logging an error when the watched directory is missing', () => {
    const errors: unknown[] = []
    const logger = Logger.make(({logLevel, message}) => {
      if (logLevel === 'Error') errors.push(message)
    })
    return withTmp((directory) =>
      Effect.gen(function* () {
        const watcher = yield* Watcher.Service
        const updates = yield* watcher.subscribe({path: path.join(directory, 'missing', 'a.ts'), type: 'file'})
        expect(Option.isNone(yield* Stream.runHead(updates))).toBe(true)
        expect(errors).toEqual([])
      }).pipe(Effect.provide(watcherLayer), Effect.provide(Logger.layer([logger]))),
    )
  })

  it.live('still logs an error when watching fails for a reason other than ENOENT', () => {
    const errors: unknown[] = []
    const logger = Logger.make(({logLevel, message}) => {
      if (logLevel === 'Error') errors.push(message)
    })
    return withTmp((directory) =>
      Effect.gen(function* () {
        const watcher = yield* Watcher.Service
        const updates = yield* watcher.subscribe({
          path: path.join(directory, 'bad\0dir', 'a.ts'),
          type: 'file',
        })
        expect(Option.isNone(yield* Stream.runHead(updates))).toBe(true)
        expect(errors).toHaveLength(1)
      }).pipe(Effect.provide(watcherLayer), Effect.provide(Logger.layer([logger]))),
    )
  })

  it.effect('signals readiness after acquisition and buffers updates published by the ready callback', () =>
    Effect.gen(function* () {
      const publish = yield* Deferred.make<(update: Watcher.Update) => void>()
      const acquired = yield* Deferred.make<void>()
      const counts = {ready: 0, closed: 0}
      yield* Effect.gen(function* () {
        const watcher = yield* Watcher.Service
        const consumer = yield* watcher
          .subscribe(
            {path: '/shared', type: 'entries', names: ['conciv.json']},
            Effect.gen(function* () {
              counts.ready++
              const notify = yield* Deferred.await(publish)
              notify({path: '/shared/conciv.json', type: 'create'})
            }),
          )
          .pipe(Effect.flatMap(Stream.runHead), Effect.forkScoped({startImmediately: true}))
        yield* Deferred.await(publish)
        expect(counts.ready).toBe(0)
        yield* Deferred.succeed(acquired, undefined)
        expect(Option.getOrUndefined(yield* Fiber.join(consumer))).toEqual({
          path: '/shared/conciv.json',
          type: 'create',
        })
        expect(counts).toEqual({ready: 1, closed: 1})
      }).pipe(
        withNative({
          subscribe: (input) =>
            Deferred.succeed(publish, input.publish).pipe(
              Effect.andThen(Deferred.await(acquired)),
              Effect.as({
                unsubscribe: async () => {
                  counts.closed++
                },
              }),
            ),
        }),
      )
    }),
  )

  it.effect('does not signal readiness for an unavailable native watch', () => {
    const counts = {ready: 0}
    return Effect.gen(function* () {
      const watcher = yield* Watcher.Service
      const stream = yield* watcher.subscribe(
        {path: '/unavailable', type: 'directory'},
        Effect.sync(() => {
          counts.ready++
        }),
      )
      yield* Stream.runDrain(stream)
      expect(counts.ready).toBe(0)
    }).pipe(withNative({subscribe: () => Effect.undefined}))
  })

  it.live('watches only named immediate entries, including missing directories', () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const native = yield* Watcher.Native
          const events: Watcher.Update[] = []
          yield* Effect.acquireRelease(
            native.subscribe({
              type: 'entries',
              target: tmp.path,
              names: ['conciv.json', '.conciv'],
              ignore: [],
              publish: (update) => events.push(update),
            }),
            (subscription) => Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve()),
          )
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(tmp.path, 'nested'))
            await fs.writeFile(path.join(tmp.path, 'nested', 'conciv.json'), 'ignored')
            await fs.writeFile(path.join(tmp.path, 'conciv.jsonc'), 'ignored')
            await fs.writeFile(path.join(tmp.path, 'conciv.json'), 'first')
          })
          yield* Effect.sync(() => events.length).pipe(
            Effect.filterOrFail((count) => count > 0),
            Effect.retry(Schedule.spaced('10 millis')),
            Effect.timeout('1 second'),
          )
          expect(events.every((update) => update.path === path.join(tmp.path, 'conciv.json'))).toBe(true)
          yield* Effect.sleep('10 millis')
          yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, '.conciv')))
          yield* Effect.sync(() => events.some((update) => update.path === path.join(tmp.path, '.conciv'))).pipe(
            Effect.filterOrFail(Boolean),
            Effect.retry(Schedule.spaced('10 millis')),
            Effect.timeout('1 second'),
          )
        }).pipe(Effect.provide(Watcher.nativeLayer)),
      ),
    ),
  )

  it.effect('interrupting a consumer interrupts a pending acquisition', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const counts = {ready: 0}
      yield* Effect.gen(function* () {
        const watcher = yield* Watcher.Service
        const consumer = yield* watcher
          .subscribe(
            {path: '/pending', type: 'directory'},
            Effect.sync(() => {
              counts.ready++
            }),
          )
          .pipe(Effect.flatMap(Stream.runDrain), Effect.forkScoped({startImmediately: true}))
        yield* Deferred.await(started)
        yield* Fiber.interrupt(consumer)
        expect(yield* Deferred.isDone(interrupted)).toBe(true)
        expect(counts.ready).toBe(0)
      }).pipe(
        withNative({
          subscribe: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
            ),
        }),
      )
    }),
  )

  it.effect('shares equivalent entry sets and releases exactly once after the final consumer', () => {
    const {native, counts} = countingNative()
    return Effect.gen(function* () {
      const watcher = yield* Watcher.Service
      const consume = (names: string[]) =>
        watcher
          .subscribe({path: '/shared', type: 'entries', names})
          .pipe(Effect.flatMap(Stream.runDrain), Effect.forkScoped({startImmediately: true}))
      const first = yield* consume(['conciv.json', '.conciv', 'conciv.json'])
      const second = yield* consume(['.conciv', 'conciv.json'])
      yield* Effect.yieldNow
      expect(counts.subscribes).toBe(1)

      yield* Fiber.interrupt(first)
      expect(counts.unsubscribes).toBe(0)

      yield* Fiber.interrupt(second)
      expect(counts.subscribes).toBe(1)
      expect(counts.unsubscribes).toBe(1)
    }).pipe(withNative(native))
  })

  it.effect('scope shutdown releases an active subscription exactly once', () => {
    const {native, counts} = countingNative()
    return Effect.gen(function* () {
      const consumer = yield* Effect.gen(function* () {
        const watcher = yield* Watcher.Service
        const updates = yield* watcher.subscribe({path: '/active', type: 'directory'})
        const consumer = yield* updates.pipe(Stream.runDrain, Effect.forkScoped({startImmediately: true}))
        yield* Effect.yieldNow
        expect(counts.subscribes).toBe(1)
        expect(counts.unsubscribes).toBe(0)
        return consumer
      }).pipe(withNative(native))
      yield* Fiber.join(consumer)
      expect(counts.unsubscribes).toBe(1)
    })
  })
})

function withTmp<A, E, R>(f: (directory: string) => Effect.Effect<A, E, R>) {
  return Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(Effect.flatMap((tmp) => f(tmp.path)))
}

describeNative('LocationWatcher', () => {
  it.live('limits file watches to the exact target', () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const watcher = yield* Watcher.Service
        const target = path.join(directory, 'conciv.json')
        const sibling = path.join(directory, 'other.json')
        const updates = yield* watcher.subscribe({path: target, type: 'file'})
        const update = yield* updates.pipe(Stream.take(1), Stream.runHead, Effect.forkScoped({startImmediately: true}))
        yield* fs.writeFileString(sibling, 'sibling')
        const writes = yield* Effect.suspend(() => fs.writeFileString(target, `target-${Math.random()}`)).pipe(
          Effect.repeat(Schedule.spaced('10 millis')),
          Effect.forkScoped,
        )
        const event = yield* Fiber.join(update).pipe(Effect.ensuring(Fiber.interrupt(writes)))

        expect(event.valueOrUndefined?.path).toBe(target)
      }).pipe(Effect.provide(watcherLayer)),
    ),
  )

  it.live('detects creation of a missing directory target', () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const watcher = yield* Watcher.Service
        const target = path.join(directory, 'generated')
        const updates = yield* watcher.subscribe({path: target, type: 'file'})
        const update = yield* updates.pipe(Stream.take(1), Stream.runHead, Effect.forkScoped({startImmediately: true}))
        const creates = yield* Effect.suspend(() =>
          fs.remove(target, {recursive: true, force: true}).pipe(Effect.andThen(fs.ensureDir(target))),
        ).pipe(Effect.repeat(Schedule.spaced('10 millis')), Effect.forkScoped)
        const event = yield* Fiber.join(update).pipe(Effect.ensuring(Fiber.interrupt(creates)))

        expect(event.valueOrUndefined?.path).toBe(target)
      }).pipe(Effect.provide(watcherLayer)),
    ),
  )

  it.live('skips changes inside a nested ignored directory while reporting its sibling and its removal', () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const watcher = yield* Watcher.Service
        const ignored = path.join(directory, 'nested', 'node_modules', 'dependency.js')
        const sibling = path.join(directory, 'nested', 'source.ts')
        yield* fs.ensureDir(path.dirname(ignored))
        const ready = yield* Deferred.make<void>()
        const seen = yield* Deferred.make<void>()
        const updates = yield* watcher.subscribe(
          {path: directory, type: 'directory', ignore: FSUtil.ignoreGlobs},
          Deferred.succeed(ready, undefined),
        )
        const collected = yield* updates.pipe(
          Stream.tap((update) => (update.path === sibling ? Deferred.succeed(seen, undefined) : Effect.void)),
          Stream.takeUntil((update) => update.path === sibling && update.type === 'delete'),
          Stream.runCollect,
          Effect.forkScoped({startImmediately: true}),
        )
        yield* Deferred.await(ready)
        yield* fs.writeFileString(ignored, 'ignored')
        const writes = yield* Effect.suspend(() => fs.writeFileString(sibling, `sibling-${Math.random()}`)).pipe(
          Effect.repeat(Schedule.spaced('10 millis')),
          Effect.forkScoped,
        )
        yield* Deferred.await(seen).pipe(Effect.ensuring(Fiber.interrupt(writes)))
        yield* fs.remove(sibling)
        const updatesSeen = yield* Fiber.join(collected)
        const paths = updatesSeen.map((update) => update.path)

        expect(updatesSeen.at(-1)).toEqual({path: sibling, type: 'delete'})
        expect(paths.filter((entry) => FSUtil.contains(path.dirname(ignored), entry))).toEqual([])
      }).pipe(Effect.provide(watcherLayer)),
    ),
  )
})

describe('FileSystem.find', () => {
  const findLayer = (directory: string, options: FileSystemSearch.Options) =>
    FileSystem.layer.pipe(
      Layer.provide(FileSystemSearch.configured(options)),
      Layer.provide(Ripgrep.layer),
      Layer.provide(RipgrepBinary.layer),
      Layer.provide(
        Layer.succeed(Location.Service, {
          ...Schema.decodeSync(Location.Info)({directory, project: {id: directory, directory, canonical: directory}}),
          vcs: {type: 'git', store: AbsolutePath.make(path.join(directory, '.git'))},
        }),
      ),
      Layer.provide(
        Global.layerWith({cache: path.join(directory, '.cache'), config: directory, state: directory, log: directory}),
      ),
      Layer.provide(FSUtil.layer),
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(NodeServices.layer),
    )

  const find = (directory: string, options: FileSystemSearch.Options, input: FileSystem.FindInput) =>
    FileSystem.Service.use((files) => files.find(input)).pipe(
      Effect.provide(findLayer(directory, options)),
      Effect.runPromise,
    )

  test('the ripgrep engine and the fff engine find a file and a directory by a fuzzy query', async () => {
    await using workspace = await tmpdir()
    await fs.mkdir(path.join(workspace.path, '.git'))
    await fs.mkdir(path.join(workspace.path, 'src'))
    await fs.mkdir(path.join(workspace.path, 'docs'))
    await fs.writeFile(path.join(workspace.path, 'src', 'alpha-needle.ts'), 'export {}\n')
    await fs.writeFile(path.join(workspace.path, 'src', 'beta.ts'), 'export {}\n')
    await fs.writeFile(path.join(workspace.path, 'docs', 'guide.md'), '# Guide\n')
    await fs.mkdir(path.join(workspace.path, '.github', 'workflows'), {recursive: true})
    await fs.writeFile(path.join(workspace.path, '.github', 'workflows', 'ci.yml'), 'on: push\n')

    for (const engine of [{fff: false}, {fff: true}]) {
      expect(await find(workspace.path, engine, {query: 'needle'})).toContainEqual({
        path: 'src/alpha-needle.ts',
        type: 'file',
      })
      expect(await find(workspace.path, engine, {query: 'docs', type: 'directory'})).toContainEqual({
        path: `docs${path.sep}`,
        type: 'directory',
      })
      expect(await find(workspace.path, engine, {query: 'guide', type: 'file', limit: 1})).toEqual([
        {path: 'docs/guide.md', type: 'file'},
      ])
    }
    expect(await find(workspace.path, {fff: false}, {query: 'ci.yml', type: 'file'})).toContainEqual({
      path: '.github/workflows/ci.yml',
      type: 'file',
    })
  })
})

describe('Watcher native binding path', () => {
  it.live('loads the binding from CONCIV_PARCEL_WATCHER_PATH under the provided ConfigProvider', () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const native = yield* Watcher.Native
        const subscription = yield* native.subscribe({
          target: directory,
          type: 'directory',
          ignore: [],
          publish: () => {},
        })
        yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
        expect(subscription).toBeUndefined()
        expect(process.env.CONCIV_PARCEL_WATCHER_PATH).toBeUndefined()
      }).pipe(
        Effect.provide(
          Watcher.nativeLayer.pipe(
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({
                  CONCIV_PARCEL_WATCHER_PATH: path.join(directory, 'missing-binding.node'),
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  )
})

describe('Watcher native file watches in one directory', () => {
  it.live('share one directory handle until the last of them is released', () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const native = yield* Watcher.Native
        const handles = () => process.getActiveResourcesInfo().filter((name) => name === 'FSEventWrap').length
        const before = handles()
        const subscriptions = yield* Effect.forEach(['a.js', 'b.js', 'c.js'], (name) =>
          native.subscribe({type: 'file', target: path.join(directory, name), ignore: [], publish: () => {}}),
        )
        const entries = yield* native.subscribe({
          type: 'entries',
          target: directory,
          names: ['conciv.json'],
          ignore: [],
          publish: () => {},
        })
        expect([...subscriptions, entries].every((subscription) => subscription?.backend === 'node')).toBe(true)
        expect(handles() - before).toBe(1)
        yield* Effect.promise(() => Promise.all(subscriptions.map((subscription) => subscription?.unsubscribe())))
        const later = yield* native.subscribe({
          type: 'file',
          target: path.join(directory, 'd.js'),
          ignore: [],
          publish: () => {},
        })
        expect(handles() - before).toBe(1)
        yield* Effect.promise(() => Promise.all([entries, later].map((subscription) => subscription?.unsubscribe())))
      }).pipe(Effect.provide(Watcher.nativeLayer)),
    ),
  )
})

function fileEventHandles() {
  return process.getActiveResourcesInfo().filter((name) => name === 'FSEventWrap').length
}

function watchOutcome(directory: string, layer: typeof watcherLayer) {
  return Effect.gen(function* () {
    const watcher = yield* Watcher.Service
    const before = fileEventHandles()
    const ready = yield* Deferred.make<number>()
    const updates = yield* watcher.subscribe(
      {path: path.join(directory, 'conciv.json'), type: 'file'},
      Effect.suspend(() => Deferred.succeed(ready, fileEventHandles() - before)),
    )
    return yield* Effect.race(
      Deferred.await(ready).pipe(Effect.map((handles) => ({watching: true, handles}))),
      Stream.runDrain(updates).pipe(Effect.map(() => ({watching: false, handles: fileEventHandles() - before}))),
    )
  }).pipe(Effect.provide(layer))
}

describe('Watcher under CONCIV_DISABLE_FILEWATCHER', () => {
  it.live('a provider disabling the watcher opens no native watch and ends the stream, the default watches', () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const disabled = watcherLayer.pipe(
          Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({CONCIV_DISABLE_FILEWATCHER: 'true'}))),
        )
        expect(yield* watchOutcome(directory, disabled)).toEqual({watching: false, handles: 0})
        expect(process.env.CONCIV_DISABLE_FILEWATCHER).toBeUndefined()
        expect(yield* watchOutcome(directory, watcherLayer)).toEqual({watching: true, handles: 1})
      }),
    ),
  )
})
