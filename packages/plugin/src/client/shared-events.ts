export * as SharedEvents from './shared-events.js'

export type SelectedEvent<A extends {readonly type: string}, Type extends string> = A extends unknown
  ? [Extract<Type, A['type']>] extends [never]
    ? never
    : A
  : never

export type SubscribeOptions<Type extends string = string> = {
  readonly types?: ReadonlyArray<Type>
  readonly signal?: AbortSignal
  readonly onActivity?: () => void
}

const reconnectDelay = 1_000

export function make<A extends {readonly type: string}>(
  connect: (signal: AbortSignal, onActivity: () => void) => AsyncIterable<A>,
) {
  type Subscriber = {
    push: (value: A) => void
    activity?: () => void
  }
  type Connection = {
    controller: AbortController
    subscribers: Set<Subscriber>
    connected?: A
  }

  let current: Connection | undefined
  const capacity = 4_096

  function stop(connection: Connection) {
    connection.connected = undefined
    connection.controller.abort()
    if (current === connection) current = undefined
  }

  async function read(connection: Connection) {
    let iterator: AsyncIterator<A> | undefined
    try {
      iterator = connect(connection.controller.signal, () => {
        connection.subscribers.forEach((subscriber) => subscriber.activity?.())
      })[Symbol.asyncIterator]()
      while (!connection.controller.signal.aborted) {
        const item = await iterator.next()
        if (item.done || connection.controller.signal.aborted) break
        if (item.value.type === 'server.connected') connection.connected = item.value
        connection.subscribers.forEach((subscriber) => subscriber.push(item.value))
      }
    } catch (error) {
      if (!connection.controller.signal.aborted) console.error(error)
    } finally {
      connection.connected = undefined
      try {
        await iterator?.return?.()
      } catch (error) {
        console.error(error)
      }
    }
  }

  async function run(connection: Connection) {
    while (!connection.controller.signal.aborted) {
      await read(connection)
      if (connection.controller.signal.aborted) return
      await wait(reconnectDelay, connection.controller.signal)
    }
  }

  return {
    subscribe<Type extends Exclude<A['type'], 'server.connected'> = Exclude<A['type'], 'server.connected'>>(
      options?: SubscribeOptions<Type>,
    ): AsyncIterable<SelectedEvent<A, Type | 'server.connected'>> {
      return {
        [Symbol.asyncIterator]() {
          type Item = A & SelectedEvent<A, Type | 'server.connected'>
          const pending: ReturnType<typeof Promise.withResolvers<IteratorResult<Item>>>[] = []
          const queued: Item[] = []
          let started = false
          let finished = false
          let connection: Connection | undefined
          const types = options?.types?.length ? new Set<string>(options.types) : undefined
          const selected = (value: A): value is Item =>
            !types || value.type === 'server.connected' || types.has(value.type)

          function finish() {
            finished = true
            queued.length = 0
            options?.signal?.removeEventListener('abort', finish)
            if (connection?.subscribers.delete(subscriber) && !connection.subscribers.size) stop(connection)
            pending.splice(0).forEach((request) => request.resolve({done: true, value: undefined}))
          }

          const subscriber: Subscriber = {
            activity: options?.onActivity,
            push(value) {
              if (!selected(value)) return
              const request = pending.shift()
              if (request) {
                request.resolve({done: false, value})
                return
              }
              if (queued.length === capacity) {
                queued.length = 0
                if (connection?.connected && selected(connection.connected)) queued.push(connection.connected)
                return
              }
              queued.push(value)
            },
          }

          function start() {
            if (finished) return
            const fresh = !current
            connection = current ?? {
              controller: new AbortController(),
              subscribers: new Set<Subscriber>(),
            }
            current = connection
            connection.subscribers.add(subscriber)
            if (connection.connected) void subscriber.push(connection.connected)
            if (fresh) void run(connection)
          }

          return {
            next(): Promise<IteratorResult<Item>> {
              const value = queued.shift()
              if (value) return Promise.resolve({done: false, value})
              if (finished) return Promise.resolve({done: true, value: undefined})
              if (options?.signal?.aborted) {
                finish()
                return Promise.resolve({done: true, value: undefined})
              }
              const request = Promise.withResolvers<IteratorResult<Item>>()
              pending.push(request)
              if (!started) {
                started = true
                options?.signal?.addEventListener('abort', finish, {once: true})
                start()
              }
              return request.promise
            },
            return(): Promise<IteratorResult<Item>> {
              finish()
              return Promise.resolve({done: true, value: undefined})
            },
          }
        },
      }
    },
  }
}

function wait(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, delay)
    signal.addEventListener('abort', done, {once: true})
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}
