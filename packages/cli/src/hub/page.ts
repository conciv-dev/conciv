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

type PageAnswer = {'sessions.attached': SessionId[]; 'tabs.list': PageState}

type PageInput = {'sessions.attached': Record<string, never>; 'tabs.list': {sessionId: SessionId}}

const PageAnswers: {[Method in keyof PageAnswer]: z.ZodType<PageAnswer[Method]>} = {
  'sessions.attached': z.array(SessionId),
  'tabs.list': PageStateSchema,
}

const UnavailableSchema = z.object({
  code: z.literal('PLUGIN_RPC'),
  data: z.object({type: z.literal('rpc.unavailable')}),
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

export function engineOutdated(error: unknown): boolean {
  return engineTooOld(error) || error instanceof z.ZodError
}
