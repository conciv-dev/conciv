import {Effect, Exit, Semaphore} from 'effect'
import type {EvlogError} from 'evlog'
import type {Worker} from 'node:worker_threads'
import type {Content as ImageContent, Limits} from '@conciv/backend-app-api/core/image'
import {causeFrom, imageErrors} from '@conciv/errors'
import * as PhotonNormalize from './photon-normalize.js'
import type {Reply, Request} from './photon-worker.js'

const WORKER_IDLE_MILLIS = 10_000

const isWorkerUnavailable = (error: EvlogError) => error.code === imageErrors.WORKER_UNAVAILABLE.code

export const spawnWorker = (url?: URL) =>
  Effect.tryPromise({
    try: async (signal) => {
      const {Worker} = await import('node:worker_threads')
      const worker = new Worker(url ?? new URL('./photon-worker.js', import.meta.url))
      const abort = () => void worker.terminate()
      if (signal.aborted) abort()
      signal.addEventListener('abort', abort, {once: true})
      try {
        await new Promise<void>((resolve, reject) => {
          worker.once('message', () => resolve())
          worker.once('error', reject)
          worker.once('exit', (code) => reject(imageErrors.WORKER_EXITED({code})))
        })
      } catch (cause) {
        void worker.terminate()
        throw cause
      }
      return worker
    },
    catch: (cause) => imageErrors.WORKER_UNAVAILABLE(causeFrom(cause)),
  })

const request = (worker: Worker, content: PhotonNormalize.Content, limits: Readonly<Limits>) =>
  Effect.callback<PhotonNormalize.Result>((resume) => {
    const settle = (effect: Effect.Effect<PhotonNormalize.Result>) => {
      cleanup()
      resume(effect)
    }
    const reply = (reply: Reply) => {
      if (reply._tag === 'Done') settle(Effect.succeed(reply.result))
    }
    const error = (error: Error) => settle(Effect.die(imageErrors.WORKER_FAILED({reason: error.message, cause: error})))
    const exit = (code: number) => settle(Effect.die(imageErrors.WORKER_EXITED({code})))
    const cleanup = () => {
      worker.off('message', reply).off('messageerror', error).off('error', error).off('exit', exit)
      worker.unref()
    }
    worker.on('message', reply).on('messageerror', error).on('error', error).on('exit', exit)
    worker.ref()
    worker.postMessage({content, limits} satisfies Request)
    return Effect.sync(cleanup)
  })

export function makeWith(spawn: Effect.Effect<Worker, EvlogError>, idleMillis = WORKER_IDLE_MILLIS) {
  const permit = Semaphore.makeUnsafe(1)
  let current: Worker | undefined
  let idle: ReturnType<typeof setTimeout> | undefined
  let useWorker = true
  let photon: Promise<PhotonNormalize.Photon> | undefined

  const discard = (worker: Worker) => {
    if (current === worker) current = undefined
    void worker.terminate()
  }
  const track = (worker: Worker) =>
    Effect.sync(() => {
      current = worker
      worker.unref()
      const forget = () => {
        if (current === worker) current = undefined
      }
      worker.on('error', forget).once('exit', forget)
      return worker
    })
  const inWorker = (content: PhotonNormalize.Content, limits: Readonly<Limits>) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        clearTimeout(idle)
        const worker = current ?? (yield* restore(spawn).pipe(Effect.flatMap(track)))
        return yield* restore(request(worker, content, limits)).pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              if (Exit.isFailure(exit)) return discard(worker)
              idle = setTimeout(() => discard(worker), idleMillis)
              idle.unref()
            }),
          ),
        )
      }),
    ).pipe(permit.withPermits(1))
  const inProcess = (content: PhotonNormalize.Content, limits: Readonly<Limits>) =>
    Effect.tryPromise({
      try: () => (photon ??= PhotonNormalize.load()),
      catch: (cause) => imageErrors.RESIZER_UNAVAILABLE(causeFrom(cause)),
    }).pipe(Effect.map((photon) => PhotonNormalize.normalize(photon, content, limits)))

  return Effect.fn('Image.Photon.normalize')(function* (
    resource: string,
    content: ImageContent & {readonly encoding: 'base64'},
    limits: Readonly<Limits>,
  ) {
    if (!PhotonNormalize.available) return yield* Effect.fail(imageErrors.RESIZER_UNAVAILABLE())
    const result = useWorker
      ? yield* inWorker(content, limits).pipe(
          Effect.catchIf(isWorkerUnavailable, (error) => {
            if (!useWorker) return inProcess(content, limits)
            useWorker = false
            return Effect.logWarning('photon worker unavailable, resizing images on the main thread', {
              cause: error.cause,
            }).pipe(Effect.andThen(inProcess(content, limits)))
          }),
        )
      : yield* inProcess(content, limits)
    switch (result._tag) {
      case 'Unchanged':
        return content
      case 'Content':
        return result.content
      case 'DecodeError':
        return yield* Effect.fail(imageErrors.DECODE_FAILED({resource}))
      case 'SizeError': {
        const {_tag, ...size} = result
        return yield* Effect.fail(imageErrors.TOO_LARGE({resource, ...size}))
      }
    }
  })
}

export const make = Effect.succeed(makeWith(spawnWorker()))
