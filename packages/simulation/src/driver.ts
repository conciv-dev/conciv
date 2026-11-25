import {createORPCClient, ORPCError} from '@orpc/client'
import {RPCLink} from '@orpc/client/websocket'
import type {ContractRouterClient} from '@orpc/contract'
import {
  backendContract,
  ItemSchema,
  PROTOCOL_VERSION,
  type FinishReason,
  type Item,
  type LlmNotification,
  type ModelRequest,
  type ProviderInvocation,
} from '@conciv/protocol/simulation'

export type Answer =
  | {readonly kind: 'answer'; readonly items: readonly Item[]; readonly reason: FinishReason}
  | {readonly kind: 'disconnect'}
  | {readonly kind: 'hang'}

export type ToolCallAnswer = {id: string; name: string; input: unknown}

export function text(value: string): Answer {
  return {kind: 'answer', items: [{type: 'textDelta', text: value}], reason: 'stop'}
}

export function thinking(value: string, answer: string): Answer {
  const items: Item[] = [
    {type: 'reasoningDelta', text: value},
    {type: 'textDelta', text: answer},
  ]
  return {kind: 'answer', items, reason: 'stop'}
}

export function toolCalls(...calls: ToolCallAnswer[]): Answer {
  const items = calls.map((call, index) => ItemSchema.parse({type: 'toolCall', index, ...call}))
  return {kind: 'answer', items, reason: 'tool-calls'}
}

export function toolCall(id: string, name: string, input: unknown): Answer {
  return toolCalls({id, name, input})
}

export function disconnect(): Answer {
  return {kind: 'disconnect'}
}

export function hang(): Answer {
  return {kind: 'hang'}
}

export type DriveClient = ContractRouterClient<typeof backendContract>

export type Handler = (request: ModelRequest) => Answer | Promise<Answer>

export type Driver = {
  readonly client: DriveClient
  readonly serve: (handler: Handler) => void
  readonly close: () => Promise<void>
}

const REQUIRED_CAPABILITIES = ['llm.subscribe', 'llm.request', 'llm.chunk', 'llm.finish', 'llm.disconnect']

type DriverState = {
  handler: Handler | undefined
  readonly waiting: ProviderInvocation[]
  readonly answering: Set<Promise<void>>
  readonly failures: unknown[]
}

function ended(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'INVOCATION_NOT_FOUND'
}

function opened(websocket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    websocket.addEventListener('open', () => resolve(), {once: true})
    websocket.addEventListener('error', () => reject(new Error(`the driver could not connect to ${websocket.url}`)), {
      once: true,
    })
  })
}

async function answerInvocation(client: DriveClient, handler: Handler, invocation: ProviderInvocation): Promise<void> {
  const given = await handler(invocation.request)
  if (given.kind === 'hang') return
  if (given.kind === 'disconnect') {
    await client.llm.disconnect({id: invocation.id})
    return
  }
  await client.llm.chunk({id: invocation.id, items: [...given.items]})
  await client.llm.finish({id: invocation.id, reason: given.reason})
}

function drain(client: DriveClient, state: DriverState): void {
  const handler = state.handler
  if (handler === undefined) return
  for (const invocation of state.waiting.splice(0)) {
    const answered = answerInvocation(client, handler, invocation)
      .catch((error: unknown) => {
        if (!ended(error)) state.failures.push(error)
      })
      .finally(() => state.answering.delete(answered))
    state.answering.add(answered)
  }
}

async function listen(turns: AsyncIterable<LlmNotification>, client: DriveClient, state: DriverState): Promise<void> {
  for await (const notification of turns) {
    state.waiting.push(notification.params)
    drain(client, state)
  }
}

export async function connectDriver(url: string): Promise<Driver> {
  const websocket = new WebSocket(url)
  await opened(websocket)
  const client: DriveClient = createORPCClient(new RPCLink({websocket}))
  const closing = new AbortController()
  const state: DriverState = {handler: undefined, waiting: [], answering: new Set(), failures: []}
  const turns = await client
    .handshake({
      client: {name: 'conciv-simulation-driver', version: String(PROTOCOL_VERSION)},
      expectedRole: 'backend',
      offeredVersions: [PROTOCOL_VERSION],
      requiredCapabilities: REQUIRED_CAPABILITIES,
      optionalCapabilities: [],
    })
    .then(() => client.llm.subscribe(undefined, {signal: closing.signal}))
    .catch((error: unknown) => {
      websocket.close()
      throw error
    })
  const listening = listen(turns, client, state).catch((error: unknown) => {
    if (!closing.signal.aborted) state.failures.push(error)
  })
  return {
    client,
    serve: (handler) => {
      state.handler = handler
      drain(client, state)
    },
    close: async () => {
      closing.abort()
      await listening
      await Promise.all(state.answering)
      const closed = new Promise((resolve) => websocket.addEventListener('close', resolve, {once: true}))
      websocket.close()
      await closed
      if (state.failures.length > 0) throw new AggregateError(state.failures, 'the simulation driver failed')
    },
  }
}
