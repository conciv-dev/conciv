import {Effect, Stream} from 'effect'
import type {PlatformError} from 'effect/PlatformError'

export const abortError = (signal: AbortSignal): Error => {
  const reason = signal.reason
  if (reason instanceof Error) return reason
  return new DOMException('Aborted', 'AbortError')
}

export const waitForAbort = (signal: AbortSignal) =>
  Effect.callback<never, Error>((resume) => {
    if (signal.aborted) {
      resume(Effect.fail(abortError(signal)))
      return
    }
    const onabort = () => resume(Effect.fail(abortError(signal)))
    signal.addEventListener('abort', onabort, {once: true})
    return Effect.sync(() => signal.removeEventListener('abort', onabort))
  })

export const collectStream = (stream: Stream.Stream<Uint8Array, PlatformError>, maxOutputBytes: number | undefined) =>
  Stream.runFold(
    stream,
    (): {chunks: Uint8Array[]; bytes: number; truncated: boolean} => ({chunks: [], bytes: 0, truncated: false}),
    (accumulated, chunk) => {
      if (maxOutputBytes === undefined) {
        accumulated.chunks.push(chunk)
        accumulated.bytes += chunk.length
        return accumulated
      }
      const remaining = maxOutputBytes - accumulated.bytes
      if (remaining > 0) accumulated.chunks.push(remaining >= chunk.length ? chunk : chunk.slice(0, remaining))
      accumulated.bytes += chunk.length
      accumulated.truncated = accumulated.truncated || accumulated.bytes > maxOutputBytes
      return accumulated
    },
  ).pipe(Effect.map((collected) => ({buffer: Buffer.concat(collected.chunks), truncated: collected.truncated})))
