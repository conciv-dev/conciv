import {Context, Effect, Layer, Schema, Stream} from 'effect'
import {ChildProcess, ChildProcessSpawner} from 'effect/process'

export type RunOptions = {cwd?: string; env?: Record<string, string>}

export type RunResult = {code: number; stdout: Uint8Array; stderr: string}

export const SpawnFailed = Schema.TaggedStruct('SpawnFailed', {command: Schema.String, cause: Schema.Unknown})

export const OutputTooLarge = Schema.TaggedStruct('OutputTooLarge', {command: Schema.String})

export type RunError = typeof SpawnFailed.Type | typeof OutputTooLarge.Type

export interface Interface {
  readonly run: (command: string, args: readonly string[], options?: RunOptions) => Effect.Effect<RunResult, RunError>
}

export const Service = Context.Service<Interface>('@conciv/plugin-ios/Simctl')

const MAX_OUTPUT_BYTES = 128 * 1024 * 1024

type Collected = {readonly chunks: readonly Uint8Array[]; readonly size: number}

function joinChunks(collected: Collected): Uint8Array {
  const bytes = new Uint8Array(collected.size)
  collected.chunks.reduce((offset, chunk) => {
    bytes.set(chunk, offset)
    return offset + chunk.length
  }, 0)
  return bytes
}

function collectBytes<Failure>(
  command: string,
  stream: Stream.Stream<Uint8Array, Failure>,
): Effect.Effect<Uint8Array, Failure | typeof OutputTooLarge.Type> {
  return Stream.runFoldEffect(
    stream,
    (): Collected => ({chunks: [], size: 0}),
    (collected, chunk) => {
      const size = collected.size + chunk.length
      if (size > MAX_OUTPUT_BYTES) return Effect.fail(OutputTooLarge.make({command}))
      const next: Collected = {chunks: [...collected.chunks, chunk], size}
      return Effect.succeed(next)
    },
  ).pipe(Effect.map(joinChunks))
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
          [collectBytes(command, handle.stdout), Stream.mkString(Stream.decodeText(handle.stderr)), handle.exitCode],
          {concurrency: 'unbounded'},
        )
        const result: RunResult = {code, stdout, stderr}
        return result
      }).pipe(
        Effect.scoped,
        Effect.catchTag('PlatformError', (cause) => Effect.fail(SpawnFailed.make({command, cause}))),
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
