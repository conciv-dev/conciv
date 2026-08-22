import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeRpcClient} from '@conciv/contract'
import {chatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

describe('chatConnection refresh', () => {
  it('settles only once the reopened stream has delivered a fresh snapshot', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const connection = chatConnection(rpc, sessionId, {retryDelayMs: 25})
    const abort = new AbortController()
    const snapshots: StreamChunk[] = []
    const firstSnapshot = Promise.withResolvers<void>()
    const consumer = (async () => {
      for await (const chunk of connection.subscribe(abort.signal)) {
        if (chunk.type !== EventType.MESSAGES_SNAPSHOT) continue
        snapshots.push(chunk)
        if (snapshots.length === 1) firstSnapshot.resolve()
      }
    })()

    await firstSnapshot.promise
    expect(snapshots.length).toBe(1)

    await connection.refresh()
    expect(snapshots.length).toBe(2)

    abort.abort()
    await consumer
  })

  it('settles immediately when no stream has been opened yet', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const connection = chatConnection(makeRpcClient(kit.base), sessionId, {retryDelayMs: 25})
    await expect(connection.refresh()).resolves.toBeUndefined()
  })
})
