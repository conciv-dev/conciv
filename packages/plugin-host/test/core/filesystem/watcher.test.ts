import {describe, expect} from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import {NodeFileSystem} from '@effect/platform-node'
import {Deferred, Effect, Fiber, Layer, Logger, Option, Schedule, Stream} from 'effect'
import {FSUtil} from '../../../src/util/fs-util.js'
import {Watcher} from '../../../src/core/filesystem/watcher.js'
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
            {path: '/shared', type: 'entries', names: ['opencode.json']},
            Effect.gen(function* () {
              counts.ready++
              const notify = yield* Deferred.await(publish)
              notify({path: '/shared/opencode.json', type: 'create'})
            }),
          )
          .pipe(Effect.flatMap(Stream.runHead), Effect.forkScoped({startImmediately: true}))
        yield* Deferred.await(publish)
        expect(counts.ready).toBe(0)
        yield* Deferred.succeed(acquired, undefined)
        expect(Option.getOrUndefined(yield* Fiber.join(consumer))).toEqual({
          path: '/shared/opencode.json',
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
              names: ['opencode.json', '.opencode'],
              ignore: [],
              publish: (update) => events.push(update),
            }),
            (subscription) => Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve()),
          )
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(tmp.path, 'nested'))
            await fs.writeFile(path.join(tmp.path, 'nested', 'opencode.json'), 'ignored')
            await fs.writeFile(path.join(tmp.path, 'opencode.jsonc'), 'ignored')
            await fs.writeFile(path.join(tmp.path, 'opencode.json'), 'first')
          })
          yield* Effect.sync(() => events.length).pipe(
            Effect.filterOrFail((count) => count > 0),
            Effect.retry(Schedule.spaced('10 millis')),
            Effect.timeout('1 second'),
          )
          expect(events.every((update) => update.path === path.join(tmp.path, 'opencode.json'))).toBe(true)
          yield* Effect.sleep('10 millis')
          yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, '.opencode')))
          yield* Effect.sync(() => events.some((update) => update.path === path.join(tmp.path, '.opencode'))).pipe(
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
      const first = yield* consume(['opencode.json', '.opencode', 'opencode.json'])
      const second = yield* consume(['.opencode', 'opencode.json'])
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
        const target = path.join(directory, 'opencode.json')
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
})
