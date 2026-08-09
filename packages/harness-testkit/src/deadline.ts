import {setTimeout as delay} from 'node:timers/promises'

export async function withDeadline<Result>(
  deadlineMs: number,
  message: string,
  run: () => Promise<Result>,
  disposeLate?: (result: Result) => unknown,
): Promise<Result> {
  const abort = new AbortController()
  try {
    const expiry = delay(deadlineMs, undefined, {signal: abort.signal}).then(
      (): never => {
        throw new Error(message)
      },
      () => new Promise<never>(() => {}),
    )
    const running = Promise.resolve().then(run)
    running.catch(() => {})
    return await Promise.race([running, expiry]).catch((error: unknown) => {
      if (disposeLate) {
        void running.then(
          (result) => Promise.resolve(disposeLate(result)).catch(() => {}),
          () => {},
        )
      }
      throw error
    })
  } finally {
    abort.abort()
  }
}

export function abortOnDeadline<Result>(
  abort: AbortController,
  deadlineMs: number,
  message: string,
  run: () => Promise<Result>,
): Promise<Result> {
  return withDeadline(deadlineMs, message, run).catch((error: unknown) => {
    abort.abort()
    throw error
  })
}
