import {describe, expect, it} from 'vitest'
import type {RouterClient} from '@orpc/server'
import {rpcOverWebsocket} from '@conciv/harness-testkit/rpc-websocket-client'
import {WS_RPC_PAYLOAD_BUDGET_BYTES} from '@conciv/protocol/rpc-types'
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

type OutboundFrame = Parameters<WebSocket['send']>[0]

function outboundFrameByteLength(data: OutboundFrame): number {
  if (typeof data === 'string') return new TextEncoder().encode(data).length
  if (data instanceof ArrayBuffer) return data.byteLength
  if (ArrayBuffer.isView(data)) return data.byteLength
  throw new Error('the recorder flush socket sent a Blob frame; byte-length measurement does not support that yet')
}

async function openRecorderSocket(): Promise<{
  rpc: RouterClient<RecorderRouter>
  closeCodes: number[]
  outboundFrameBytes: number[]
  socket: WebSocket
}> {
  const socket = new WebSocket(`${api().apiBase.replace('http:', 'ws:')}/rpc-ws`)
  const closeCodes: number[] = []
  const outboundFrameBytes: number[] = []
  const rawSend = socket.send.bind(socket)
  socket.send = (data: OutboundFrame) => {
    outboundFrameBytes.push(outboundFrameByteLength(data))
    rawSend(data)
  }
  socket.addEventListener('close', (event) => closeCodes.push(event.code))
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), {once: true})
    socket.addEventListener('error', () => reject(new Error('the recorder rpc socket never opened')), {once: true})
  })
  return {
    rpc: rpcOverWebsocket<RouterClient<RecorderRouter>>(socket, {path: ['ext', 'recorder']}),
    closeCodes,
    outboundFrameBytes,
    socket,
  }
}

describe('recorder flush over the shared rpc socket', () => {
  it('splits a multi-megabyte burst into frames the server accepts and never closes the socket', async () => {
    const {rpc, closeCodes, outboundFrameBytes, socket} = await openRecorderSocket()
    let flushCount = 0
    const clientId = 'flush-socket-burst'
    const flusher = createFlusher({
      send: async (events) => {
        flushCount += 1
        await rpc.flush({clientId, events})
      },
    })
    try {
      for (let index = 0; index < BURST_EVENT_COUNT; index += 1) {
        flusher.push(paddedEvent(index, BURST_EVENT_BYTES))
      }
      await flusher.flushNow()

      expect(flushCount).toBeGreaterThan(1)
      expect(outboundFrameBytes.length).toBeGreaterThan(0)
      expect(Math.max(...outboundFrameBytes)).toBeLessThan(WS_RPC_PAYLOAD_BUDGET_BYTES)
      expect(closeCodes).toEqual([])
      expect(await rpc.config({})).toBeTruthy()
    } finally {
      flusher.dispose()
      socket.close()
    }
  }, 60_000)

  it('delivers an event at the client cap without the server closing the socket, and drops one above it', async () => {
    const {rpc, closeCodes, outboundFrameBytes, socket} = await openRecorderSocket()
    let flushCount = 0
    const clientId = 'flush-socket-over-cap'
    const flusher = createFlusher({
      send: async (events) => {
        flushCount += 1
        await rpc.flush({clientId, events})
      },
    })
    try {
      flusher.push(paddedEvent(1, MAX_FLUSH_BYTES + 1024))
      await flusher.flushNow()
      expect(flushCount).toBe(0)

      flusher.push(paddedEvent(2, MAX_FLUSH_BYTES - 4096))
      await flusher.flushNow()
      expect(flushCount).toBe(1)
      expect(outboundFrameBytes.length).toBe(1)
      expect(outboundFrameBytes[0]).toBeLessThan(WS_RPC_PAYLOAD_BUDGET_BYTES)
      expect(closeCodes).toEqual([])
      expect(await rpc.config({})).toBeTruthy()
    } finally {
      flusher.dispose()
      socket.close()
    }
  }, 60_000)
})
