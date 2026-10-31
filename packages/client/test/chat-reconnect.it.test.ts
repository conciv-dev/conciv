import {afterEach, describe, expect, it} from 'vitest'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {makeRpcClient} from '@conciv/contract'
import {chatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

describe('chatConnection reconnect', () => {
  it('survives a server restart: a turn sent afterwards still streams to completion', async () => {
    const clientKit = await bootClientKit()
    kit = clientKit
    const sessionId = await clientKit.session()
    const connection = chatConnection(makeRpcClient(clientKit.base), clientKit.base, sessionId)

    const before = new AbortController()
    const firstRun = collect(connection.subscribe(before.signal))
    await connection.send(
      [{id: 'u1', role: 'user', parts: [{type: 'text', content: 'before'}]}],
      undefined,
      undefined,
      {
        threadId: sessionId,
        runId: 'reconnect-1',
      },
    )
    expect((await firstRun).at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    before.abort()

    await clientKit.restartServer()

    const after = new AbortController()
    const secondRun = collect(connection.subscribe(after.signal))
    await connection.send([{id: 'u2', role: 'user', parts: [{type: 'text', content: 'after'}]}], undefined, undefined, {
      threadId: sessionId,
      runId: 'reconnect-2',
    })
    expect((await secondRun).at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    after.abort()

    expect(JSON.stringify((await connection.hydrate(sessionId)).messages)).toContain('after')
  }, 90_000)
})

async function collect(stream: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const seen: ChatEvent[] = []
  for await (const chunk of stream) {
    seen.push(chunk)
    if (chunk.type === ChatEventType.RUN_FINISHED || chunk.type === ChatEventType.RUN_ERROR) return seen
  }
  return seen
}
