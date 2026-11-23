import {ORPCError} from '@orpc/client'
import {z} from 'zod'
import {engineTooOld, type RpcClient} from '@conciv/contract'
import {SessionId} from '@conciv/protocol/chat-types'

const PAGE_RPC_ID = 'experimental.page'

export const PAGE_NAMESPACE = 'page'

const PageTabSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  focused: z.boolean(),
  visible: z.boolean(),
})

const PageStateSchema = z.object({tabs: z.array(PageTabSchema), focusedTabId: z.string().nullable()})

export type PageState = z.infer<typeof PageStateSchema>

const QueueOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({index: z.number().int(), tool: z.string(), ok: z.literal(true), result: z.record(z.string(), z.unknown())}),
  z.object({index: z.number().int(), tool: z.string(), ok: z.literal(false), error: z.string()}),
])

const QueueResultSchema = z.object({
  queueId: z.string(),
  status: z.enum(['finished', 'stopped', 'lost']),
  outcomes: z.array(QueueOutcomeSchema),
  failed: z.number().int(),
  played: z.number().int(),
})

const WaitedResultSchema = QueueResultSchema.extend({notice: z.string()})

export type WaitedResult = z.infer<typeof WaitedResultSchema>

const QueueHandleSchema = z.object({queueId: z.string(), actions: z.number().int()})

export type QueueHandle = z.infer<typeof QueueHandleSchema>

const QueueProgressSchema = z.object({
  queueId: z.string(),
  status: z.literal('playing'),
  done: z.number().int(),
  of: z.number().int(),
})

const OutsideQueuesSchema = z.object({
  queued: z.array(QueueHandleSchema),
  finished: z.array(z.object({result: QueueResultSchema, notice: z.string()})),
})

export type OutsideQueues = z.infer<typeof OutsideQueuesSchema>

export type GoneQueue = {queueId: string; status: 'gone'}

export type PolledQueue = WaitedResult | z.infer<typeof QueueProgressSchema> | GoneQueue

type PageAnswer = {
  'sessions.attached': SessionId[]
  'tabs.list': PageState
  'queue.outside': OutsideQueues
  'queue.wait': WaitedResult | z.infer<typeof QueueProgressSchema>
}

type PageInput = {
  'sessions.attached': Record<string, never>
  'tabs.list': {sessionId: SessionId}
  'queue.outside': {sessionId: SessionId; toolCallIds: string[]}
  'queue.wait': {sessionId: SessionId; queueId: string; waitMs: number}
}

const PageAnswers: {[Method in keyof PageAnswer]: z.ZodType<PageAnswer[Method]>} = {
  'sessions.attached': z.array(SessionId),
  'tabs.list': PageStateSchema,
  'queue.outside': OutsideQueuesSchema,
  'queue.wait': z.union([WaitedResultSchema, QueueProgressSchema]),
}

const UnavailableSchema = z.object({
  code: z.literal('PLUGIN_RPC'),
  data: z.object({type: z.literal('rpc.unavailable')}),
})

const QueueUnknownSchema = z.object({
  code: z.literal('PLUGIN_RPC'),
  data: z.object({type: z.literal('unavailable')}),
})

export type TabsListing = {
  tabs: Array<{
    tab: SessionId
    project?: string
    branch?: string
    root: string
    href?: string
    pageTitle?: string
    sessionTitle: string
    lastActive: string
    running: boolean
    state?: 'visible' | 'hidden'
    harness: string
    browserTabs: Array<{id: string; href?: string; pageTitle?: string; state?: 'visible' | 'hidden'}>
  }>
  unreachable: Array<{root: string; error: string}>
}

export async function pageCall<Method extends keyof PageAnswer>(
  rpc: RpcClient,
  method: Method,
  input: PageInput[Method],
  signal: AbortSignal,
): Promise<PageAnswer[Method] | null> {
  const answer = await rpc.plugin.call({rpcId: PAGE_RPC_ID, method, input}, {signal}).catch((error: unknown) => {
    if (error instanceof ORPCError && UnavailableSchema.safeParse(error).success) return null
    throw error
  })
  if (answer === null) return null
  const schema: z.ZodType<PageAnswer[Method]> = PageAnswers[method]
  return schema.parse(answer)
}

export async function pollQueue(
  rpc: RpcClient,
  sessionId: SessionId,
  queueId: string,
  signal: AbortSignal,
): Promise<PolledQueue> {
  const gone: GoneQueue = {queueId, status: 'gone'}
  const polled = await pageCall(rpc, 'queue.wait', {sessionId, queueId, waitMs: 0}, signal).catch((error: unknown) => {
    if (error instanceof ORPCError && QueueUnknownSchema.safeParse(error).success) return gone
    throw error
  })
  return polled ?? gone
}

export function engineOutdated(error: unknown): boolean {
  return engineTooOld(error) || error instanceof z.ZodError
}
