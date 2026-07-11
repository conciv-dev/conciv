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

describe('chatConnection', () => {
  it('subscribe yields the MESSAGES_SNAPSHOT first, then live chunks after send', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const connection = chatConnection(rpc, sessionId)
    const abort = new AbortController()
    const stream = connection.subscribe(abort.signal)[Symbol.asyncIterator]()
    const snapshot = await firstChunk(stream)
    expect(snapshot?.type).toBe(EventType.MESSAGES_SNAPSHOT)
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
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const connection = chatConnection(rpc, sessionId)
    const abort = new AbortController()
    const stream = connection.subscribe(abort.signal)[Symbol.asyncIterator]()
    await firstChunk(stream)
    await connection.send([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]},
      {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'ok'}]},
      {id: 'u2', role: 'user', parts: [{type: 'text', content: 'second line'}]},
    ])
    await collectUntil({[Symbol.asyncIterator]: () => stream}, (chunk) => chunk.type === EventType.RUN_FINISHED)
    abort.abort()
    const received = lastUserModelText(kit.harness.__turnMessages.at(-1) ?? [])
    expect(received).toContain('second line')
    expect(received).not.toContain('first')
  })

  it('send while the session is busy surfaces the typed BUSY error', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const connection = chatConnection(rpc, sessionId)
    kit.gate.hold()
    await connection.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]}])
    await expect(
      connection.send([{id: 'u2', role: 'user', parts: [{type: 'text', content: 'second'}]}]),
    ).rejects.toMatchObject({code: 'BUSY'})
    kit.gate.release()
  })
})
