import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {chatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

async function collectUntil(
  iterable: AsyncIterable<StreamChunk>,
  stop: (chunk: StreamChunk) => boolean,
): Promise<StreamChunk[]> {
  const seen: StreamChunk[] = []
  for await (const chunk of iterable) {
    seen.push(chunk)
    if (stop(chunk)) break
  }
  return seen
}

async function firstChunk(iterator: AsyncIterator<StreamChunk>): Promise<StreamChunk | undefined> {
  const {value, done} = await iterator.next()
  return done ? undefined : value
}

async function snapshotJson(rpc: RpcClient, sessionId: string): Promise<string> {
  const abort = new AbortController()
  const stream = chatConnection(rpc, sessionId).subscribe(abort.signal)[Symbol.asyncIterator]()
  const snapshot = await firstChunk(stream)
  expect(snapshot?.type).toBe(EventType.MESSAGES_SNAPSHOT)
  abort.abort()
  return JSON.stringify(snapshot)
}

async function subscribedConnection() {
  const clientKit = await bootClientKit()
  kit = clientKit
  const sessionId = await clientKit.session()
  const rpc = makeRpcClient(clientKit.base)
  const connection = chatConnection(rpc, sessionId)
  const abort = new AbortController()
  const stream = connection.subscribe(abort.signal)[Symbol.asyncIterator]()
  const snapshot = await firstChunk(stream)
  expect(snapshot?.type).toBe(EventType.MESSAGES_SNAPSHOT)
  return {clientKit, rpc, sessionId, connection, abort, stream}
}

describe('chatConnection', () => {
  it('subscribe yields the MESSAGES_SNAPSHOT first, then live chunks after send', async () => {
    const {rpc, sessionId, connection, abort, stream} = await subscribedConnection()
    await connection.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'hello'}]}], undefined, undefined, {
      runId: 'chat-connection-1',
    })
    const seen = await collectUntil(
      {[Symbol.asyncIterator]: () => stream},
      (chunk) => chunk.type === EventType.RUN_FINISHED,
    )
    abort.abort()
    expect(seen.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(await snapshotJson(rpc, sessionId)).toContain('"role":"assistant"')
  })

  it('send delivers only the LAST user message to the session', async () => {
    const {rpc, sessionId, connection, abort, stream} = await subscribedConnection()
    await connection.send(
      [
        {id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]},
        {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'ok'}]},
        {id: 'u2', role: 'user', parts: [{type: 'text', content: 'second line'}]},
      ],
      undefined,
      undefined,
      {runId: 'chat-connection-2'},
    )
    await collectUntil({[Symbol.asyncIterator]: () => stream}, (chunk) => chunk.type === EventType.RUN_FINISHED)
    abort.abort()
    const snapshot = await snapshotJson(rpc, sessionId)
    expect(snapshot).toContain('second line')
    expect(snapshot).not.toContain('first')
  })

  it('send preserves text and sanitized image content through the session', async () => {
    const {rpc, sessionId, connection, abort, stream} = await subscribedConnection()
    await connection.send(
      [
        {
          id: 'u1',
          role: 'user',
          parts: [
            {type: 'text', content: 'describe this'},
            {type: 'image', source: {type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'}},
          ],
        },
      ],
      undefined,
      undefined,
      {runId: 'chat-connection-3'},
    )
    await collectUntil({[Symbol.asyncIterator]: () => stream}, (chunk) => chunk.type === EventType.RUN_FINISHED)
    abort.abort()
    const snapshot = await snapshotJson(rpc, sessionId)
    expect(snapshot).toContain('describe this')
    expect(snapshot).toContain('aGVsbG8=')
    expect(snapshot).toContain('image/png')
  })
})
