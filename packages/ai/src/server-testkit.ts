import {z} from 'zod'
import {chat} from '@tanstack/ai'
import {fetchServerSentEvents, webSocket} from '@tanstack/ai-client'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineAIPersistence, reconstructChat} from '@tanstack/ai-persistence'
import {runPersistenceConformance} from '@tanstack/ai-persistence/testkit'
import type {ChatEvent} from './events.js'
import type {TextAdapter} from './adapters.js'
import type {ChatMessage, ModelMessage} from './messages.js'
import type {ChatTool} from './tools.js'
import {createMessageFold, type MessageStore, type MetadataStore, type RunStore} from './server.js'

export function foldChatEvents(events: Iterable<ChatEvent>): ChatMessage[] {
  const fold = createMessageFold()
  for (const event of events) fold.fold(event)
  return fold.messages()
}

export type ToolTurn = {
  adapter: TextAdapter
  messages: Array<ChatMessage | ModelMessage>
  threadId: string
  tools: ChatTool[]
}

export function toolTurn(turn: ToolTurn): AsyncIterable<ChatEvent> {
  return chat({...turn, lazyToolsConfig: {includeDescription: 'first-sentence'}})
}

export function connectMcpClient(url: string, headers?: Record<string, string>) {
  return createMCPClient({transport: {type: 'http', url, ...(headers === undefined ? {} : {headers})}})
}

export type DeliveredTurn = {
  threadId: string
  runId: string
  messages: ChatMessage[]
  signal: AbortSignal
}

export async function socketTurn(url: string, turn: DeliveredTurn): Promise<AsyncIterable<ChatEvent>> {
  const connection = webSocket(url)
  const stream = connection.subscribe(turn.signal)
  await connection.send(turn.messages, {}, turn.signal, {threadId: turn.threadId, runId: turn.runId})
  return stream
}

export function serverSentEventsTurn(url: string, turn: DeliveredTurn): AsyncIterable<ChatEvent> {
  return fetchServerSentEvents(url).connect(turn.messages, {}, turn.signal, {
    threadId: turn.threadId,
    runId: turn.runId,
  })
}

export function serverSentEventsJoin(url: string, runId: string): AsyncIterable<ChatEvent> {
  return fetchServerSentEvents(url).joinRun(runId)
}

export type ChatStores = {messages: MessageStore; runs: RunStore; metadata?: MetadataStore}

export function runChatStoreConformance(name: string, stores: () => ChatStores): void {
  runPersistenceConformance(name, () => defineAIPersistence({stores: stores()}), {
    skip: ['interrupts', 'generationRuns', 'artifacts', 'blobs'],
  })
}

const ReconstructedThreadSchema = z.looseObject({
  messages: z.array(z.custom<ChatMessage>()),
  activeRun: z.object({runId: z.string()}).nullable(),
})

export type ReconstructedThread = z.infer<typeof ReconstructedThreadSchema>

export async function reconstructThread(stores: ChatStores, threadId: string): Promise<ReconstructedThread> {
  const response = await reconstructChat(
    defineAIPersistence({stores}),
    new Request(`http://conciv.test/?threadId=${threadId}`),
  )
  return ReconstructedThreadSchema.parse(await response.json())
}
