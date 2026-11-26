export async function* relayEvents<Value>(events: AsyncIterator<Value>, signal: AbortSignal | undefined) {
  const stop = () => void events.return?.()
  signal?.addEventListener('abort', stop, {once: true})
  try {
    for (;;) {
      const step = await events.next()
      if (step.done === true) return
      yield step.value
    }
  } finally {
    signal?.removeEventListener('abort', stop)
    await events.return?.()
  }
}
