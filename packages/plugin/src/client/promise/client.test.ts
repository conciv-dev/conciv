import {createHash} from 'node:crypto'
import {createServer, type Server} from 'node:http'
import type {Duplex} from 'node:stream'
import {describe, expect, it as baseIt, vi} from 'vitest'
import {
  makeBrowserRpcClient,
  makeRpcClient,
  type BrowserRpcClient,
  type EngineConnectionTimings,
} from '@conciv/contract'
import {make} from './client.js'

const CLOSE_OPCODE = 8

function listenOn(server: Server): Promise<string> {
  const listening = Promise.withResolvers<string>()
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (address === null || typeof address === 'string') return listening.reject(new Error('no port'))
    listening.resolve(`http://127.0.0.1:${address.port}`)
  })
  return listening.promise
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

function readPayloadLength(buffered: Buffer): {extended: number; length: number} {
  const lengthCode = (buffered[1] ?? 0) & 0x7f
  if (lengthCode === 126) return {extended: 2, length: buffered.length < 4 ? Infinity : buffered.readUInt16BE(2)}
  if (lengthCode === 127)
    return {extended: 8, length: buffered.length < 10 ? Infinity : Number(buffered.readBigUInt64BE(2))}
  return {extended: 0, length: lengthCode}
}

function readFrames(buffered: Buffer): {opcodes: number[]; rest: Buffer} {
  if (buffered.length < 2) return {opcodes: [], rest: buffered}
  const {extended, length} = readPayloadLength(buffered)
  const size = 2 + extended + 4 + length
  if (buffered.length < size) return {opcodes: [], rest: buffered}
  const next = readFrames(buffered.subarray(size))
  return {opcodes: [(buffered[0] ?? 0) & 0x0f, ...next.opcodes], rest: next.rest}
}

type RefusingEngine = {
  base: string
  seen: readonly string[]
  until: (done: () => boolean) => Promise<void>
  close: () => Promise<void>
}

async function startRefusingEngine(): Promise<RefusingEngine> {
  const subscribes = {count: 0}
  const server = createServer((_request, response) => {
    subscribes.count += 1
    response.statusCode = subscribes.count === 1 ? 503 : 401
    response.end()
  })
  const sockets: Duplex[] = []
  const seen: string[] = []
  const watchers: (() => void)[] = []
  const record = (event: string) => {
    seen.push(event)
    watchers.splice(0).forEach((watcher) => watcher())
  }
  server.on('upgrade', (request, socket) => {
    sockets.push(socket)
    const index = sockets.indexOf(socket)
    record(`upgrade:${index}`)
    const accept = createHash('sha1')
      .update(`${request.headers['sec-websocket-key'] ?? ''}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    const pending: {buffered: Buffer} = {buffered: Buffer.alloc(0)}
    socket.on('data', (chunk: Buffer) => {
      const read = readFrames(Buffer.concat([pending.buffered, chunk]))
      pending.buffered = read.rest
      read.opcodes.forEach((opcode) => record(`${opcode === CLOSE_OPCODE ? 'close' : 'frame'}:${index}`))
    })
  })
  const until = (done: () => boolean) =>
    new Promise<void>((resolve) => {
      const check = () => (done() ? resolve() : watchers.push(check))
      check()
    })
  const base = await listenOn(server)
  return {
    base,
    seen,
    until,
    close: () => {
      sockets.forEach((socket) => socket.destroy())
      return closeServer(server)
    },
  }
}

type BrowserClients = (base: string, timings: Partial<EngineConnectionTimings>) => BrowserRpcClient

const it = baseIt.extend<{
  refusing: string
  engine: RefusingEngine
  stop: AbortController
  browserClients: BrowserClients
  shortTimers: boolean
}>({
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  refusing: async ({}, use) => {
    const server = createServer((_request, response) => {
      response.statusCode = 503
      response.end()
    })
    await use(await listenOn(server))
    await closeServer(server)
  },
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  engine: async ({}, use) => {
    const engine = await startRefusingEngine()
    await use(engine)
    await engine.close()
  },
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  stop: async ({}, use) => {
    const stop = new AbortController()
    await use(stop)
    stop.abort()
  },
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  browserClients: async ({}, use) => {
    const opened: BrowserRpcClient[] = []
    await use((base, timings) => {
      const client = makeBrowserRpcClient(base, {timings})
      opened.push(client)
      return client
    })
    opened.forEach((client) => client.close())
  },
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  shortTimers: async ({}, use) => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    await use(vi.isFakeTimers())
    vi.useRealTimers()
  },
})

describe('plugin client reconnect delay', () => {
  it('subscribes again after the short reconnect delay it was given', async ({refusing, stop, shortTimers}) => {
    expect(shortTimers).toBe(true)
    const attempts = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
    const counted = {calls: 0}
    const raw = makeRpcClient(refusing, {
      interceptors: [
        (options) => {
          attempts[counted.calls]?.resolve()
          counted.calls += 1
          return options.next()
        },
      ],
    })
    const client = make(raw, {server: () => refusing, reconnectDelay: 20})
    const reconnecting = Promise.withResolvers<void>()
    client.connection.on((status) => {
      if (status === 'reconnecting') reconnecting.resolve()
    })
    const stream = client.event.subscribe({signal: stop.signal})[Symbol.asyncIterator]()
    const ended = stream.next().catch(() => undefined)
    await attempts[0]?.promise
    await reconnecting.promise
    await vi.advanceTimersByTimeAsync(20)
    await attempts[1]?.promise
    expect(counted.calls).toBe(2)
    stop.abort()
    await ended
  })
})

describe('plugin client engine timings', () => {
  it('waits for trust on the pool connection of the engine timings it was given', async ({
    engine,
    stop,
    browserClients,
  }) => {
    const engineTimings = {openTimeoutMs: 60_000}
    const unanswered = () => undefined
    const anchor = browserClients(engine.base, engineTimings)
    anchor.rpc.sessions.list(undefined).catch(unanswered)
    await engine.until(() => engine.seen.filter((event) => event === 'frame:0').length >= 2)
    const client = make(makeRpcClient(engine.base), {server: () => engine.base, reconnectDelay: 1, engineTimings})
    const waitingForTrust = Promise.withResolvers<void>()
    client.connection.on((status) => {
      if (status === 'connecting') waitingForTrust.resolve()
    })
    const ended = client.event.subscribe({signal: stop.signal})[Symbol.asyncIterator]().next().catch(unanswered)
    await waitingForTrust.promise
    await Promise.resolve()
    anchor.close()
    browserClients(engine.base, {openTimeoutMs: 59_000}).rpc.sessions.list(undefined).catch(unanswered)
    await engine.until(() => engine.seen.includes('upgrade:1'))
    const marked = engine.seen.length
    browserClients(engine.base, engineTimings).rpc.sessions.list(undefined).catch(unanswered)
    const decisive = (event: string) => event === 'frame:0' || event === 'upgrade:2'
    await engine.until(() => engine.seen.slice(marked).some(decisive))
    expect(engine.seen.slice(marked).find(decisive)).toBe('frame:0')
    stop.abort()
    await ended
  })
})
