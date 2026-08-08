import {decodeRequestMessage, decodeResponseMessage, MessageType} from '@orpc/standard-server-peer'
import type {EncodedMessage} from '@orpc/standard-server-peer'
import {StandardRPCJsonSerializer, StandardRPCSerializer} from '@orpc/client/standard'
import {isEventIteratorHeaders} from '@orpc/standard-server'

const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer())

export type RpcFrameDirection = 'outbound' | 'inbound'
export type RpcIteratorEvent = 'message' | 'error' | 'done'

export type DecodedRpcFrame =
  | {phase: 'request'; requestId: string; path: string; input: unknown}
  | {phase: 'response'; requestId: string; status: number; streaming: boolean; output: unknown}
  | {phase: 'iterator-event'; requestId: string; event: RpcIteratorEvent; data: unknown}
  | {phase: 'abort'; requestId: string}

export function rpcPayload(body: unknown): unknown {
  return serializer.deserialize(body)
}

function iteratorFrame(requestId: string, payload: unknown): DecodedRpcFrame {
  if (typeof payload !== 'object' || payload === null || !('event' in payload)) {
    throw new Error(`an oRPC iterator frame carried no event: ${JSON.stringify(payload)}`)
  }
  const event = payload.event
  if (event !== 'message' && event !== 'error' && event !== 'done') {
    throw new Error(`an oRPC iterator frame carried an unknown event "${String(event)}"`)
  }
  return {phase: 'iterator-event', requestId, event, data: rpcPayload('data' in payload ? payload.data : undefined)}
}

export async function decodeRpcFrame(raw: EncodedMessage, direction: RpcFrameDirection): Promise<DecodedRpcFrame> {
  if (direction === 'outbound') {
    const [requestId, type, payload] = await decodeRequestMessage(raw)
    if (type === MessageType.ABORT_SIGNAL) return {phase: 'abort', requestId}
    if (type === MessageType.EVENT_ITERATOR) return iteratorFrame(requestId, payload)
    return {phase: 'request', requestId, path: payload.url.pathname, input: rpcPayload(payload.body)}
  }
  const [requestId, type, payload] = await decodeResponseMessage(raw)
  if (type === MessageType.ABORT_SIGNAL) return {phase: 'abort', requestId}
  if (type === MessageType.EVENT_ITERATOR) return iteratorFrame(requestId, payload)
  return {
    phase: 'response',
    requestId,
    status: payload.status,
    streaming: isEventIteratorHeaders(payload.headers),
    output: rpcPayload(payload.body),
  }
}
