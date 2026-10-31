import {z} from 'zod'
import type {Approvals, ChatStores} from '@conciv/ai/server'
import type {ChatPendingApproval} from '@conciv/contract'
import {UiAnswerValueSchema, type UiAnswer} from '@conciv/protocol/ui-types'

const APPROVALS_NAMESPACE = 'conciv.approvals'

const UI_TOOL_NAME = 'conciv_ui'

const UI_CALL_WAIT_MS = 5_000

const UI_ANSWER_WAIT_MS = 120_000

const MCP_PREFIX = /^mcp__.+?__/

const PendingSchema = z.array(
  z.object({
    approvalId: z.string(),
    toolCallId: z.string(),
    title: z.string(),
    input: z.unknown(),
    runId: z.string().nullable(),
  }),
)

const GrantsSchema = z.object({
  session: z.array(z.string()),
  once: z.array(z.string()),
  outside: z.array(z.string()).default([]),
})

type Grants = z.infer<typeof GrantsSchema>

export type ApprovalScope = 'once' | 'session'

export type ApprovalAsked = {
  approvalId: string
  toolCallId: string
  title: string
  input: unknown
  runId: string | null
}

export type ApprovalDecision = {startsTurn: boolean}

export type ApprovalStore = {
  asked: (threadId: string, ask: ApprovalAsked) => Promise<void>
  pending: (threadId: string) => Promise<ChatPendingApproval[]>
  decide: (
    threadId: string,
    approvalId: string,
    approved: boolean,
    scope: ApprovalScope,
  ) => Promise<ApprovalDecision | null>
  forRun: (threadId: string) => Promise<Approvals>
  admit: (threadId: string, approvalId: string) => Promise<boolean>
}

const HIDDEN_COMMAND = /[;&|`$<>\n\\]/

const COMMAND_APPROVAL = /^[^:]+:command:(.*)$/s

function sessionGrantable(approvalId: string): boolean {
  const command = COMMAND_APPROVAL.exec(approvalId)?.[1]
  return command === undefined || !HIDDEN_COMMAND.test(command)
}

const pendingKey = (threadId: string): string => `${threadId}:pending-approvals`

const grantsKey = (threadId: string): string => `${threadId}:grants`

export function createApprovalStore(metadata: ChatStores['metadata']): ApprovalStore {
  const pendingOf = async (threadId: string) =>
    PendingSchema.parse((await metadata.get(APPROVALS_NAMESPACE, pendingKey(threadId))) ?? [])
  const grantsOf = async (threadId: string): Promise<Grants> =>
    GrantsSchema.parse(
      (await metadata.get(APPROVALS_NAMESPACE, grantsKey(threadId))) ?? {session: [], once: [], outside: []},
    )
  const writeGrants = (threadId: string, grants: Grants): Promise<void> =>
    metadata.set(APPROVALS_NAMESPACE, grantsKey(threadId), grants)
  return {
    asked: async (threadId, ask) => {
      const pending = await pendingOf(threadId)
      if (pending.some((entry) => entry.approvalId === ask.approvalId)) return
      await metadata.set(APPROVALS_NAMESPACE, pendingKey(threadId), [...pending, ask])
    },
    pending: async (threadId) =>
      (await pendingOf(threadId)).map((entry) => ({
        approvalId: entry.approvalId,
        toolCallId: entry.toolCallId,
        toolName: entry.title,
        input: entry.input,
        runId: entry.runId,
      })),
    decide: async (threadId, approvalId, approved, scope) => {
      const pending = await pendingOf(threadId)
      const decided = pending.find((entry) => entry.approvalId === approvalId)
      if (decided === undefined) return null
      await metadata.set(
        APPROVALS_NAMESPACE,
        pendingKey(threadId),
        pending.filter((entry) => entry.approvalId !== approvalId),
      )
      if (!approved) return {startsTurn: false}
      const grants = await grantsOf(threadId)
      const inTurn = decided.runId !== null
      const oneTime = inTurn ? 'once' : 'outside'
      const bucket = scope === 'session' && sessionGrantable(approvalId) ? 'session' : oneTime
      await writeGrants(threadId, {...grants, [bucket]: [...new Set([...grants[bucket], approvalId])]})
      return {startsTurn: inTurn}
    },
    forRun: async (threadId) => {
      const grants = await grantsOf(threadId)
      if (grants.once.length > 0) await writeGrants(threadId, {...grants, once: []})
      return new Map([...grants.session, ...grants.once].map((id) => [id, true]))
    },
    admit: async (threadId, approvalId) => {
      const grants = await grantsOf(threadId)
      if (grants.session.includes(approvalId)) return true
      if (!grants.outside.includes(approvalId)) return false
      await writeGrants(threadId, {...grants, outside: grants.outside.filter((id) => id !== approvalId)})
      return true
    },
  }
}

type UiWaiter = (callId: string | null) => void

type UiAnswerSlot = {value: Promise<unknown>; settle: (value: unknown) => void}

type UiThread = {calls: string[]; waiters: UiWaiter[]; answers: Map<string, UiAnswerSlot>}

function answerSlot(): UiAnswerSlot {
  const slot: {settle: (value: unknown) => void} = {settle: () => undefined}
  const value = new Promise<unknown>((resolve) => {
    slot.settle = resolve
  })
  return {value, settle: (answer) => slot.settle(answer)}
}

export type UiChannel = {
  noteToolCall: (threadId: string, toolCallId: string, toolName: string) => void
  answer: (threadId: string, toolCallId: string, value: unknown) => boolean
  ask: (threadId: string) => Promise<UiAnswer>
}

const UNANSWERED: UiAnswer = {
  answered: false,
  note: 'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
}

function withTimeout<T>(start: (settle: (value: T) => void) => void, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    timer.unref()
    start((value) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
}

export function createUiChannel(): UiChannel {
  const threads = new Map<string, UiThread>()
  const threadOf = (threadId: string): UiThread => {
    const existing = threads.get(threadId)
    if (existing) return existing
    const created: UiThread = {calls: [], waiters: [], answers: new Map()}
    threads.set(threadId, created)
    return created
  }
  const nextCall = (thread: UiThread): Promise<string | null> => {
    const queued = thread.calls.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    return withTimeout<string | null>((settle) => thread.waiters.push(settle), UI_CALL_WAIT_MS, null)
  }
  return {
    noteToolCall: (threadId, toolCallId, toolName) => {
      if (toolName.replace(MCP_PREFIX, '') !== UI_TOOL_NAME) return
      const thread = threadOf(threadId)
      thread.answers.set(toolCallId, answerSlot())
      const waiter = thread.waiters.shift()
      if (waiter) waiter(toolCallId)
      if (!waiter) thread.calls.push(toolCallId)
    },
    answer: (threadId, toolCallId, value) => {
      const slot = threads.get(threadId)?.answers.get(toolCallId)
      if (slot === undefined) return false
      slot.settle(value)
      return true
    },
    ask: async (threadId) => {
      const thread = threadOf(threadId)
      const callId = await nextCall(thread)
      if (callId === null) return UNANSWERED
      const slot = thread.answers.get(callId)
      if (slot === undefined) return UNANSWERED
      const value = await withTimeout<unknown>((settle) => void slot.value.then(settle), UI_ANSWER_WAIT_MS, null)
      thread.answers.delete(callId)
      const parsed = UiAnswerValueSchema.safeParse(value)
      return parsed.success ? {answered: true, value: parsed.data} : UNANSWERED
    },
  }
}
