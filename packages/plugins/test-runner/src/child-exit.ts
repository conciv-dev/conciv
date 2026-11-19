import {constants} from 'node:os'
import {Effect} from 'effect'
import type {PlatformError} from 'effect/PlatformError'
import type {ChildProcessSpawner} from 'effect/process'

export type ChildExitStatus = {readonly code: number | null; readonly signal: string | null}

const SIGNALS = Object.keys(constants.signals)

export function readChildExit(
  handle: ChildProcessSpawner.ChildProcessHandle,
): Effect.Effect<ChildExitStatus, PlatformError> {
  return handle.exitCode.pipe(
    Effect.map((code): ChildExitStatus => ({code, signal: null})),
    Effect.catch((error) => {
      const cause = error.reason.cause
      const reported = cause instanceof Error ? cause.message : error.message
      const signal = SIGNALS.find((name) => reported.includes(`'${name}'`))
      if (signal === undefined) return Effect.fail(error)
      return Effect.succeed({code: null, signal})
    }),
  )
}
