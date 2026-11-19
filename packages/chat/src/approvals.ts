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
    permission: z.object({always: z.boolean()}).optional(),
  }),
)

const GrantsSchema = z.object({
  once: z.array(z.string()),
  denied: z.array(z.string()).default([]),
})

type Grants = z.infer<typeof GrantsSchema>

export type ApprovalAsked = {
  approvalId: string
  toolCallId: string
  title: string
  input: unknown
  runId: string | null
  permission?: {always: boolean}
}

export type ApprovalDecision = {startsTurn: boolean}

export type ApprovalStore = {
  asked: (threadId: string, ask: ApprovalAsked) => Promise<void>
  remove: (threadId: string, approvalId: string) => Promise<void>
  removeWhere: (threadId: string, test: (entry: ApprovalAsked) => boolean) => Promise<void>
  pending: (threadId: string) => Promise<ChatPendingApproval[]>
  decide: (threadId: string, approvalId: string, approved: boolean) => Promise<ApprovalDecision | null>
  forRun: (threadId: string) => Promise<Approvals>
}

const PENDING_SUFFIX = ':pending-approvals'

const pendingKey = (threadId: string): string => `${threadId}${PENDING_SUFFIX}`

const GRANTS_SUFFIX = ':grants'

const grantsKey = (threadId: string): string => `${threadId}${GRANTS_SUFFIX}`

type ApprovalMetadata = ChatStores['metadata'] & {
  keysEndingWith: (namespace: string, suffix: string) => Promise<readonly string[]>
}

export function createApprovalStore(metadata: ApprovalMetadata): ApprovalStore {
  const loadPending = async (threadId: string) =>
    PendingSchema.parse((await metadata.get(APPROVALS_NAMESPACE, pendingKey(threadId))) ?? [])
  const loadGrants = async (threadId: string): Promise<Grants> =>
    GrantsSchema.parse((await metadata.get(APPROVALS_NAMESPACE, grantsKey(threadId))) ?? {once: [], denied: []})
  const pendingTails = new Map<string, Promise<unknown>>()
  const serialised = <T>(threadId: string, update: () => Promise<T>): Promise<T> => {
    const run = (pendingTails.get(threadId) ?? Promise.resolve()).then(update)
    const tail = run.catch(() => undefined)
    pendingTails.set(threadId, tail)
    void tail.then(() => {
      if (pendingTails.get(threadId) === tail) pendingTails.delete(threadId)
    })
    return run
  }
  const writeGrants = (threadId: string, grants: Grants): Promise<void> =>
    metadata.set(APPROVALS_NAMESPACE, grantsKey(threadId), grants)
  const record = async (threadId: string, approvalId: string, approved: boolean): Promise<ApprovalDecision | null> => {
    const pending = await loadPending(threadId)
    const decided = pending.find((entry) => entry.approvalId === approvalId)
    if (decided === undefined) return null
    await metadata.set(
      APPROVALS_NAMESPACE,
      pendingKey(threadId),
      pending.filter((entry) => entry.approvalId !== approvalId),
    )
    if (decided.runId === null) return {startsTurn: false}
    const grants = await loadGrants(threadId)
    if (!approved) {
      await writeGrants(threadId, {...grants, denied: [...new Set([...grants.denied, approvalId])]})
      return {startsTurn: true}
    }
    await writeGrants(threadId, {...grants, once: [...new Set([...grants.once, approvalId])]})
    return {startsTurn: true}
  }
  const removeWhere = (threadId: string, test: (entry: ApprovalAsked) => boolean): Promise<void> =>
    serialised(threadId, async () => {
      const pending = await loadPending(threadId)
      const kept = pending.filter((entry) => !test(entry))
      if (kept.length === pending.length) return
      await metadata.set(APPROVALS_NAMESPACE, pendingKey(threadId), kept)
    })
  return {
    asked: (threadId, ask) =>
      serialised(threadId, async () => {
        const pending = await loadPending(threadId)
        if (pending.some((entry) => entry.approvalId === ask.approvalId)) return
        await metadata.set(APPROVALS_NAMESPACE, pendingKey(threadId), [...pending, ask])
      }),
    remove: (threadId, approvalId) => removeWhere(threadId, (entry) => entry.approvalId === approvalId),
    removeWhere,
    pending: async (threadId) =>
      (await loadPending(threadId)).map(({title, ...entry}) => ({...entry, toolName: title})),
    decide: (threadId, approvalId, approved) => serialised(threadId, () => record(threadId, approvalId, approved)),
    forRun: async (threadId) => {
      const grants = await loadGrants(threadId)
      if (grants.once.length > 0 || grants.denied.length > 0)
        await writeGrants(threadId, {...grants, once: [], denied: []})
      return new Map([
        ...grants.denied.map((id): [string, boolean] => [id, false]),
        ...grants.once.map((id): [string, boolean] => [id, true]),
      ])
    },
  }
}

export async function dropPermissionCards(
  store: ApprovalStore,
  metadata: Pick<ApprovalMetadata, 'keysEndingWith'>,
): Promise<void> {
  const keys = await metadata.keysEndingWith(APPROVALS_NAMESPACE, PENDING_SUFFIX)
  await Promise.all(
    keys.map((key) =>
      store.removeWhere(key.slice(0, -PENDING_SUFFIX.length), (entry) => entry.permission !== undefined),
    ),
  )
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
  const ensureThread = (threadId: string): UiThread => {
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
      const thread = ensureThread(threadId)
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
      const thread = ensureThread(threadId)
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
