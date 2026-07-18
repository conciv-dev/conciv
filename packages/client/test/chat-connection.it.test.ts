import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeRpcClient} from '@conciv/contract'
import {lastUserModelText} from '@conciv/harness'
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
  return {clientKit, connection, abort, stream}
}

describe('chatConnection', () => {
  it('subscribe yields the MESSAGES_SNAPSHOT first, then live chunks after send', async () => {
    const {connection, abort, stream} = await subscribedConnection()
    await connection.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'hello'}]}])
    const seen = await collectUntil(
      {[Symbol.asyncIterator]: () => stream},
      (chunk) => chunk.type === EventType.RUN_FINISHED,
    )
    abort.abort()
    const snapshots = seen.filter((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT)
    expect(snapshots.length).toBeGreaterThan(0)
    expect(JSON.stringify(snapshots.at(-1))).toContain('"role":"assistant"')
    expect(seen.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })

  it('send extracts the LAST user message text and hands it to the harness', async () => {
    const {clientKit, connection, abort, stream} = await subscribedConnection()
    await connection.send([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]},
      {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'ok'}]},
      {id: 'u2', role: 'user', parts: [{type: 'text', content: 'second line'}]},
    ])
    await collectUntil({[Symbol.asyncIterator]: () => stream}, (chunk) => chunk.type === EventType.RUN_FINISHED)
    abort.abort()
    const received = lastUserModelText(clientKit.harness.__turnMessages.at(-1) ?? [])
    expect(received).toContain('second line')
    expect(received).not.toContain('first')
  })

  it('send preserves text and sanitized image content for the harness', async () => {
    const {clientKit, connection, abort, stream} = await subscribedConnection()
    await connection.send([
      {
        id: 'u1',
        role: 'user',
        parts: [
          {type: 'text', content: 'describe this'},
          {type: 'image', source: {type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'}},
        ],
      },
    ])
    await collectUntil({[Symbol.asyncIterator]: () => stream}, (chunk) => chunk.type === EventType.RUN_FINISHED)
    abort.abort()
    const lastTurn = clientKit.harness.__turnMessages.at(-1)
    const lastUser = lastTurn?.findLast((message) => message.role === 'user')
    expect(lastUser?.content).toEqual([
      {type: 'text', content: 'describe this'},
      {type: 'image', source: {type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'}},
    ])
  })

  it('send while another surface owns the session waits and retries after it settles', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const connection = chatConnection(rpc, sessionId, {retryDelayMs: 5})
    kit.gate.hold()
    await connection.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]}])
    let accepted = false
    const second = connection.send([{id: 'u2', role: 'user', parts: [{type: 'text', content: 'second'}]}]).then(() => {
      accepted = true
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(accepted).toBe(false)
    kit.gate.release()
    await second
    expect(kit.harness.__turnMessages).toHaveLength(2)
  })

  it('aborts a send waiting for another surface', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const connection = chatConnection(rpc, sessionId, {retryDelayMs: 5})
    kit.gate.hold()
    await connection.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]}])
    const abort = new AbortController()
    const waiting = connection.send(
      [{id: 'u2', role: 'user', parts: [{type: 'text', content: 'second'}]}],
      undefined,
      abort.signal,
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    abort.abort()
    await expect(waiting).rejects.toMatchObject({name: 'AbortError'})
    kit.gate.release()
  })
})
