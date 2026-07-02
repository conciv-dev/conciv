const TIMEOUT_TAG = 'conciv:pending-timeout'
export type PendingTimeout = Error & {[TIMEOUT_TAG]: true}

export function isPendingTimeout(e: unknown): e is PendingTimeout {
  return e instanceof Error && TIMEOUT_TAG in e
}

export type Pending<T> = {
  await(id: string, timeoutMs: number): Promise<T>
  resolve(id: string, value: T): void
  size(): number
}

export function makePending<T>(): Pending<T> {
  const waiters = new Map<string, (value: T) => void>()

  function awaitReply(id: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((settle, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id)
        reject(Object.assign(new Error('pending request timed out'), {[TIMEOUT_TAG]: true as const}))
      }, timeoutMs)
      waiters.set(id, (value) => {
        clearTimeout(timer)
        waiters.delete(id)
        settle(value)
      })
    })
  }

  function resolve(id: string, value: T): void {
    waiters.get(id)?.(value)
  }

  return {await: awaitReply, resolve, size: () => waiters.size}
}
