import {z} from 'zod'
import {replyFor, runMessagesFor, runSessions, type ConcivDb} from '@conciv/db'
import {UiAnswerValueSchema, type UiAnswer} from '@conciv/protocol/ui-types'
import {nextChange, type Changes} from './changes.js'

export const UI_ASK_TIMEOUT_MS = 120_000
export const PART_WAIT_TIMEOUT_MS = 5_000

const UNANSWERED: UiAnswer = {
  answered: false,
  note: 'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
}

export type WaitDeps = {db: ConcivDb; changes: Changes}

export function awaitReply(
  deps: WaitDeps,
  sessionId: string,
  key: string,
  timeoutMs: number,
): Promise<unknown | null> {
  const existing = replyFor(deps.db, sessionId, key)
  if (existing !== null) return Promise.resolve(existing)
  return new Promise((resolve) => {
    const settle = (value: unknown | null): void => {
      clearTimeout(timer)
      deps.changes.emitter.off('change', check)
      resolve(value)
    }
    const check = (): void => {
      const value = replyFor(deps.db, sessionId, key)
      if (value !== null) settle(value)
    }
    const timer = setTimeout(() => settle(null), timeoutMs)
    deps.changes.emitter.on('change', check)
  })
}

const MessagePartsSchema = z.object({parts: z.array(z.unknown())}).loose()
const ToolCallPartSchema = z.object({type: z.literal('tool-call'), id: z.string(), name: z.string()}).loose()

export function toolCallParts(messages: unknown[]): {id: string; name: string}[] {
  return messages.flatMap((message) => {
    const parsed = MessagePartsSchema.safeParse(message)
    if (!parsed.success) return []
    return parsed.data.parts.flatMap((part) => {
      const parsedPart = ToolCallPartSchema.safeParse(part)
      return parsedPart.success ? [{id: parsedPart.data.id, name: parsedPart.data.name}] : []
    })
  })
}

export function pendingUiCallIds(db: ConcivDb, sessionId: string): string[] {
  const row = runMessagesFor(db, sessionId)
  if (!row) return []
  return toolCallParts(row.messages)
    .filter((part) => part.name === 'conciv_ui')
    .map((part) => part.id)
    .filter((id) => replyFor(db, sessionId, id) === null)
}

const ApprovalPartSchema = z
  .object({type: z.literal('tool-call'), approval: z.object({id: z.string()}).loose()})
  .loose()

function approvalIdsOf(messages: unknown[]): string[] {
  return messages.flatMap((message) => {
    const parsed = MessagePartsSchema.safeParse(message)
    if (!parsed.success) return []
    return parsed.data.parts.flatMap((part) => {
      const parsedPart = ApprovalPartSchema.safeParse(part)
      return parsedPart.success ? [parsedPart.data.approval.id] : []
    })
  })
}

export function sessionForApproval(db: ConcivDb, approvalId: string): string | null {
  for (const sessionId of runSessions(db)) {
    const row = runMessagesFor(db, sessionId)
    if (row && approvalIdsOf(row.messages).includes(approvalId)) return sessionId
  }
  return null
}

async function waitForUiCall(deps: WaitDeps, sessionId: string, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  const abort = new AbortController()
  try {
    while (Date.now() < deadline) {
      const pending = pendingUiCallIds(deps.db, sessionId)
      const newest = pending.at(-1)
      if (newest !== undefined) return newest
      await Promise.race([
        nextChange(deps.changes, abort.signal),
        new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now()))),
      ])
    }
    return null
  } finally {
    abort.abort()
  }
}

export async function askUi(deps: WaitDeps, sessionId: string): Promise<UiAnswer> {
  const callId = await waitForUiCall(deps, sessionId, PART_WAIT_TIMEOUT_MS)
  if (callId === null) return UNANSWERED
  const value = await awaitReply(deps, sessionId, callId, UI_ASK_TIMEOUT_MS)
  const parsed = UiAnswerValueSchema.safeParse(value)
  return parsed.success ? {answered: true, value: parsed.data} : UNANSWERED
}
