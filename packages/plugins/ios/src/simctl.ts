export * as Simctl from './simctl.js'
import {Chunk, Context, Effect, Layer, Sink, Stream} from 'effect'
import {ChildProcess, ChildProcessSpawner} from 'effect/process'
import type {EvlogError} from 'evlog'
import {iosErrors} from './errors/errors.js'

export type RunOptions = {cwd?: string; env?: Record<string, string>}

export type RunResult = {code: number; stdout: Uint8Array; stderr: string}

export interface Interface {
  readonly run: (command: string, args: readonly string[], options?: RunOptions) => Effect.Effect<RunResult, EvlogError>
}

export const Service = Context.Service<Interface>('@conciv/plugin-ios/Simctl')

const MAX_OUTPUT_BYTES = 128 * 1024 * 1024

type Collected = {size: number; chunks: Chunk.Chunk<Uint8Array>}

function collectBytes<Failure>(
  command: string,
  stream: Stream.Stream<Uint8Array, Failure>,
): Effect.Effect<Uint8Array, Failure | EvlogError> {
  const capped = Sink.foldArray(
    (): Collected => ({size: 0, chunks: Chunk.empty()}),
    () => true,
    (collected, input: readonly Uint8Array[]) => {
      const size = input.reduce((total, chunk) => total + chunk.length, collected.size)
      if (size > MAX_OUTPUT_BYTES) return Effect.fail(iosErrors.OUTPUT_TOO_LARGE({command}))
      return Effect.succeed({size, chunks: Chunk.appendAll(collected.chunks, Chunk.fromIterable(input))})
    },
  )
  return stream.pipe(
    Stream.run(capped),
    Effect.map((collected) => Buffer.concat(Chunk.toReadonlyArray(collected.chunks))),
  )
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const run = Effect.fn('ios.simctl.run')(function* (command: string, args: readonly string[], options?: RunOptions) {
      return yield* Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make(command, args, {cwd: options?.cwd, env: options?.env, extendEnv: true}),
        )
        const [stdout, stderr, code] = yield* Effect.all(
          [
            collectBytes(command, handle.stdout),
            collectBytes(command, handle.stderr).pipe(Effect.map((bytes) => new TextDecoder().decode(bytes))),
            handle.exitCode,
          ],
          {concurrency: 'unbounded'},
        )
        const result: RunResult = {code, stdout, stderr}
        return result
      }).pipe(
        Effect.scoped,
        Effect.catchTag('PlatformError', (cause) => Effect.fail(iosErrors.SPAWN_FAILED({command, cause}))),
      )
    })
    return Service.of({run})
  }),
)

const ERROR_TAIL_LINES = 40

export function stdoutText(result: RunResult): string {
  return new TextDecoder().decode(result.stdout)
}

export function commandError(result: RunResult, fallback: string): string {
  const stderr = result.stderr.trim()
  if (stderr.length > 0) return stderr
  const stdout = stdoutText(result).trim()
  return stdout.length > 0 ? stdout : fallback
}

export function boundedCommandError(result: RunResult, fallback: string): string {
  const message = commandError(result, fallback)
  const lines = message.split('\n')
  return lines.length <= ERROR_TAIL_LINES ? message : lines.slice(-ERROR_TAIL_LINES).join('\n')
}
