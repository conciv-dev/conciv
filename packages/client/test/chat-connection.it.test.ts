import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk, type UIMessage} from '@tanstack/ai'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {chatConnection, type ChatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

async function drainRun(connection: ChatConnection, abort: AbortController): Promise<StreamChunk[]> {
  const seen: StreamChunk[] = []
  for await (const chunk of connection.subscribe(abort.signal)) {
    seen.push(chunk)
    if (chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR) return seen
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

async function turnOf(runId: string, parts: UIMessage['parts'], extra: UIMessage[] = []) {
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

describe('chatConnection', () => {
  it('carries the run it starts and leaves the assistant reply on the thread', async () => {
    const {seen, thread} = await turnOf('chat-connection-1', [{type: 'text', content: 'hello'}])

    expect(seen.at(-1)?.type).toBe(EventType.RUN_FINISHED)
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

  it('picks the websocket when one opens and the event stream when it does not', async () => {
    const clientKit = await bootClientKit()
    kit = clientKit
    const sessionId = await clientKit.session()
    const rpc = makeRpcClient(clientKit.base)

    const auto = chatConnection(rpc, clientKit.base, sessionId, {probeTimeoutMs: 5_000})
    await auto.hydrate(sessionId)
    await expect.poll(() => auto.transport(), {timeout: 10_000}).toBe('websocket')

    const blocked = chatConnection(rpc, 'http://127.0.0.1:9', sessionId, {probeTimeoutMs: 500})
    await expect.poll(() => blocked.transport(), {timeout: 10_000}).toBe('sse')
  }, 60_000)
})
