import {asyncRetry} from '@tanstack/pacer'
import {PAGE_QUEUE_ASYNC_TOOL, type PageQueueResult} from '@conciv/protocol/page-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {ChatPlane, FollowUpOutcome} from '@conciv/chat'
import {ChatEventType, pageQueueEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {generateMessageId} from '@conciv/protocol/chat-message-types'
import {queueNotice} from '@conciv/contract'
import {logError} from '../lib/debug.js'

type Delivery = 'owed' | 'nextReply' | 'delivered'

export type OwedQueue = {queueId: string; result: PageQueueResult; before: 'owed' | 'nextReply'}

export type QueueDelivery = {
  owed: (sessionId: SessionId, claim: boolean) => Promise<OwedQueue[]>
  settle: (sessionId: SessionId, queueIds: string[], delivery: Delivery) => Promise<void>
}

const DELIVERIES_BEFORE: ReadonlyArray<'owed' | 'nextReply'> = ['owed', 'nextReply']

const FOLLOW_UP_ATTEMPTS = 3

const FOLLOW_UP_BACKOFF_MS = 100

export async function owesFollowUp(queues: QueueDelivery, sessionId: SessionId): Promise<boolean> {
  return (await queues.owed(sessionId, false)).some((queue) => queue.before === 'owed')
}

export async function holdForNextReply(queues: QueueDelivery, sessionId: SessionId): Promise<void> {
  const held = await queues.owed(sessionId, true)
  await queues.settle(
    sessionId,
    held.map((queue) => queue.queueId),
    'nextReply',
  )
}

export async function startQueueFollowUp(
  queues: QueueDelivery,
  plane: Pick<ChatPlane, 'live' | 'followUp'>,
  sessionId: SessionId,
  deleted: (sessionId: SessionId) => Promise<boolean>,
): Promise<void> {
  if (!(await owesFollowUp(queues, sessionId)) || (await plane.live(sessionId))) return
  const owed = await queues.owed(sessionId, true)
  if (owed.length === 0) return
  const notices = owed.map((queue) => queueNotice(queue.result)).join('\n\n')
  const followUp = asyncRetry(
    async (): Promise<FollowUpOutcome> => {
      if (await deleted(sessionId)) return {kind: 'stopped'}
      const attempt = await plane.followUp(sessionId, notices)
      if (attempt.kind === 'failed') throw new Error(attempt.error)
      return attempt
    },
    {maxAttempts: FOLLOW_UP_ATTEMPTS, backoff: 'exponential', baseWait: FOLLOW_UP_BACKOFF_MS, throwOnError: 'last'},
  )
  const outcome = await followUp().then(
    (attempt): FollowUpOutcome => attempt ?? {kind: 'failed', error: 'the follow-up retryer did not run'},
    (error: unknown): FollowUpOutcome => {
      const queueIds = owed.map((queue) => queue.queueId).join(', ')
      logError(
        `[core] the follow-up turns for queues ${queueIds} failed; they wait for the next reply: ${String(error)}`,
      )
      return {kind: 'failed', error: String(error)}
    },
  )
  for (const before of DELIVERIES_BEFORE) {
    const settled = owed.filter((queue) => queue.before === before).map((queue) => queue.queueId)
    if (settled.length > 0) await queues.settle(sessionId, settled, deliveryAfter(outcome, before))
  }
}

function deliveryAfter(outcome: FollowUpOutcome, before: 'owed' | 'nextReply'): Delivery {
  if (outcome.kind === 'delivered') return 'delivered'
  if (outcome.kind === 'failed' || outcome.kind === 'stopped') return 'nextReply'
  return before
}

export function pageQueueChunks(options: {
  result: PageQueueResult
  record: {sessionId: SessionId; toolCallId: string | undefined}
  live: boolean
}): ChatEvent[] {
  const {result, record, live} = options
  const toolCallId = `page-queue-${result.queueId}`
  const runId = `mirror-${toolCallId}`
  const card: ChatEvent[] = [
    pageQueueEvent.create({...result, ...(record.toolCallId === undefined ? {} : {toolCallId: record.toolCallId})}),
    {type: ChatEventType.TOOL_CALL_START, toolCallId, toolCallName: PAGE_QUEUE_ASYNC_TOOL},
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify({queueId: result.queueId})},
    {type: ChatEventType.TOOL_CALL_END, toolCallId},
    {
      type: ChatEventType.TOOL_CALL_RESULT,
      messageId: generateMessageId(),
      toolCallId,
      content: JSON.stringify(result),
    },
  ]
  if (live) return card
  return [
    {type: ChatEventType.RUN_STARTED, runId, threadId: record.sessionId},
    ...card,
    {type: ChatEventType.RUN_FINISHED, runId, threadId: record.sessionId, finishReason: 'stop'},
  ]
}
