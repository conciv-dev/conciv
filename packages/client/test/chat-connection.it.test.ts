import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk, type UIMessage} from '@tanstack/ai'
import {makeRpcClient} from '@conciv/contract'
import {until} from '@conciv/harness-testkit'
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

function userMessage(id: string, text: string): UIMessage {
  return {id, role: 'user', parts: [{type: 'text', content: text}]}
}

function chunkRunId(chunk: StreamChunk | undefined): string | undefined {
  return chunk && 'runId' in chunk && typeof chunk.runId === 'string' ? chunk.runId : undefined
}

function lastSnapshotJson(seen: StreamChunk[]): string {
  return JSON.stringify(seen.filter((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT).at(-1))
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
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

  it('send delivers only the LAST user message to the session', async () => {
    const {connection, abort, stream} = await subscribedConnection()
    await connection.send([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]},
      {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'ok'}]},
      {id: 'u2', role: 'user', parts: [{type: 'text', content: 'second line'}]},
    ])
    const seen = await collectUntil(
      {[Symbol.asyncIterator]: () => stream},
      (chunk) => chunk.type === EventType.RUN_FINISHED,
    )
    abort.abort()
    const snapshot = lastSnapshotJson(seen)
    expect(snapshot).toContain('second line')
    expect(snapshot).not.toContain('first')
  })

  it('send preserves text and sanitized image content through the session', async () => {
    const {connection, abort, stream} = await subscribedConnection()
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
    const seen = await collectUntil(
      {[Symbol.asyncIterator]: () => stream},
      (chunk) => chunk.type === EventType.RUN_FINISHED,
    )
    abort.abort()
    const snapshot = lastSnapshotJson(seen)
    expect(snapshot).toContain('describe this')
    expect(snapshot).toContain('aGVsbG8=')
    expect(snapshot).toContain('image/png')
  })

  it('send while another surface owns the session waits and retries after it settles', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const busy = {count: 0}
    const connection = chatConnection(rpc, sessionId, {retryDelayMs: 5, onRetry: () => (busy.count += 1)})
    kit.gate.hold()
    await connection.send([userMessage('u1', 'first')])
    const abort = new AbortController()
    const stream = connection.subscribe(abort.signal)[Symbol.asyncIterator]()
    const finished: Array<string | undefined> = []
    const collecting = collectUntil({[Symbol.asyncIterator]: () => stream}, (chunk) => {
      if (chunk.type === EventType.RUN_FINISHED) finished.push(chunkRunId(chunk))
      return finished.length === 2
    })
    let accepted = false
    const second = connection.send([userMessage('u2', 'second')]).then(() => {
      accepted = true
    })
    await until(() => busy.count > 0)
    expect(accepted).toBe(false)
    kit.gate.release()
    await second
    await collecting
    abort.abort()
    expect(finished).toEqual([`${sessionId}:2`, `${sessionId}:1`])
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

  async function heldSessionWithWaitingSurface(secondOptions: {retryDelayMs: number; busyTimeoutMs?: number}) {
    const clientKit = await bootClientKit()
    kit = clientKit
    const sessionId = await clientKit.session()
    const rpc = makeRpcClient(clientKit.base)
    const first = chatConnection(rpc, sessionId, {retryDelayMs: 5})
    const busy = {count: 0}
    const second = chatConnection(rpc, sessionId, {...secondOptions, onRetry: () => (busy.count += 1)})
    clientKit.gate.hold()
    await first.send([userMessage('u1', 'first')])
    return {clientKit, sessionId, rpc, second, busy}
  }

  it('holds the foreign run terminal during a busy send and delivers it after the own run settles', async () => {
    const {clientKit, sessionId, second, busy} = await heldSessionWithWaitingSurface({retryDelayMs: 5})
    const abort = new AbortController()
    const stream = second.subscribe(abort.signal)[Symbol.asyncIterator]()
    const finished: Array<string | undefined> = []
    const collecting = collectUntil({[Symbol.asyncIterator]: () => stream}, (chunk) => {
      if (chunk.type === EventType.RUN_FINISHED) finished.push(chunkRunId(chunk))
      return finished.length === 2
    })
    const sending = second.send([userMessage('u2', 'second')])
    await until(() => busy.count > 0)
    clientKit.gate.release()
    await sending
    await collecting
    abort.abort()
    expect(finished).toEqual([`${sessionId}:2`, `${sessionId}:1`])
  })

  it('delivers a foreign run error immediately while a send is still waiting', async () => {
    const {clientKit, sessionId, second, busy} = await heldSessionWithWaitingSurface({retryDelayMs: 60_000})
    clientKit.harness.script.scriptError('boom')
    const abort = new AbortController()
    const stream = second.subscribe(abort.signal)[Symbol.asyncIterator]()
    const collecting = collectUntil(
      {[Symbol.asyncIterator]: () => stream},
      (chunk) => chunk.type === EventType.RUN_ERROR,
    )
    const sendAbort = new AbortController()
    const waiting = second.send([userMessage('u2', 'second')], undefined, sendAbort.signal)
    await until(() => busy.count > 0)
    clientKit.gate.release()
    const seen = await collecting
    expect(chunkRunId(seen.at(-1))).toBe(`${sessionId}:1`)
    sendAbort.abort()
    await expect(waiting).rejects.toMatchObject({name: 'AbortError'})
    abort.abort()
  })

  it('flushes the held terminal when the waiting send aborts', async () => {
    const {clientKit, sessionId, rpc, second, busy} = await heldSessionWithWaitingSurface({retryDelayMs: 60_000})
    const witness = chatConnection(rpc, sessionId, {retryDelayMs: 5})
    const abort = new AbortController()
    const seen: StreamChunk[] = []
    const stream = second.subscribe(abort.signal)[Symbol.asyncIterator]()
    const readAll = async () => {
      let next = await stream.next()
      while (!next.done) {
        seen.push(next.value)
        next = await stream.next()
      }
    }
    const reading = readAll()
    const witnessAbort = new AbortController()
    const witnessStream = witness.subscribe(witnessAbort.signal)[Symbol.asyncIterator]()
    const witnessing = collectUntil(
      {[Symbol.asyncIterator]: () => witnessStream},
      (chunk) => chunk.type === EventType.RUN_FINISHED,
    )
    const sendAbort = new AbortController()
    const waiting = second.send([userMessage('u2', 'second')], undefined, sendAbort.signal)
    await until(() => busy.count > 0)
    clientKit.gate.release()
    await witnessing
    witnessAbort.abort()
    await delay(20)
    expect(seen.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(false)
    sendAbort.abort()
    await expect(waiting).rejects.toMatchObject({name: 'AbortError'})
    await until(() => seen.some((chunk) => chunk.type === EventType.RUN_FINISHED))
    expect(chunkRunId(seen.findLast((chunk) => chunk.type === EventType.RUN_FINISHED))).toBe(`${sessionId}:1`)
    abort.abort()
    await reading
  })

  it('rejects with BUSY when the busy wait exceeds busyTimeoutMs', async () => {
    const {clientKit, second} = await heldSessionWithWaitingSurface({retryDelayMs: 5, busyTimeoutMs: 1})
    await expect(second.send([userMessage('u2', 'second')])).rejects.toMatchObject({code: 'BUSY'})
    clientKit.gate.release()
  })
})
