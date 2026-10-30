import {afterEach, describe, expect, it} from 'vitest'
import {ChatClient} from '@conciv/ai/testkit'
import {createServer, type Server} from 'node:http'
import {CHAT_SSE_PATH} from '@conciv/protocol/chat-types'
import type {ChatEvent, ChatMessage} from '@conciv/ai'
import {ChatEventType} from '@conciv/ai'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {chatConnection, type ChatConnection, type ChatTransport} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

async function drainRun(connection: ChatConnection, abort: AbortController): Promise<ChatEvent[]> {
  const seen: ChatEvent[] = []
  for await (const chunk of connection.subscribe(abort.signal)) {
    seen.push(chunk)
    if (chunk.type === ChatEventType.RUN_FINISHED || chunk.type === ChatEventType.RUN_ERROR) return seen
  }
  return seen
}

async function opened(): Promise<{rpc: RpcClient; sessionId: string; connection: ChatConnection}> {
  const clientKit = await bootClientKit()
  kit = clientKit
  const sessionId = await clientKit.session()
  const rpc = makeRpcClient(clientKit.base)
  return {rpc, sessionId, connection: chatConnection(rpc, clientKit.base, sessionId)}
}

async function turnOf(runId: string, parts: ChatMessage['parts'], extra: ChatMessage[] = []) {
  const {rpc, sessionId, connection} = await opened()
  const abort = new AbortController()
  const draining = drainRun(connection, abort)
  await connection.send([...extra, {id: 'u-last', role: 'user', parts}], undefined, undefined, {
    threadId: sessionId,
    runId,
  })
  const seen = await draining
  abort.abort()
  return {rpc, sessionId, seen, thread: threadJson(await rpc.chat.hydrate({sessionId}))}
}

function threadJson(hydration: {messages: unknown[]}): string {
  return JSON.stringify(hydration.messages)
}

function settledTransport(): {chosen: Promise<ChatTransport>; settle: (transport: ChatTransport) => void} {
  const held: {settle: (transport: ChatTransport) => void} = {settle: () => {}}
  const chosen = new Promise<ChatTransport>((resolve) => {
    held.settle = resolve
  })
  return {chosen, settle: (transport) => held.settle(transport)}
}

describe('chatConnection', () => {
  it('carries the run it starts and leaves the assistant reply on the thread', async () => {
    const {seen, thread} = await turnOf('chat-connection-1', [{type: 'text', content: 'hello'}])

    expect(seen.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    expect(thread).toContain('"role":"assistant"')
  }, 60_000)

  it('sends only the LAST user message as the turn', async () => {
    const {thread} = await turnOf(
      'chat-connection-2',
      [{type: 'text', content: 'second line'}],
      [
        {id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]},
        {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'ok'}]},
      ],
    )

    expect(thread).toContain('second line')
    expect(thread).not.toContain('first')
  }, 60_000)

  it('preserves text and image content through the turn', async () => {
    const {thread} = await turnOf('chat-connection-3', [
      {type: 'text', content: 'describe this'},
      {type: 'image', source: {type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'}},
    ])

    expect(thread).toContain('describe this')
    expect(thread).toContain('aGVsbG8=')
    expect(thread).toContain('image/png')
  }, 60_000)

  it('picks the websocket when one opens and the fetch event stream when it does not', async () => {
    const clientKit = await bootClientKit()
    kit = clientKit
    const sessionId = await clientKit.session()
    const rpc = makeRpcClient(clientKit.base)

    const settledOpen = settledTransport()
    const auto = chatConnection(rpc, clientKit.base, sessionId, {
      probeTimeoutMs: 5_000,
      onTransport: settledOpen.settle,
    })
    expect(await settledOpen.chosen).toBe('websocket')
    expect(auto.transport()).toBe('websocket')

    const settledBlocked = settledTransport()
    const blocked = chatConnection(rpc, 'http://127.0.0.1:9', sessionId, {
      probeTimeoutMs: 500,
      onTransport: settledBlocked.settle,
    })
    expect(await settledBlocked.chosen).toBe('fetch')
    expect(blocked.transport()).toBe('fetch')
  }, 60_000)
})

describe('chatConnection streams', () => {
  it('a stream that breaks mid-turn ends the turn with an error and stops streaming', async () => {
    const server = await breakingEventsServer()
    const errors: Error[] = []
    const client = new ChatClient({
      connection: chatConnection(makeRpcClient(server.base), server.base, 'conciv_breaking', {transport: 'fetch'}),
      threadId: 'conciv_breaking',
      onError: (error) => errors.push(error),
    })
    client.subscribe()
    try {
      await client.sendMessage('hello').catch(() => undefined)
      expect(errors.length).toBeGreaterThan(0)
      expect(client.getIsLoading()).toBe(false)
    } finally {
      client.unsubscribe()
      client.dispose()
      await server.close()
    }
  }, 10_000)

  it('aborting a live subscription ends it cleanly, with no error', async () => {
    const {sessionId, connection} = await opened()
    const watcher = watch(connection)
    await sendTurn(connection, sessionId, 'abort-1')
    await watcher.finished
    watcher.abort()
    await expect(watcher.ended).resolves.toBeUndefined()
  }, 30_000)

  it('on the fetch transport every subscriber gets each chunk, and one that aborts stops receiving', async () => {
    const clientKit = await bootClientKit()
    kit = clientKit
    const sessionId = await clientKit.session()
    const connection = chatConnection(makeRpcClient(clientKit.base), clientKit.base, sessionId, {transport: 'fetch'})
    const [staying, leaving] = [watch(connection), watch(connection)]
    await sendTurn(connection, sessionId, 'fan-out-1')
    await Promise.all([staying.finished, leaving.finished])
    expect(leaving.seen.map((chunk) => chunk.type)).toEqual(staying.seen.map((chunk) => chunk.type))
    const before = leaving.seen.length
    leaving.abort()
    await leaving.ended
    await sendTurn(connection, sessionId, 'fan-out-2')
    expect(leaving.seen).toHaveLength(before)
    expect(staying.seen.length).toBeGreaterThan(before)
    staying.abort()
  }, 30_000)
})

async function breakingEventsServer(): Promise<{base: string; close: () => Promise<void>}> {
  const run = {threadId: 'conciv_breaking', runId: 'breaking-run'}
  const frames = [
    {type: ChatEventType.RUN_STARTED, ...run},
    {type: ChatEventType.TEXT_MESSAGE_START, messageId: 'broken-reply', role: 'assistant'},
    {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'broken-reply', delta: 'half a rep'},
  ]
  const server: Server = createServer((request, response) => {
    if (request.method !== 'POST' || !request.url?.endsWith(CHAT_SSE_PATH)) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, {'content-type': 'text/event-stream'})
    response.write(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(''), () => response.destroy())
  })
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((closed) => server.close(() => closed())),
  }
}

function watch(connection: ChatConnection) {
  const abort = new AbortController()
  const seen: ChatEvent[] = []
  const finished = Promise.withResolvers<void>()
  const ended = (async () => {
    for await (const chunk of connection.subscribe(abort.signal)) {
      seen.push(chunk)
      if (chunk.type === ChatEventType.RUN_FINISHED) finished.resolve()
    }
  })()
  return {seen, finished: finished.promise, ended, abort: () => abort.abort()}
}

function sendTurn(connection: ChatConnection, sessionId: string, runId: string): Promise<void> {
  return connection.send(
    [{id: `${runId}-user`, role: 'user', parts: [{type: 'text', content: runId}]}],
    undefined,
    undefined,
    {
      threadId: sessionId,
      runId,
    },
  )
}
