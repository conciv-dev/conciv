type Subscriber = {dirty: boolean; wake: () => void}

export type LiveFeed = {
  pulse: () => void
  subscribe: (signal: AbortSignal) => AsyncGenerator<void>
}

export function makeLiveFeed(): LiveFeed {
  const subscribers = new Set<Subscriber>()

  function pulse(): void {
    for (const subscriber of subscribers) {
      subscriber.dirty = true
      subscriber.wake()
    }
  }

  async function* subscribe(signal: AbortSignal): AsyncGenerator<void> {
    const subscriber: Subscriber = {dirty: false, wake: () => {}}
    subscribers.add(subscriber)
    const onAbort = () => subscriber.wake()
    signal.addEventListener('abort', onAbort, {once: true})
    try {
      while (!signal.aborted) {
        if (subscriber.dirty) {
          subscriber.dirty = false
          yield
          continue
        }
        await new Promise<void>((resolve) => {
          subscriber.wake = resolve
          if (subscriber.dirty || signal.aborted) resolve()
        })
        subscriber.wake = () => {}
      }
    } finally {
      subscribers.delete(subscriber)
      signal.removeEventListener('abort', onAbort)
    }
  }

  return {pulse, subscribe}
}
