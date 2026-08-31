import {describe, expect, it} from 'vitest'
import type {RouterClient} from '@orpc/server'
import {makeExtRpcClient} from '@conciv/extension'
import {RECORDER_NAME} from '../src/shared/protocol.js'
import {createFlusher} from '../src/client/flusher.js'
import {MAX_FLUSH_BYTES, type RrwebEvent} from '../src/shared/protocol.js'
import type {RecorderRouter} from '../src/server.js'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

const BURST_EVENT_BYTES = 900 * 1024
const BURST_EVENT_COUNT = 6

function paddedEvent(timestamp: number, bytes: number): RrwebEvent {
  return {type: 3, data: {padding: 'x'.repeat(bytes)}, timestamp}
}

function recorderRpc(): RouterClient<RecorderRouter> {
  return makeExtRpcClient<RecorderRouter>(api().apiBase, RECORDER_NAME)
}

describe('recorder flush over the extension rpc transport', () => {
  it('splits a multi-megabyte burst into requests the server accepts, and still answers afterwards', async () => {
    const rpc = recorderRpc()
    const sent = {flushes: 0}
    const clientId = 'flush-transport-burst'
    const flusher = createFlusher({
      send: async (events) => {
        sent.flushes += 1
        await rpc.flush({clientId, events})
      },
    })
    try {
      for (let index = 0; index < BURST_EVENT_COUNT; index += 1) {
        flusher.push(paddedEvent(index, BURST_EVENT_BYTES))
      }
      await flusher.flushNow()

      expect(sent.flushes).toBeGreaterThan(1)
      expect(await rpc.config({})).toBeTruthy()
    } finally {
      flusher.dispose()
    }
  }, 60_000)

  it('delivers an event at the client cap and drops one above it', async () => {
    const rpc = recorderRpc()
    const sent = {flushes: 0}
    const clientId = 'flush-transport-over-cap'
    const flusher = createFlusher({
      send: async (events) => {
        sent.flushes += 1
        await rpc.flush({clientId, events})
      },
    })
    try {
      flusher.push(paddedEvent(1, MAX_FLUSH_BYTES + 1024))
      await flusher.flushNow()
      expect(sent.flushes).toBe(0)

      flusher.push(paddedEvent(2, MAX_FLUSH_BYTES - 4096))
      await flusher.flushNow()
      expect(sent.flushes).toBe(1)
      expect(await rpc.config({})).toBeTruthy()
    } finally {
      flusher.dispose()
    }
  }, 60_000)
})
