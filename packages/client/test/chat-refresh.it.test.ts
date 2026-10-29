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

function userTexts(messages: readonly unknown[]): string {
  return JSON.stringify(messages)
}

describe('chatConnection refresh', () => {
  it('serves the transcript the server leads, including a turn this client never sent', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const connection = chatConnection(makeRpcClient(kit.base), kit.base, sessionId)

    expect(userTexts((await connection.refresh()).messages)).toBe('[]')

    const elsewhere = await kit.turn('led from the server', {session: sessionId, runId: 'refresh-1'})
    await elsewhere.done({hangGuardMs: 20_000})

    expect(userTexts((await connection.refresh()).messages)).toContain('led from the server')
  }, 60_000)

  it('refreshes without ever opening a stream', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const connection = chatConnection(makeRpcClient(kit.base), kit.base, sessionId)
    const seen: StreamChunk[] = []
    const abort = new AbortController()
    void (async () => {
      for await (const chunk of connection.subscribe(abort.signal)) seen.push(chunk)
    })()

    const hydration = await connection.refresh()

    expect(hydration.activeRun).toBeNull()
    expect(seen.filter((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT)).toEqual([])
    abort.abort()
  }, 60_000)
})
