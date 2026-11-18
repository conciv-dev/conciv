import {execFile} from 'node:child_process'
import {Context, Effect, Layer} from 'effect'

export type RunOptions = {cwd?: string; env?: Record<string, string>}

export type RunResult = {code: number; stdout: Buffer; stderr: string}

export interface Interface {
  readonly run: (command: string, args: readonly string[], options?: RunOptions) => Effect.Effect<RunResult>
}

export const Service = Context.Service<Interface>('@conciv/plugin-ios/Simctl')

const MAX_BUFFER = 128 * 1024 * 1024

function exitCode(error: (Error & {code?: unknown}) | null): number {
  if (error === null) return 0
  return typeof error.code === 'number' ? error.code : 1
}

function run(command: string, args: readonly string[], options?: RunOptions): Effect.Effect<RunResult> {
  return Effect.callback<RunResult>((resume) => {
    execFile(
      command,
      args,
      {cwd: options?.cwd, env: {...process.env, ...options?.env}, maxBuffer: MAX_BUFFER, encoding: 'buffer'},
      (error, stdout, stderr) => {
        resume(Effect.succeed({code: exitCode(error), stdout, stderr: stderr.toString('utf8')}))
      },
    )
  })
}

export const layer = Layer.succeed(Service, Service.of({run}))
