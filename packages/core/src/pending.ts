// A registry of in-flight requests awaiting an out-of-band reply (a widget POST, a user click).
// Each waiter has a fail-closed timeout: if no reply arrives in time, the promise rejects so the
// caller decides how to fail. One implementation behind the page-bus and the permission gate.

const TIMEOUT_TAG = 'aidx:pending-timeout'
export type PendingTimeout = Error & {[TIMEOUT_TAG]: true}

export function isPendingTimeout(e: unknown): e is PendingTimeout {
  return e instanceof Error && TIMEOUT_TAG in e
}

export type Pending<T> = {
  // Register `id` and await its reply, rejecting with a PendingTimeout after `timeoutMs`.
  await(id: string, timeoutMs: number): Promise<T>
  // Deliver a reply to a waiter; a no-op if the id is unknown (already resolved or timed out).
  resolve(id: string, value: T): void
  size(): number
}

export function makePending<T>(): Pending<T> {
  const waiters = new Map<string, (value: T) => void>()

  function awaitReply(id: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id)
        reject(Object.assign(new Error('pending request timed out'), {[TIMEOUT_TAG]: true as const}))
      }, timeoutMs)
      waiters.set(id, (value) => {
        clearTimeout(timer)
        waiters.delete(id)
        resolve(value)
      })
    })
  }

  function resolve(id: string, value: T): void {
    waiters.get(id)?.(value)
  }

  return {await: awaitReply, resolve, size: () => waiters.size}
}
