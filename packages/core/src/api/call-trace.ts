import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {generateMessageId, type OutsideCallMetadataSchema} from '@conciv/protocol/chat-message-types'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {CONCIV_CLIENT_HEADER, CONCIV_CHOSEN_ENGINE_HEADER, CONCIV_ORIGIN_HEADER} from '@conciv/protocol/chat-types'
import {safeStringify} from '@conciv/contract'
import {logError} from '../lib/debug.js'

const HubOriginSchema = z.object({
  origin: z.enum(['hub']).optional().catch(undefined),
  client: z.string().max(64).optional().catch(undefined),
  choseEngine: z.enum(['1']).optional().catch(undefined),
})

type HubOrigin = {client: string | null; choseEngine: boolean}

type CallMarker = z.infer<typeof OutsideCallMetadataSchema> | null

type CallRun = {threadId: string; live: boolean}

type MirrorSink = {publish: (chunk: ChatEvent) => void; record: (chunks: readonly ChatEvent[]) => Promise<void>}

export function callTrace(header: (name: string) => string | null) {
  const hub = hubOrigin(header)
  const callId = randomUUID()
  const marker: CallMarker = hub === null ? null : {conciv: {origin: 'hub', client: hub.client, run: callId}}
  return {
    hub,
    callId,
    mark: (chunk: ChatEvent): ChatEvent => marked(chunk, marker),
    start: (run: CallRun, toolName: string, input: unknown): ChatEvent[] => [
      ...(run.live ? [] : [runStarted(run.threadId, callId)]),
      ...startChunks(callId, toolName, input, marker),
    ],
    result: (run: CallRun, text: string, failed: boolean): ChatEvent[] => [
      resultChunk(callId, text, failed, marker),
      ...(run.live ? [] : [runFinished(run.threadId, callId)]),
    ],
    mirror: (run: CallRun, sink: MirrorSink) => mirrorRun(run, marker !== null, sink),
  }
}

function mirrorRun(run: CallRun, outside: boolean, sink: MirrorSink) {
  const recorded: ChatEvent[] = []
  const kept = !run.live || outside
  const save = (): Promise<void> =>
    sink
      .record(recorded.splice(0))
      .catch((error: unknown) => logError(`[hub] saving an outside call to the chat failed: ${String(error)}`))
  return {
    publish: (chunks: readonly ChatEvent[]): void => {
      if (kept) recorded.push(...chunks)
      chunks.forEach((chunk) => sink.publish(chunk))
    },
    settle: async (): Promise<void> => {
      if (!kept) return
      if (run.live) {
        void save()
        return
      }
      await save()
    },
  }
}

function hubOrigin(header: (name: string) => string | null): HubOrigin | null {
  const parsed = HubOriginSchema.parse({
    origin: header(CONCIV_ORIGIN_HEADER) ?? undefined,
    client: header(CONCIV_CLIENT_HEADER) ?? undefined,
    choseEngine: header(CONCIV_CHOSEN_ENGINE_HEADER) ?? undefined,
  })
  if (parsed.origin === undefined) return null
  return {client: parsed.client ?? null, choseEngine: parsed.choseEngine !== undefined}
}

function marked(chunk: ChatEvent, marker: CallMarker): ChatEvent {
  if (marker === null) return chunk
  if (chunk.type === ChatEventType.TOOL_CALL_START || chunk.type === ChatEventType.TOOL_CALL_END) {
    return {...chunk, metadata: {...chunk.metadata, ...marker}}
  }
  if (chunk.type === ChatEventType.TOOL_CALL_RESULT) return {...chunk, metadata: {...chunk.metadata, ...marker}}
  return chunk
}

function runStarted(threadId: string, callId: string): ChatEvent {
  return {type: ChatEventType.RUN_STARTED, runId: mirrorRunId(callId), threadId}
}

function runFinished(threadId: string, callId: string): ChatEvent {
  return {type: ChatEventType.RUN_FINISHED, runId: mirrorRunId(callId), threadId, finishReason: 'stop'}
}

function mirrorRunId(callId: string): string {
  return `mirror-${callId}`
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
