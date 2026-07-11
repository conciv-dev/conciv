import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {until} from '@conciv/harness-testkit/until'
import {makeRpcClient} from '@conciv/contract'
import {chatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

describe('chatConnection reconnect', () => {
  it('survives a server restart: fresh attach yields a second snapshot without resubscribing', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const retries: unknown[] = []
    const connection = chatConnection(rpc, sessionId, {retryDelayMs: 25, onRetry: (error) => retries.push(error)})
    const abort = new AbortController()
    const snapshots: StreamChunk[] = []
    const consumer = (async () => {
      for await (const chunk of connection.subscribe(abort.signal)) {
        if (chunk.type === EventType.MESSAGES_SNAPSHOT) snapshots.push(chunk)
        if (snapshots.length === 2) abort.abort()
      }
    })()
    await until(() => snapshots.length === 1, {hangGuardMs: 5000})
    await kit.restartServer()
    await until(() => snapshots.length === 2, {hangGuardMs: 5000})
    await consumer
    expect(retries.length).toBeGreaterThanOrEqual(1)
  })
})
