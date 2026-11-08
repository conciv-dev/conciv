import {defineChatMiddleware} from '@tanstack/ai'
import {ChatEventType} from '@conciv/protocol/chat-event-types'

export function toolStartStamp() {
  return defineChatMiddleware({
    name: 'conciv-tool-start-stamp',
    onChunk: (_ctx, chunk) => {
      if (chunk.type !== ChatEventType.TOOL_CALL_START) return undefined
      return {...chunk, metadata: {...chunk.metadata, startedAt: chunk.timestamp ?? Date.now()}}
    },
  })
}
