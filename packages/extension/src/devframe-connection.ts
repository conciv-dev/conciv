import {AsyncRetryer} from '@tanstack/pacer/async-retryer'
import type {SharedState} from 'devframe/utils/shared-state'
import type {ConnectionMeta} from 'devframe/types'
import {DEVFRAME_CONNECTION_META_FILENAME} from 'devframe/constants'
import {getDevframeRpcClient, type DevframeRpcClient} from 'devframe/client'
import {createRpcClient} from 'devframe/rpc/client'
import {createSseRpcChannel} from 'devframe/rpc/transports/sse-client'
import {createWsRpcChannel} from 'devframe/rpc/transports/ws-client'
import {concivError, concivRpcOptions, type ConcivCall, type ConcivServerFunctions} from './devframe-function.js'

const RECONNECT_BASE_WAIT_MS = 100
const RECONNECT_MAX_WAIT_MS = 2_000

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'closed'

type ClosableClient = {close?: () => void}

type StatusListener = (status: ConnectionStatus) => void
type ClientListener<Client> = (client: Client) => void

export type ReconnectingClient<Client extends ClosableClient> = {
  ready: () => Promise<Client>
  status: () => ConnectionStatus
  onStatus: (listener: StatusListener) => () => void
  onClient: (listener: ClientListener<Client>) => () => void
  stream: <Chunk>(open: (client: Client) => AsyncIterable<Chunk>) => AsyncIterable<Chunk>
  close: () => void
}

type Link<Client> = {client: Client; dropped: Promise<never>; drop: () => void}

function disconnected(): Error {
  return concivError('DISCONNECTED', 'the connection to the conciv engine dropped')
}

async function* untilDropped<Chunk>(source: AsyncIterable<Chunk>, dropped: Promise<never>): AsyncGenerator<Chunk> {
  const iterator = source[Symbol.asyncIterator]()
  try {
    while (true) {
      const next = await Promise.race([iterator.next(), dropped])
      if (next.done) return
      yield next.value
    }
  } finally {
    Promise.resolve(iterator.return?.()).catch(() => {})
  }
}

export function reconnectingClient<Client extends ClosableClient>(
  open: (onDrop: () => void) => Promise<Client>,
): ReconnectingClient<Client> {
  const statusListeners = new Set<StatusListener>()
  const clientListeners = new Set<ClientListener<Client>>()
  const state: {
    status: ConnectionStatus
    link: Link<Client> | null
    retryer: AsyncRetryer<() => Promise<Link<Client>>> | null
  } = {status: 'idle', link: null, retryer: null}

  const isClosed = (): boolean => state.status === 'closed'

  function setStatus(status: ConnectionStatus): void {
    if (state.status === status) return
    state.status = status
    Array.from(statusListeners).forEach((listener) => listener(status))
  }

  async function openLink(): Promise<Link<Client>> {
    if (!isClosed()) setStatus('connecting')
    const dropSignal = Promise.withResolvers<never>()
    dropSignal.promise.catch(() => {})
    const onDrop = (): void => {
      dropSignal.reject(disconnected())
      if (state.link?.dropped === dropSignal.promise) drop()
    }
    const opening = open(onDrop)
    const client = await Promise.race([dropSignal.promise, opening]).catch((error: unknown) => {
      opening.then((late) => late.close?.()).catch(() => {})
      throw error
    })
    return {client, dropped: dropSignal.promise, drop: onDrop}
  }

  function drop(): void {
    state.link?.client.close?.()
    state.link = null
    if (isClosed()) return
    setStatus('disconnected')
    void connect()
  }

  async function connect(): Promise<void> {
    state.retryer = new AsyncRetryer(openLink, {
      backoff: 'exponential',
      baseWait: RECONNECT_BASE_WAIT_MS,
      maxWait: RECONNECT_MAX_WAIT_MS,
      maxAttempts: Number.POSITIVE_INFINITY,
      onRetry: () => {
        if (!isClosed()) setStatus('disconnected')
      },
    })
    const link = await state.retryer.execute()
    if (!link) return
    if (isClosed()) {
      link.client.close?.()
      return
    }
    state.link = link
    setStatus('connected')
    Array.from(clientListeners).forEach((listener) => listener(link.client))
  }

  function onClient(listener: ClientListener<Client>): () => void {
    clientListeners.add(listener)
    if (state.link) listener(state.link.client)
    return () => clientListeners.delete(listener)
  }

  function onStatus(listener: StatusListener): () => void {
    statusListeners.add(listener)
    return () => statusListeners.delete(listener)
  }

  function nextLink(): Promise<Link<Client>> {
    if (isClosed()) return Promise.reject(disconnected())
    if (state.status === 'idle') void connect()
    return new Promise((resolve, reject) => {
      if (state.link) {
        resolve(state.link)
        return
      }
      const release = (): void => {
        offClient()
        offStatus()
      }
      const offClient = onClient(() => {
        if (!state.link) return
        release()
        resolve(state.link)
      })
      const offStatus = onStatus((status) => {
        if (status !== 'closed') return
        release()
        reject(disconnected())
      })
    })
  }

  return {
    ready: async () => (await nextLink()).client,
    status: () => state.status,
    onStatus,
    onClient,
    stream: <Chunk>(openStream: (client: Client) => AsyncIterable<Chunk>): AsyncIterable<Chunk> => ({
      async *[Symbol.asyncIterator]() {
        const link = await nextLink()
        yield* untilDropped(openStream(link.client), link.dropped)
      },
    }),
    close: () => {
      if (isClosed()) return
      setStatus('closed')
      state.retryer?.abort()
      state.link?.drop()
    },
  }
}

async function connectionMetaOf(baseURL: string): Promise<ConnectionMeta> {
  const response = await fetch(new URL(DEVFRAME_CONNECTION_META_FILENAME, new URL(baseURL, location.href)))
  if (!response.ok) throw new Error(`the hub at ${baseURL} answered ${response.status} for its connection meta`)
  return response.json()
}

export function browserClient(options: {baseURL: string; authToken?: string}): ReconnectingClient<DevframeRpcClient> {
  return reconnectingClient(async (onDrop) => {
    const client = await getDevframeRpcClient({
      ...options,
      connectionMeta: await connectionMetaOf(options.baseURL),
      simpleAuth: false,
      webmcp: false,
      otpParam: false,
      rpcOptions: concivRpcOptions(),
    })
    const isDown = (status: string): boolean => status === 'disconnected' || status === 'error'
    client.events.on('connection:status', (status) => {
      if (isDown(status)) onDrop()
    })
    if (isDown(client.status)) onDrop()
    return client
  })
}

export function readSharedState<Value extends object>(
  connection: ReconnectingClient<DevframeRpcClient>,
  key: string,
  write: (value: ReturnType<SharedState<Value>['value']>) => void,
): () => void {
  let reading = new AbortController()
  const offClient = connection.onClient((client) => {
    reading.abort()
    reading = new AbortController()
    const {signal} = reading
    const subscribe = async (): Promise<void> => {
      if (!(await client.ensureTrusted(0)) || signal.aborted) return
      const state = await client.sharedState.get<Value>(key)
      if (signal.aborted) return
      const publish = (): void => write(state.value())
      signal.addEventListener('abort', state.on('updated', publish), {once: true})
      publish()
    }
    subscribe().catch((error: unknown) => {
      if (!signal.aborted) console.error(`conciv: reading shared state ${key} failed`, error)
    })
  })
  return () => {
    offClient()
    reading.abort()
  }
}

export type NodeClientOptions = {url: string; transport: 'ws' | 'sse'; token?: string}

export type NodeClient = {
  call: ConcivCall
  connection: ReconnectingClient<NodeLink>
  close: () => void
}

type NodeRpc = ReturnType<typeof createRpcClient<ConcivServerFunctions, object>>

type NodeLink = {rpc: NodeRpc; close: () => void}

function openChannel(
  options: NodeClientOptions,
  callbacks: {onConnected: () => void; onError: (error: Error) => void; onDisconnected: () => void},
) {
  const base = options.url.endsWith('/') ? options.url : `${options.url}/`
  if (options.transport === 'sse')
    return createSseRpcChannel({url: `${base}__sse`, authToken: options.token, ...callbacks})
  return createWsRpcChannel({url: `${base.replace(/^http/, 'ws')}__ws`, authToken: options.token, ...callbacks})
}

function openNodeLink(options: NodeClientOptions, onDrop: () => void): Promise<NodeLink> {
  return new Promise((resolve, reject) => {
    const refused = (): void => reject(disconnected())
    const channel = openChannel(options, {
      onConnected: () => {
        const rpc = createRpcClient<ConcivServerFunctions, object>({}, {channel, rpcOptions: concivRpcOptions()})
        resolve({
          rpc,
          close: () => {
            rpc.$close(disconnected())
            channel.close()
          },
        })
      },
      onError: refused,
      onDisconnected: () => {
        refused()
        onDrop()
      },
    })
  })
}

export function nodeClient(options: NodeClientOptions): NodeClient {
  const connection = reconnectingClient((onDrop) => openNodeLink(options, onDrop))
  const call: ConcivCall = (method, ...args) => connection.ready().then(({rpc}) => rpc.$call(method, ...args))
  return {call, connection, close: connection.close}
}
