import {EventEmitter, once} from 'node:events'
import {z} from 'zod'
import {toolApprovalId, type Approvals, type ChatStores} from '@conciv/ai/server'
import {OUTSIDE_SESSION_TARGET, type HubAccess} from '@conciv/protocol/chat-types'
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
  session: z.array(z.string()),
  once: z.array(z.string()),
  outside: z.array(z.string()).default([]),
  denied: z.array(z.string()).default([]),
  refused: z.array(z.string()).default([]),
  outsideAllowedGeneration: z.number().nullable().default(null),
})

type Grants = z.infer<typeof GrantsSchema>

export type ApprovalScope = 'once' | 'session'

export type ApprovalAsked = {
  approvalId: string
  toolCallId: string
  title: string
  input: unknown
  runId: string | null
  permission?: {always: boolean}
}

export type ApprovalDecision = {startsTurn: boolean}

export type Admission = 'allowed' | 'ask' | 'denied'

export type ApprovalStore = {
  asked: (threadId: string, ask: ApprovalAsked) => Promise<void>
  remove: (threadId: string, approvalId: string) => Promise<void>
  removeWhere: (threadId: string, test: (entry: ApprovalAsked) => boolean) => Promise<void>
  pending: (threadId: string) => Promise<ChatPendingApproval[]>
  decide: (
    threadId: string,
    approvalId: string,
    approved: boolean,
    scope: ApprovalScope,
  ) => Promise<ApprovalDecision | null>
  forRun: (threadId: string) => Promise<Approvals>
  admit: (threadId: string, approvalId: string) => Promise<Admission>
  decided: (threadId: string, approvalId: string, signal: AbortSignal) => Promise<void>
  outsideDenied: (threadId: string) => Promise<boolean>
  allowOutside: (threadId: string) => Promise<void>
}

const OUTSIDE_APPROVAL_ID = toolApprovalId(OUTSIDE_SESSION_TARGET)

const PROJECT_HOLDER = 'project'

const HIDDEN_COMMAND = /[;&|`$<>\n\\]/

const COMMAND_APPROVAL = /^[^:]+:command:(.*)$/s

function sessionGrantable(approvalId: string): boolean {
  const command = COMMAND_APPROVAL.exec(approvalId)?.[1]
  return command === undefined || !HIDDEN_COMMAND.test(command)
}

const PENDING_SUFFIX = ':pending-approvals'

const pendingKey = (threadId: string): string => `${threadId}${PENDING_SUFFIX}`

const GRANTS_SUFFIX = ':grants'

const grantsKey = (threadId: string): string => `${threadId}${GRANTS_SUFFIX}`

type ApprovalMetadata = ChatStores['metadata'] & {
  keysEndingWith: (namespace: string, suffix: string) => Promise<readonly string[]>
}

export function createApprovalStore(
  metadata: ApprovalMetadata,
  hubAccess: HubAccess,
  hubGeneration: () => number | null,
): ApprovalStore {
  const outsideHolder = (threadId: string): string => (hubAccess === 'project' ? PROJECT_HOLDER : threadId)
  const holderOf = (threadId: string, approvalId: string): string =>
    approvalId === OUTSIDE_APPROVAL_ID ? outsideHolder(threadId) : threadId
  const decisionKey = (threadId: string, approvalId: string): string =>
    `${holderOf(threadId, approvalId)}:${approvalId}`
  const decisions = new EventEmitter().setMaxListeners(0)
  const pendingOf = async (threadId: string) =>
    PendingSchema.parse((await metadata.get(APPROVALS_NAMESPACE, pendingKey(threadId))) ?? [])
  const grantsOf = async (threadId: string): Promise<Grants> =>
    GrantsSchema.parse(
      (await metadata.get(APPROVALS_NAMESPACE, grantsKey(threadId))) ?? {
        session: [],
        once: [],
        outside: [],
        denied: [],
        refused: [],
        outsideAllowedGeneration: null,
      },
    )
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
  const clearCoveredCards = async (): Promise<void> => {
    if (hubAccess !== 'project') return
    const keys = await metadata.keysEndingWith(APPROVALS_NAMESPACE, PENDING_SUFFIX)
    await Promise.all(
      keys.map(async (key) => {
        const pending = PendingSchema.parse((await metadata.get(APPROVALS_NAMESPACE, key)) ?? [])
        if (!pending.some((entry) => entry.approvalId === OUTSIDE_APPROVAL_ID)) return
        await metadata.set(
          APPROVALS_NAMESPACE,
          key,
          pending.filter((entry) => entry.approvalId !== OUTSIDE_APPROVAL_ID),
        )
      }),
    )
  }
  const decideOutside = async (threadId: string, approved: boolean): Promise<ApprovalDecision> => {
    const holder = outsideHolder(threadId)
    await clearCoveredCards()
    const grants = await grantsOf(holder)
    const bucket = approved ? 'session' : 'refused'
    const allowedGeneration = approved ? hubGeneration() : grants.outsideAllowedGeneration
    await writeGrants(holder, {
      ...grants,
      [bucket]: [...new Set([...grants[bucket], OUTSIDE_APPROVAL_ID])],
      outsideAllowedGeneration: allowedGeneration,
    })
    return {startsTurn: false}
  }
  const record = async (
    threadId: string,
    approvalId: string,
    approved: boolean,
    scope: ApprovalScope,
  ): Promise<ApprovalDecision | null> => {
    const pending = await pendingOf(threadId)
    const decided = pending.find((entry) => entry.approvalId === approvalId)
    if (decided === undefined) return null
    await metadata.set(
      APPROVALS_NAMESPACE,
      pendingKey(threadId),
      pending.filter((entry) => entry.approvalId !== approvalId),
    )
    if (approvalId === OUTSIDE_APPROVAL_ID) return decideOutside(threadId, approved)
    const grants = await grantsOf(threadId)
    const inTurn = decided.runId !== null
    if (!approved) {
      if (inTurn) await writeGrants(threadId, {...grants, denied: [...new Set([...grants.denied, approvalId])]})
      return {startsTurn: inTurn}
    }
    const oneTime = inTurn ? 'once' : 'outside'
    const bucket = scope === 'session' && sessionGrantable(approvalId) ? 'session' : oneTime
    await writeGrants(threadId, {...grants, [bucket]: [...new Set([...grants[bucket], approvalId])]})
    return {startsTurn: inTurn}
  }
  const removeWhere = (threadId: string, test: (entry: ApprovalAsked) => boolean): Promise<void> =>
    serialised(threadId, async () => {
      const pending = await pendingOf(threadId)
      const kept = pending.filter((entry) => !test(entry))
      if (kept.length === pending.length) return
      await metadata.set(APPROVALS_NAMESPACE, pendingKey(threadId), kept)
    })
  const outsideDenied = async (threadId: string): Promise<boolean> =>
    (await grantsOf(outsideHolder(threadId))).refused.includes(OUTSIDE_APPROVAL_ID)
  const outsideRevoked = (allowedGeneration: number | null): boolean => {
    const current = hubGeneration()
    return current === null || allowedGeneration !== current
  }
  return {
    asked: (threadId, ask) =>
      serialised(threadId, async () => {
        const pending = await pendingOf(threadId)
        if (pending.some((entry) => entry.approvalId === ask.approvalId)) return
        await metadata.set(APPROVALS_NAMESPACE, pendingKey(threadId), [...pending, ask])
      }),
    remove: (threadId, approvalId) => removeWhere(threadId, (entry) => entry.approvalId === approvalId),
    removeWhere,
    pending: async (threadId) => (await pendingOf(threadId)).map(({title, ...entry}) => ({...entry, toolName: title})),
    decide: async (threadId, approvalId, approved, scope) => {
      const decision = await serialised(threadId, () => record(threadId, approvalId, approved, scope))
      if (decision !== null) decisions.emit(decisionKey(threadId, approvalId))
      return decision
    },
    decided: (threadId, approvalId, signal) =>
      once(decisions, decisionKey(threadId, approvalId), {signal}).then(
        () => undefined,
        () => undefined,
      ),
    forRun: async (threadId) => {
      const grants = await grantsOf(threadId)
      if (grants.once.length > 0 || grants.denied.length > 0)
        await writeGrants(threadId, {...grants, once: [], denied: []})
      return new Map([
        ...grants.denied.map((id): [string, boolean] => [id, false]),
        ...[...grants.session, ...grants.once].map((id): [string, boolean] => [id, true]),
      ])
    },
    admit: async (threadId, approvalId) => {
      const holder = holderOf(threadId, approvalId)
      const grants = await grantsOf(holder)
      const revoked = approvalId === OUTSIDE_APPROVAL_ID && outsideRevoked(grants.outsideAllowedGeneration)
      if (grants.session.includes(approvalId) && !revoked) return 'allowed'
      if (grants.refused.includes(approvalId)) return 'denied'
      if (!grants.outside.includes(approvalId)) return 'ask'
      await writeGrants(holder, {...grants, outside: grants.outside.filter((id) => id !== approvalId)})
      return 'allowed'
    },
    outsideDenied,
    allowOutside: async (threadId) => {
      const holder = outsideHolder(threadId)
      const grants = await grantsOf(holder)
      await writeGrants(holder, {...grants, refused: grants.refused.filter((id) => id !== OUTSIDE_APPROVAL_ID)})
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
