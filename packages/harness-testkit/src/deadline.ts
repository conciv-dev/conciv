import {setTimeout as delay} from 'node:timers/promises'

export async function withDeadline<Result>(
  deadlineMs: number,
  message: string,
  run: () => Promise<Result>,
): Promise<Result> {
  const abort = new AbortController()
  const expiry = delay(deadlineMs, undefined, {signal: abort.signal}).then(
    (): never => {
      throw new Error(message)
    },
    () => new Promise<never>(() => {}),
  )
  const running = run()
  running.catch(() => {})
  try {
    return await Promise.race([running, expiry])
  } finally {
    abort.abort()
  }
}
