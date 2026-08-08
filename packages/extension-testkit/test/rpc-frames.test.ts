import {describe, expect, it} from 'vitest'
import {encodeRequestMessage, encodeResponseMessage, MessageType} from '@orpc/standard-server-peer'
import type {EncodedMessage} from '@orpc/standard-server-peer'
import {StandardRPCJsonSerializer, StandardRPCSerializer} from '@orpc/client/standard'
import {decodeRpcFrame} from '../src/rpc-frames.js'

async function outbound(id: string, url: string, body: unknown): Promise<EncodedMessage> {
  const encoded = await encodeRequestMessage(id, MessageType.REQUEST, {
    url: new URL(url, 'http://orpc'),
    headers: {},
    method: 'POST',
    body,
  })
  return encoded
}

async function inboundResponse(id: string, headers: Record<string, string>, body: unknown): Promise<string> {
  const encoded = await encodeResponseMessage(id, MessageType.RESPONSE, {status: 200, headers, body})
  if (typeof encoded !== 'string') throw new Error('a json-only response encoded to binary')
  return encoded
}

describe('the ws rpc frame observer decodes real oRPC peer frames', () => {
  it('decodes a real encoded request into its correlation id and procedure path', async () => {
    const frame = await decodeRpcFrame(
      await outbound('7', '/ext/recorder/flush', {json: {events: 2}, meta: []}),
      'outbound',
    )
    if (frame.phase !== 'request') throw new Error(`expected a request frame, got ${frame.phase}`)
    expect(frame.requestId).toBe('7')
    expect(frame.path).toBe('/ext/recorder/flush')
    expect(frame.input).toEqual({events: 2})
  })

  it('decodes a real encoded unary response and reports it as non-streaming', async () => {
    const frame = await decodeRpcFrame(
      await inboundResponse('7', {'content-type': 'application/json'}, {json: {ok: true}, meta: []}),
      'inbound',
    )
    if (frame.phase !== 'response') throw new Error(`expected a response frame, got ${frame.phase}`)
    expect(frame.requestId).toBe('7')
    expect(frame.status).toBe(200)
    expect(frame.streaming).toBe(false)
    expect(frame.output).toEqual({ok: true})
  })

  it('recognizes the event-iterator response that opens a subscription', async () => {
    async function* queries(): AsyncGenerator<unknown> {
      yield {json: {requestId: 'pq1'}, meta: []}
    }
    const frame = await decodeRpcFrame(await inboundResponse('9', {}, queries()), 'inbound')
    if (frame.phase !== 'response') throw new Error(`expected a response frame, got ${frame.phase}`)
    expect(frame.streaming).toBe(true)
  })

  it('decodes a real encoded iterator payload under the same correlation id', async () => {
    const encoded = await encodeResponseMessage('9', MessageType.EVENT_ITERATOR, {
      event: 'message',
      data: {json: {requestId: 'pq1'}, meta: []},
    })
    if (typeof encoded !== 'string') throw new Error('an iterator payload encoded to binary')
    const frame = await decodeRpcFrame(encoded, 'inbound')
    if (frame.phase !== 'iterator-event') throw new Error(`expected an iterator frame, got ${frame.phase}`)
    expect(frame.requestId).toBe('9')
    expect(frame.event).toBe('message')
    expect(frame.data).toEqual({requestId: 'pq1'})
  })

  it('decodes a real encoded abort signal', async () => {
    const encoded = await encodeRequestMessage('9', MessageType.ABORT_SIGNAL, undefined)
    if (typeof encoded !== 'string') throw new Error('an abort signal encoded to binary')
    expect(await decodeRpcFrame(encoded, 'outbound')).toEqual({phase: 'abort', requestId: '9'})
  })

  it('decodes the json half of a binary frame that carries a blob', async () => {
    const encoded = await encodeRequestMessage('11', MessageType.REQUEST, {
      url: new URL('http://orpc/ext/recorder/flush'),
      headers: {},
      method: 'POST',
      body: new File(['pixels'], 'shot.png', {type: 'image/png'}),
    })
    if (typeof encoded === 'string') throw new Error('a blob body encoded to a plain string')
    const frame = await decodeRpcFrame(encoded, 'outbound')
    if (frame.phase !== 'request') throw new Error(`expected a request frame, got ${frame.phase}`)
    expect(frame.path).toBe('/ext/recorder/flush')
  })

  it('restores the rich types the rpc serializer encodes, not the raw json envelope', async () => {
    const serialized = new StandardRPCSerializer(new StandardRPCJsonSerializer()).serialize({
      at: new Date('2026-01-02T03:04:05.000Z'),
      big: 7n,
      tags: new Set(['a']),
    })
    const frame = await decodeRpcFrame(await outbound('13', '/drafts/set', serialized), 'outbound')
    if (frame.phase !== 'request') throw new Error(`expected a request frame, got ${frame.phase}`)
    expect(frame.input).toEqual({at: new Date('2026-01-02T03:04:05.000Z'), big: 7n, tags: new Set(['a'])})
  })

  it('rejects a frame that is not an oRPC peer message', async () => {
    await expect(decodeRpcFrame('not a frame at all', 'inbound')).rejects.toThrow()
  })
})
