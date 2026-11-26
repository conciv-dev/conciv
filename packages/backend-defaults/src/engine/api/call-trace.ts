import {z} from 'zod'
import {generateMessageId, outsideCallMessageId, type OutsideCallMetadataSchema} from '@conciv/types/chat-message-types'
import {ChatEventType, type ChatEvent} from '@conciv/types/chat-event-types'
import {CONCIV_CLIENT_HEADER, CONCIV_NAMED_TAB_HEADER, CONCIV_ORIGIN_HEADER} from '@conciv/types/chat-types'
import {safeStringify} from '@conciv/protocol'
import {Effect} from 'effect'
import type {Maker} from '@conciv/protocol/schema/identifier'
import {CallId} from '@conciv/protocol/schema/tool'
import type {Log} from '../lib/logging.js'

const HubOriginSchema = z.object({
  origin: z.enum(['hub']).optional().catch(undefined),
  client: z.string().max(64).optional().catch(undefined),
  namedTab: z.enum(['1']).optional().catch(undefined),
})

type HubOrigin = {client: string | null; namedTab: boolean}

type CallMarker = z.infer<typeof OutsideCallMetadataSchema> | null

type CallRun = {threadId: string; live: boolean}

type MirrorSink = {
  publish: (chunk: ChatEvent) => void
  record: (chunks: readonly ChatEvent[]) => Promise<void>
  driving: () => boolean
  log: Log
}

export function callTrace(header: (name: string) => string | null, ids: Maker) {
  const hub = hubOrigin(header)
  const callId = CallId.make('call_' + ids.ascending())
  const clock = {startedAt: Date.now()}
  const marker: CallMarker = hub === null ? null : {conciv: {origin: 'hub', client: hub.client, run: callId}}
  return {
    hub,
    callId,
    mark: (chunk: ChatEvent): ChatEvent => marked(chunk, marker),
    start: (run: CallRun, toolName: string, input: unknown): ChatEvent[] => {
      clock.startedAt = Date.now()
      return [
        ...(run.live ? [] : [runStarted(run.threadId, callId)]),
        ...startChunks(
          callId,
          toolName,
          input,
          marker,
          clock.startedAt,
          run.live ? undefined : outsideCallMessageId(callId),
        ),
      ]
    },
    result: (run: CallRun, text: string, failed: boolean): ChatEvent[] => [
      resultChunk(callId, text, failed, marker, {start: clock.startedAt, end: Date.now()}),
      ...(run.live ? [] : [runFinished(run.threadId, callId)]),
    ],
    mirror: (run: CallRun, sink: MirrorSink) => mirrorRun(run, kept(run, marker), sink),
  }
}

function kept(run: CallRun, marker: CallMarker): boolean {
  return !run.live || marker !== null
}

function mirrorRun(run: CallRun, saved: boolean, sink: MirrorSink) {
  const recorded: ChatEvent[] = []
  const order = {published: Promise.resolve(), deferred: false}
  const save = (): Promise<void> =>
    sink
      .record([...recorded])
      .catch((error: unknown) =>
        sink.log(Effect.logError('[hub] saving an outside call to the chat failed', {threadId: run.threadId, error})),
      )
  const send = (chunks: readonly ChatEvent[]): void => chunks.forEach((chunk) => sink.publish(chunk))
  const savedThenSent = async (chunks: readonly ChatEvent[]): Promise<void> => {
    if (sink.driving()) order.deferred = true
    else await save()
    send(chunks)
  }
  return {
    publish: (chunks: readonly ChatEvent[]): Promise<void> => {
      if (!saved) {
        send(chunks)
        return Promise.resolve()
      }
      recorded.push(...chunks)
      order.published = order.published.then(() => savedThenSent(chunks))
      return order.published
    },
    settle: async (): Promise<void> => {
      await order.published
      if (order.deferred) void save()
    },
  }
}

export function hubOrigin(header: (name: string) => string | null): HubOrigin | null {
  const parsed = HubOriginSchema.parse({
    origin: header(CONCIV_ORIGIN_HEADER) ?? undefined,
    client: header(CONCIV_CLIENT_HEADER) ?? undefined,
    namedTab: header(CONCIV_NAMED_TAB_HEADER) ?? undefined,
  })
  if (parsed.origin === undefined) return null
  return {client: parsed.client ?? null, namedTab: parsed.namedTab !== undefined}
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

function startChunks(
  callId: string,
  toolName: string,
  input: unknown,
  marker: CallMarker,
  startedAt: number,
  parentMessageId: string | undefined,
): ChatEvent[] {
  const metadata = marker === null ? {} : {metadata: marker}
  return [
    {
      type: ChatEventType.TOOL_CALL_START,
      toolCallId: callId,
      toolCallName: toolName,
      ...(parentMessageId === undefined ? {} : {parentMessageId}),
      metadata: {...marker, time: {start: startedAt}},
    },
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: callId, delta: safeStringify(input)},
    {type: ChatEventType.TOOL_CALL_END, toolCallId: callId, ...metadata},
  ]
}

function resultChunk(
  callId: string,
  text: string,
  failed: boolean,
  marker: CallMarker,
  time: {start: number; end: number},
): ChatEvent {
  const failure = failed ? {tanstack: {state: 'output-error'}} : null
  return {
    type: ChatEventType.TOOL_CALL_RESULT,
    messageId: generateMessageId(),
    toolCallId: callId,
    content: text || JSON.stringify({result: 'non-text content'}),
    metadata: {...marker, ...failure, time},
  }
}
