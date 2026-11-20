export * as Watcher from './watcher.js'

import {hasMagic} from 'glob'
import picomatch from 'picomatch'
import {FSUtil} from '../../util/fs-util.js'
import {isRecord} from '../../util/record.js'
import {Cause, Config, Context, Effect, Exit, Layer, Option, PubSub, RcMap, Scope, Stream} from 'effect'
import {lazy} from '../util/lazy.js'
import {watch} from 'node:fs'
import path from 'path'
import loadBinding from './watcher-binding.js'

const SUBSCRIBE_TIMEOUT_MS = 10_000

type Backend = 'fs-events' | 'inotify' | 'windows'

export type Update = {readonly path: string; readonly type: 'create' | 'update' | 'delete'}

type SubscribeCallback = (error: Error | null, updates: readonly Update[]) => void

type BindingOptions = {
  readonly backend: Backend
  readonly ignorePaths: readonly string[]
  readonly ignoreGlobs: readonly string[]
}

type Binding = {
  readonly subscribe: (directory: string, callback: SubscribeCallback, options: BindingOptions) => Promise<void>
  readonly unsubscribe: (directory: string, callback: SubscribeCallback, options: BindingOptions) => Promise<void>
}

const BindingPathConfig = Config.option(Config.String('CONCIV_PARCEL_WATCHER_PATH')).pipe(
  Config.map(Option.getOrUndefined),
)

function tryLoadBinding(bindingPath: string | undefined): Binding | undefined {
  try {
    return loadBinding(bindingPath)
  } catch {
    return
  }
}

function bindingOptions(directory: string, ignore: readonly string[], backend: Backend): BindingOptions {
  return {
    backend,
    ignorePaths: ignore.filter((entry) => !hasMagic(entry)).map((entry) => path.resolve(directory, entry)),
    ignoreGlobs: ignore
      .filter((entry) => hasMagic(entry))
      .map((glob) => picomatch.makeRe(glob, {dot: true, windows: process.platform === 'win32'}).source),
  }
}

function getBackend(): Backend | undefined {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'fs-events'
  if (process.platform === 'linux') return 'inotify'
}

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

export const Native = Context.Service<NativeInterface>('@conciv/Watcher/Native')

export interface Interface {
  readonly subscribe: (input: WatchInput, onReady?: Effect.Effect<void>) => Effect.Effect<Stream.Stream<Update>>
}

export interface Options {
  readonly enabled?: boolean
}

export const Service = Context.Service<Interface>('@conciv/Watcher')

interface TestInterface extends Interface {
  readonly emit: (update: Update) => Effect.Effect<void>
  readonly subscriptions: () => Effect.Effect<readonly WatchInput[]>
}

export const Test = Context.Service<TestInterface>('@conciv/Watcher/Test')

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
        const key: Target = {type: input.type, target, ignore, names}
        const rootDeleted = (update: Update) =>
          input.type === 'directory' && update.type === 'delete' && update.path === target
        return Stream.unwrap(
          Effect.gen(function* () {
            const pubsub = yield* RcMap.get(watchers, key)
            const subscription = yield* PubSub.subscribe(pubsub)
            if (yield* PubSub.isShutdown(pubsub)) return Stream.empty
            yield* onReady
            return Stream.fromSubscription(subscription).pipe(
              Stream.takeUntil(rootDeleted),
              Stream.tap((update) => (rootDeleted(update) ? RcMap.invalidate(watchers, key) : Effect.void)),
            )
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

export const nativeLayer = Layer.effect(
  Native,
  Effect.gen(function* () {
    const bindingPath = yield* BindingPathConfig.pipe(
      Effect.catch((error) =>
        Effect.logError('the watcher binding path could not be read', {error}).pipe(Effect.as(undefined)),
      ),
    )
    const watcher = lazy(() => tryLoadBinding(bindingPath))
    const directories = yield* RcMap.make({
      lookup: (directory: string) =>
        Effect.acquireRelease(
          Effect.try({try: () => watch(directory, {recursive: false}), catch: (error) => error}),
          (handle) => Effect.sync(() => handle.close()),
        ).pipe(
          Effect.tap((handle) =>
            Effect.sync(() =>
              handle.on('error', (error: unknown) =>
                Effect.runFork(Effect.logError('watcher callback failed', {path: directory, error})),
              ),
            ),
          ),
        ),
    })
    return Native.of({
      subscribe: (input) => {
        if (input.type === 'file' || input.type === 'entries') {
          const directory = input.type === 'file' ? path.dirname(input.target) : input.target
          const names = new Set(input.type === 'file' ? [path.basename(input.target)] : input.names)
          const listener = (_event: string, file: string | null) => {
            if (file && !names.has(file)) return
            for (const name of file ? [file] : names) {
              input.publish({path: path.join(directory, name), type: 'update'})
            }
          }
          return Effect.gen(function* () {
            const scope = yield* Scope.make()
            const handle = yield* RcMap.get(directories, directory).pipe(
              Scope.provide(scope),
              Effect.onError(() => Scope.close(scope, Exit.void)),
            )
            handle.on('change', listener)
            yield* Scope.addFinalizer(
              scope,
              Effect.sync(() => handle.off('change', listener)),
            )
            return {
              unsubscribe: () => Effect.runPromise(Scope.close(scope, Exit.void)),
              backend: 'node',
            } satisfies Subscription
          }).pipe(
            Effect.catch((error) =>
              isRecord(error) && error.code === 'ENOENT'
                ? Effect.undefined
                : Effect.logError('failed to watch directory', {path: directory, error}).pipe(Effect.as(undefined)),
            ),
          )
        }
        return subscribeDirectory(watcher(), getBackend(), input.target, input.ignore, input.publish)
      },
    })
  }),
)

function subscribeDirectory(
  native: Binding | undefined,
  backend: Backend | undefined,
  directory: string,
  ignore: readonly string[],
  publish: (update: Update) => void,
): Effect.Effect<Subscription | undefined> {
  if (!native || !backend) {
    return Effect.logError('watcher backend not supported', {directory, platform: process.platform}).pipe(
      Effect.as(undefined),
    )
  }
  const callback: SubscribeCallback = (error, updates) => {
    if (error) Effect.runFork(Effect.logError('watcher callback failed', {error}))
    if (updates.some((update) => update.type === 'delete' && update.path === directory)) {
      unsubscribe().catch((unsubscribeError: unknown) =>
        Effect.runFork(Effect.logError('failed to unsubscribe', {directory, error: unsubscribeError})),
      )
    }
    for (const update of updates) publish(update)
  }
  const options = bindingOptions(directory, ignore, backend)
  const unsubscribe = lazy(() => native.unsubscribe(directory, callback, options))
  const pending = native.subscribe(directory, callback, options)
  return Effect.promise(() => pending).pipe(
    Effect.map(() => ({unsubscribe, backend})),
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        pending
          .then(unsubscribe)
          .catch((error: unknown) => Effect.runFork(Effect.logError('failed to unsubscribe', {directory, error})))
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
