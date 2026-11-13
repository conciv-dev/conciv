export * as Watcher from './watcher.js'

// @ts-ignore
import {createWrapper} from '@parcel/watcher/wrapper.js'
import type ParcelWatcher from '@parcel/watcher'
import {FSUtil} from '../../util/fs-util.js'
import {isRecord} from '../../util/record.js'
import {Cause, Context, Effect, Layer, PubSub, RcMap, Stream} from 'effect'
import {lazy} from '../util/lazy.js'
import {watch} from 'node:fs'
import path from 'path'
import loadBinding from './watcher-binding.js'

const SUBSCRIBE_TIMEOUT_MS = 10_000

const watcher = lazy((): typeof ParcelWatcher | undefined => {
  try {
    return createWrapper(loadBinding()) as typeof ParcelWatcher
  } catch {
    return
  }
})

function getBackend() {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'fs-events'
  if (process.platform === 'linux') return 'inotify'
}

export const hasNativeBinding = () => !!watcher()
export type Update = ParcelWatcher.Event

export type WatchInput =
  | {readonly path: string; readonly type: 'file'}
  | {readonly path: string; readonly type: 'entries'; readonly names: readonly string[]}
  | {readonly path: string; readonly type: 'directory'; readonly ignore?: readonly string[]}

type Subscription = {
  readonly unsubscribe: () => Promise<void>
  readonly backend?: string
}

type Target = {
  readonly target: string
  readonly ignore: readonly string[]
} & (
  | {readonly type: 'entries'; readonly names: readonly string[]}
  | {readonly type: 'file' | 'directory'; readonly names?: readonly string[]}
)

export interface NativeInterface {
  readonly subscribe: (
    input: Target & {readonly publish: (update: Update) => void},
  ) => Effect.Effect<Subscription | undefined>
}

export const Native = Context.Service<NativeInterface>('@opencode/Watcher/Native')

export interface Interface {
  readonly subscribe: (input: WatchInput, onReady?: Effect.Effect<void>) => Effect.Effect<Stream.Stream<Update>>
}

export interface Options {
  readonly enabled?: boolean
}

export const Service = Context.Service<Interface>('@opencode/Watcher')

interface TestInterface extends Interface {
  readonly emit: (update: Update) => Effect.Effect<void>
  readonly subscriptions: () => Effect.Effect<readonly WatchInput[]>
}

export const Test = Context.Service<TestInterface>('@opencode/Watcher/Test')

export const layer = (options?: Options) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      if (options?.enabled === false) {
        return Service.of({subscribe: () => Effect.succeed(Stream.empty)})
      }
      const native = yield* Native

      const watchers = yield* RcMap.make({
        lookup: (key: Target) =>
          Effect.gen(function* () {
            const pubsub = yield* Effect.acquireRelease(PubSub.unbounded<Update>(), (pubsub) => PubSub.shutdown(pubsub))
            const subscription = yield* Effect.acquireRelease(
              native.subscribe({
                ...key,
                publish: (update) => PubSub.publishUnsafe(pubsub, update),
              }),
              (subscription) =>
                subscription
                  ? Effect.promise(() => subscription.unsubscribe()).pipe(
                      Effect.ignoreCause,
                      Effect.andThen(Effect.logInfo('watcher stopped', {path: key.target, type: key.type})),
                    )
                  : Effect.void,
              {interruptible: true},
            )
            if (!subscription) {
              yield* PubSub.shutdown(pubsub)
              return pubsub
            }
            yield* Effect.logInfo('watcher started', {
              path: key.target,
              type: key.type,
              backend: subscription.backend,
              ignores: key.ignore.length,
            })
            return pubsub
          }),
      })

      const subscribe = Effect.fnUntraced(function* (input: WatchInput, onReady: Effect.Effect<void> = Effect.void) {
        const target = path.resolve(input.path)
        const ignore = [...new Set(input.type === 'directory' ? (input.ignore ?? []) : [])].toSorted()
        const names = [...new Set(input.type === 'entries' ? input.names : [])].toSorted()
        yield* Effect.logInfo('watcher subscribe', {
          path: target,
          type: input.type,
          ignores: ignore.length,
        })
        return Stream.unwrap(
          Effect.gen(function* () {
            const pubsub = yield* RcMap.get(watchers, {type: input.type, target, ignore, names})
            const subscription = yield* PubSub.subscribe(pubsub)
            if (yield* PubSub.isShutdown(pubsub)) return Stream.empty
            yield* onReady
            return Stream.fromSubscription(subscription)
          }),
        )
      })

      return Service.of({subscribe})
    }),
  )

export const testLayer = Layer.effectContext(
  Effect.gen(function* () {
    const subscriptions: WatchInput[] = []
    const active = new Map<(update: Update) => void, (path: string) => boolean>()
    const native = Native.of({
      subscribe: (input) =>
        Effect.sync(() => {
          subscriptions.push(
            input.type === 'file'
              ? {path: input.target, type: 'file'}
              : input.type === 'entries'
                ? {path: input.target, type: 'entries', names: input.names}
                : input.ignore.length > 0
                  ? {path: input.target, type: 'directory', ignore: input.ignore}
                  : {path: input.target, type: 'directory'},
          )
          const ignored = input.ignore.map((entry) => path.resolve(input.target, entry))
          active.set(input.publish, (target) => {
            if (input.type === 'file') return target === input.target
            if (input.type === 'entries')
              return path.dirname(target) === input.target && input.names.includes(path.basename(target))
            return FSUtil.contains(input.target, target) && !ignored.some((entry) => FSUtil.contains(entry, target))
          })
          return {
            unsubscribe: () => {
              active.delete(input.publish)
              return Promise.resolve()
            },
          }
        }),
    })
    const context = yield* Layer.build(layer().pipe(Layer.provide(Layer.succeed(Native, native))))
    const test = Test.of({
      subscribe: Context.get(context, Service).subscribe,
      emit: (update) =>
        Effect.sync(() => {
          const target = path.resolve(update.path)
          active.forEach((matches, publish) => {
            if (matches(target)) publish(update)
          })
        }),
      subscriptions: () => Effect.sync(() => [...subscriptions]),
    })
    return Context.empty().pipe(Context.add(Service, test), Context.add(Test, test))
  }),
)

export const nativeLayer = Layer.succeed(
  Native,
  Native.of({
    subscribe: (input) => {
      if (input.type === 'file' || input.type === 'entries') {
        const directory = input.type === 'file' ? path.dirname(input.target) : input.target
        const names = new Set(input.type === 'file' ? [path.basename(input.target)] : input.names)
        return Effect.try({
          try: () =>
            watch(directory, {recursive: false}, (_event, file) => {
              if (file && !names.has(file)) return
              for (const name of file ? [file] : names) {
                input.publish({path: path.join(directory, name), type: 'update'})
              }
            }),
          catch: (error) => error,
        }).pipe(
          Effect.map((subscription): Subscription => {
            subscription.on('error', (error: unknown) =>
              Effect.runFork(Effect.logError('watcher callback failed', {path: directory, error})),
            )
            return {unsubscribe: () => Promise.resolve(subscription.close()), backend: 'node'}
          }),
          Effect.catch((error) =>
            isRecord(error) && error.code === 'ENOENT'
              ? Effect.undefined
              : Effect.logError('failed to watch directory', {path: directory, error}).pipe(Effect.as(undefined)),
          ),
        )
      }
      return subscribeDirectory(watcher(), getBackend(), input.target, input.ignore, input.publish)
    },
  }),
)

function subscribeDirectory(
  native: typeof ParcelWatcher | undefined,
  backend: ParcelWatcher.BackendType | undefined,
  directory: string,
  ignore: readonly string[],
  publish: (update: Update) => void,
): Effect.Effect<Subscription | undefined> {
  if (!native || !backend) {
    return Effect.logError('watcher backend not supported', {directory, platform: process.platform}).pipe(
      Effect.as(undefined),
    )
  }
  const callback: ParcelWatcher.SubscribeCallback = (error, updates) => {
    if (error) Effect.runFork(Effect.logError('watcher callback failed', {error}))
    for (const update of updates) publish(update)
  }
  const pending = native.subscribe(directory, callback, {ignore: [...ignore], backend})
  return Effect.promise(() => pending).pipe(
    Effect.map((subscription) => ({unsubscribe: () => subscription.unsubscribe(), backend})),
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        pending.then((subscription) => subscription.unsubscribe()).catch(() => {})
      }),
    ),
    Effect.timeout(SUBSCRIBE_TIMEOUT_MS),
    Effect.catchCause((cause) =>
      Effect.logError('failed to subscribe', {
        directory,
        cause: Cause.pretty(cause),
      }).pipe(Effect.as(undefined)),
    ),
  )
}
