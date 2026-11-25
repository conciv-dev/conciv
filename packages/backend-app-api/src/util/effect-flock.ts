import path from 'path'
import os from 'os'
import {randomUUID} from 'crypto'
import {Context, Effect, Function, Layer, Option, Schedule, Schema} from 'effect'
import type {FileSystem, Scope} from 'effect'
import type {PlatformError} from 'effect/PlatformError'
import {FSUtil} from './fs-util.js'
import {Global} from './global.js'
import {Hash} from './hash.js'

export namespace EffectFlock {
  export const LockTimeoutError = Schema.TaggedStruct('LockTimeoutError', {
    key: Schema.String,
  })
  export type LockTimeoutError = typeof LockTimeoutError.Type & globalThis.Error
  export const makeLockTimeoutError = (fields: Omit<typeof LockTimeoutError.Type, '_tag'>): LockTimeoutError =>
    Object.assign(new globalThis.Error(''), LockTimeoutError.make(fields), {name: 'LockTimeoutError'})

  export const LockCompromisedError = Schema.TaggedStruct('LockCompromisedError', {
    detail: Schema.String,
  })
  export type LockCompromisedError = typeof LockCompromisedError.Type & globalThis.Error
  export const makeLockCompromisedError = (
    fields: Omit<typeof LockCompromisedError.Type, '_tag'>,
  ): LockCompromisedError =>
    Object.assign(new globalThis.Error(''), LockCompromisedError.make(fields), {name: 'LockCompromisedError'})

  const ReleaseError = Schema.TaggedStruct('ReleaseError', {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  })
  type ReleaseError = typeof ReleaseError.Type & globalThis.Error
  const makeReleaseError = (fields: Omit<typeof ReleaseError.Type, '_tag'>): ReleaseError =>
    Object.assign(new globalThis.Error(fields.detail, {cause: fields.cause}), ReleaseError.make(fields), {
      name: 'ReleaseError',
    })

  const NotAcquired = Schema.TaggedStruct('NotAcquired', {})
  type NotAcquired = typeof NotAcquired.Type & globalThis.Error
  const makeNotAcquired = (): NotAcquired =>
    Object.assign(new globalThis.Error(''), NotAcquired.make({}), {name: 'NotAcquired'})

  export type LockError = LockTimeoutError | LockCompromisedError

  export interface Options {
    readonly staleMs?: number
    readonly timeoutMs?: number
  }

  const DEFAULT_STALE_MS = 60_000
  const DEFAULT_TIMEOUT_MS = 5 * 60_000
  const BASE_DELAY_MS = 100
  const MAX_DELAY_MS = 2_000

  const retrySchedule = (timeoutMs: number) =>
    Schedule.min([
      Schedule.exponential(BASE_DELAY_MS, 1.7),
      Schedule.spaced(Math.min(MAX_DELAY_MS, Math.max(BASE_DELAY_MS, Math.floor(timeoutMs / 10)))),
    ]).pipe(
      Schedule.jittered,
      Schedule.while((meta) => meta.elapsed < timeoutMs),
    )

  const LockMetaJson = Schema.fromJsonString(
    Schema.Struct({
      token: Schema.String,
      pid: Schema.Number,
      hostname: Schema.String,
      createdAt: Schema.String,
    }),
  )

  const decodeMeta = Schema.decodeUnknownSync(LockMetaJson)
  const encodeMeta = Schema.encodeSync(LockMetaJson)

  export interface Interface {
    readonly acquire: (key: string, dir?: string, options?: Options) => Effect.Effect<void, LockError, Scope.Scope>
    readonly withLock: {
      (key: string, dir?: string): <A, E, R>(body: Effect.Effect<A, E, R>) => Effect.Effect<A, E | LockError, R>
      <A, E, R>(body: Effect.Effect<A, E, R>, key: string, dir?: string): Effect.Effect<A, E | LockError, R>
    }
  }

  export const Service = Context.Service<Interface>('EffectFlock')

  function wall() {
    return performance.timeOrigin + performance.now()
  }

  const mtimeMs = (info: FileSystem.File.Info) => Option.getOrElse(info.mtime, () => new Date(0)).getTime()

  const isPathGone = (e: PlatformError) => e.reason._tag === 'NotFound' || e.reason._tag === 'Unknown'

  export const layer: Layer.Layer<Interface, never, Global.Interface | FSUtil.Interface> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const global = yield* Global.Service
      const fs = yield* FSUtil.Service
      const lockRoot = path.join(global.state, 'locks')
      const hostname = os.hostname()
      const ensuredDirs = new Set<string>()

      const safeStat = (file: string) =>
        fs.stat(file).pipe(
          Effect.catchIf(isPathGone, () => Effect.void),
          Effect.orDie,
        )

      const forceRemove = (target: string) => fs.remove(target, {recursive: true}).pipe(Effect.ignore)

      const atomicMkdir = (dir: string) =>
        fs.makeDirectory(dir, {mode: 0o700}).pipe(
          Effect.as(true),
          Effect.catchIf(
            (e) => e.reason._tag === 'AlreadyExists',
            () => Effect.succeed(false),
          ),
          Effect.orDie,
        )

      const exclusiveWrite = (filePath: string, content: string, lockDir: string, detail: string) =>
        fs.writeFileString(filePath, content, {flag: 'wx'}).pipe(
          Effect.catch(() =>
            Effect.gen(function* () {
              yield* forceRemove(lockDir)
              return yield* Effect.fail(makeLockCompromisedError({detail}))
            }),
          ),
        )

      const cleanStaleBreaker = Effect.fnUntraced(function* (breakerPath: string, staleMs: number) {
        const bs = yield* safeStat(breakerPath)
        if (bs && wall() - mtimeMs(bs) > staleMs) yield* forceRemove(breakerPath)
        return false
      })

      const ensureDir = Effect.fnUntraced(function* (dir: string) {
        if (ensuredDirs.has(dir)) return
        yield* fs.makeDirectory(dir, {recursive: true}).pipe(Effect.orDie)
        ensuredDirs.add(dir)
      })

      const isStale = Effect.fnUntraced(function* (
        lockDir: string,
        heartbeatPath: string,
        metaPath: string,
        staleMs: number,
      ) {
        const now = wall()

        const hb = yield* safeStat(heartbeatPath)
        if (hb) return now - mtimeMs(hb) > staleMs

        const meta = yield* safeStat(metaPath)
        if (meta) return now - mtimeMs(meta) > staleMs

        const dir = yield* safeStat(lockDir)
        if (!dir) return false

        return now - mtimeMs(dir) > staleMs
      })

      type Handle = {token: string; metaPath: string; heartbeatPath: string; lockDir: string}

      const tryAcquireLockDir = (lockDir: string, key: string, staleMs: number) =>
        Effect.gen(function* () {
          const token = randomUUID()
          const metaPath = path.join(lockDir, 'meta.json')
          const heartbeatPath = path.join(lockDir, 'heartbeat')

          const created = yield* atomicMkdir(lockDir)

          if (!created) {
            if (!(yield* isStale(lockDir, heartbeatPath, metaPath, staleMs)))
              return yield* Effect.fail(makeNotAcquired())

            const breakerPath = lockDir + '.breaker'

            const claimed = yield* fs.makeDirectory(breakerPath, {mode: 0o700}).pipe(
              Effect.as(true),
              Effect.catchIf(
                (e) => e.reason._tag === 'AlreadyExists',
                () => cleanStaleBreaker(breakerPath, staleMs),
              ),
              Effect.catchIf(isPathGone, () => Effect.succeed(false)),
              Effect.orDie,
            )

            if (!claimed) return yield* Effect.fail(makeNotAcquired())

            const recreated = yield* Effect.gen(function* () {
              if (!(yield* isStale(lockDir, heartbeatPath, metaPath, staleMs))) return false
              yield* forceRemove(lockDir)
              return yield* atomicMkdir(lockDir)
            }).pipe(Effect.ensuring(forceRemove(breakerPath)))

            if (!recreated) return yield* Effect.fail(makeNotAcquired())
          }

          yield* exclusiveWrite(heartbeatPath, '', lockDir, 'heartbeat already existed')

          const metaJson = encodeMeta({token, pid: process.pid, hostname, createdAt: new Date().toISOString()})
          yield* exclusiveWrite(metaPath, metaJson, lockDir, 'meta.json already existed')

          return {token, metaPath, heartbeatPath, lockDir} satisfies Handle
        }).pipe(
          Effect.withSpan('EffectFlock.tryAcquire', {
            attributes: {key},
          }),
        )

      const acquireHandle = (
        lockfile: string,
        key: string,
        options: {staleMs: number; timeoutMs: number},
      ): Effect.Effect<Handle, LockError> =>
        tryAcquireLockDir(lockfile, key, options.staleMs).pipe(
          Effect.retry({
            while: (err) => err._tag === 'NotAcquired',
            schedule: retrySchedule(options.timeoutMs),
          }),
          Effect.catchTag('NotAcquired', () => Effect.fail(makeLockTimeoutError({key}))),
          Effect.timeoutOrElse({
            duration: options.timeoutMs,
            orElse: () => Effect.fail(makeLockTimeoutError({key})),
          }),
        )

      const release = (handle: Handle) =>
        Effect.gen(function* () {
          const raw = yield* fs.readFileString(handle.metaPath).pipe(
            Effect.catch((err) => {
              if (isPathGone(err)) return Effect.die(makeReleaseError({detail: 'metadata missing'}))
              return Effect.die(err)
            }),
          )

          const parsed = yield* Effect.try({
            try: () => decodeMeta(raw),
            catch: (cause) => makeReleaseError({detail: 'metadata invalid', cause}),
          }).pipe(Effect.orDie)

          if (parsed.token !== handle.token) return yield* Effect.die(makeReleaseError({detail: 'token mismatch'}))

          yield* forceRemove(handle.lockDir)
        })

      const acquire = Effect.fn('EffectFlock.acquire')(function* (key: string, dir?: string, options: Options = {}) {
        const lockDir = dir ?? lockRoot
        const staleMs = options.staleMs ?? DEFAULT_STALE_MS
        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
        yield* ensureDir(lockDir)

        const lockfile = path.join(lockDir, Hash.fast(key) + '.lock')

        const handle = yield* Effect.acquireRelease(acquireHandle(lockfile, key, {staleMs, timeoutMs}), (handle) =>
          release(handle),
        )

        yield* Effect.suspend(() => {
          const now = new Date()
          return fs.utimes(handle.heartbeatPath, now, now)
        }).pipe(
          Effect.ignore,
          Effect.repeat(Schedule.spaced(Math.max(100, Math.floor(staleMs / 3)))),
          Effect.forkScoped,
        )
      })

      const withLock: Interface['withLock'] = Function.dual(
        (args) => Effect.isEffect(args[0]),
        <A, E, R>(body: Effect.Effect<A, E, R>, key: string, dir?: string): Effect.Effect<A, E | LockError, R> =>
          Effect.scoped(
            Effect.gen(function* () {
              yield* acquire(key, dir)
              return yield* body
            }),
          ),
      )

      return Service.of({acquire, withLock})
    }),
  )
}
