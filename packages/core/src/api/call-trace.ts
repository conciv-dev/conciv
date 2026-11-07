import {z} from 'zod'
import {generateMessageId} from '@conciv/protocol/chat-message-types'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER} from '@conciv/protocol/chat-types'
import {safeStringify} from '@conciv/chat'

const HubOriginSchema = z.object({
  origin: z.enum(['hub']).optional().catch(undefined),
  client: z.string().max(64).optional().catch(undefined),
})

type HubOrigin = {client: string | null}

type CallMarker = {conciv: {origin: 'hub'; client: string | null}} | null

export function callTrace(header: (name: string) => string | null) {
  const hub = hubOrigin(header)
  const marker: CallMarker = hub === null ? null : {conciv: {origin: 'hub', client: hub.client}}
  return {
    hub,
    start: (callId: string, toolName: string, input: unknown) => startChunks(callId, toolName, input, marker),
    result: (callId: string, text: string, failed: boolean) => resultChunk(callId, text, failed, marker),
  }
}

function hubOrigin(header: (name: string) => string | null): HubOrigin | null {
  const parsed = HubOriginSchema.parse({
    origin: header(CONCIV_ORIGIN_HEADER) ?? undefined,
    client: header(CONCIV_CLIENT_HEADER) ?? undefined,
  })
  if (parsed.origin === undefined) return null
  return {client: parsed.client ?? null}
}

function startChunks(callId: string, toolName: string, input: unknown, marker: CallMarker): ChatEvent[] {
  const metadata = marker === null ? {} : {metadata: marker}
  return [
    {type: ChatEventType.TOOL_CALL_START, toolCallId: callId, toolCallName: toolName, ...metadata},
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: callId, delta: safeStringify(input)},
    {type: ChatEventType.TOOL_CALL_END, toolCallId: callId, ...metadata},
  ]
}

function resultChunk(callId: string, text: string, failed: boolean, marker: CallMarker): ChatEvent {
  const failure = failed ? {tanstack: {state: 'output-error'}} : null
  const metadata = marker === null && failure === null ? {} : {metadata: {...marker, ...failure}}
  return {
    type: ChatEventType.TOOL_CALL_RESULT,
    messageId: generateMessageId(),
    toolCallId: callId,
    content: text || JSON.stringify({result: 'non-text content'}),
    ...metadata,
  }
}
