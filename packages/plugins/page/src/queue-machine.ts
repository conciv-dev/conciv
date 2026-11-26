import type {Deferred} from 'effect'
import type * as Tool from '@conciv/protocol/schema/tool'
import {RESULT_CAP_CHARS} from '@conciv/protocol'
import type {SessionId} from '@conciv/types/chat-types'
import type {PageQueueOutcome, PageQueueProgress, PageQueueResult} from './page-types.js'

export type Landed = 'played' | 'stopped' | 'lost'

export type Settled = {readonly outcome: PageQueueOutcome; readonly landed: Landed}

type Delivery = 'owed' | 'delivered'

export type QueueEntry = {
  readonly queueId: string
  readonly sessionId: SessionId
  readonly toolCallId: string
  readonly origin: Tool.Origin
  readonly tools: readonly string[]
  readonly settled: readonly (Settled | undefined)[]
  readonly result: PageQueueResult | null
  readonly delivery: Delivery
  readonly done: Deferred.Deferred<PageQueueResult>
}

export type QueueState = {readonly entries: readonly QueueEntry[]}

export type QueueEvent =
  | {readonly type: 'started'; readonly entry: QueueEntry}
  | {readonly type: 'landed'; readonly queueId: string; readonly index: number; readonly settled: Settled}
  | {readonly type: 'finished'; readonly queueId: string}
  | {readonly type: 'announce'; readonly queueId: string}
  | {readonly type: 'delivered'; readonly queueIds: readonly string[]}
  | {readonly type: 'session.cancelled'; readonly sessionId: SessionId}

export type QueueEffect =
  | {readonly type: 'resolve'; readonly entry: QueueEntry; readonly result: PageQueueResult}
  | {readonly type: 'announce'; readonly entry: QueueEntry}

export type QueueTransition = {readonly state: QueueState; readonly effects: readonly QueueEffect[]}

export const KEPT_QUEUES = 200

export const OWED_QUEUES = 1000

const QUEUE_RESULT_CHARS = RESULT_CAP_CHARS - 5000

export function createQueueState(): QueueState {
  return {entries: []}
}

export function transitionQueue(state: QueueState, event: QueueEvent): QueueTransition {
  if (event.type === 'started') return {state: {entries: kept([...state.entries, event.entry])}, effects: []}
  if (event.type === 'landed')
    return updated(state, event.queueId, (entry) => ({
      ...entry,
      settled: entry.settled.map((each, index) => (index === event.index ? event.settled : each)),
    }))
  if (event.type === 'finished') {
    const entry = state.entries.find((each) => each.queueId === event.queueId)
    if (entry === undefined || entry.result !== null) return {state, effects: []}
    const result = buildResult(entry)
    const next = updated(state, event.queueId, (each) => ({...each, result}))
    return {state: next.state, effects: [{type: 'resolve', entry, result}]}
  }
  if (event.type === 'announce') {
    const entry = state.entries.find((each) => each.queueId === event.queueId)
    if (entry === undefined || entry.result === null || entry.delivery !== 'owed') return {state, effects: []}
    return {state, effects: [{type: 'announce', entry}]}
  }
  if (event.type === 'delivered') return redelivered(state, event.queueIds)
  return {state: {entries: state.entries.filter((entry) => entry.sessionId !== event.sessionId)}, effects: []}
}

export function findQueue(state: QueueState, sessionId: SessionId, queueId: string): QueueEntry | undefined {
  return state.entries.find((entry) => entry.queueId === queueId && entry.sessionId === sessionId)
}

export function readOwing(state: QueueState): number {
  return state.entries.filter((entry) => entry.delivery !== 'delivered').length
}

export function readProgress(entry: QueueEntry): PageQueueProgress {
  return {
    queueId: entry.queueId,
    status: 'playing',
    done: entry.settled.filter((each) => each !== undefined).length,
    of: entry.tools.length,
  }
}

function updated(state: QueueState, queueId: string, change: (entry: QueueEntry) => QueueEntry): QueueTransition {
  return {
    state: {entries: state.entries.map((entry) => (entry.queueId === queueId ? change(entry) : entry))},
    effects: [],
  }
}

function redelivered(state: QueueState, queueIds: readonly string[]): QueueTransition {
  return {
    state: {
      entries: state.entries.map((entry) =>
        queueIds.includes(entry.queueId) ? {...entry, delivery: 'delivered'} : entry,
      ),
    },
    effects: [],
  }
}

function kept(entries: readonly QueueEntry[]): readonly QueueEntry[] {
  const delivered = entries.filter((entry) => entry.result !== null && entry.delivery === 'delivered')
  const dropped = delivered.slice(0, Math.max(0, delivered.length - KEPT_QUEUES))
  return entries.filter((entry) => !dropped.includes(entry))
}

function buildResult(entry: QueueEntry): PageQueueResult {
  const settled = entry.settled.flatMap((each) => (each === undefined ? [] : [each]))
  const ran = settled.filter((each) => each.landed === 'played')
  const status = settled.some((each) => each.landed === 'lost')
    ? 'lost'
    : settled.some((each) => each.landed === 'stopped')
      ? 'stopped'
      : 'finished'
  return fitted({
    queueId: entry.queueId,
    status,
    outcomes: settled.map((each) => each.outcome),
    failed: ran.filter((each) => !each.outcome.ok).length,
    played: ran.length,
  })
}

function fitted(
  result: PageQueueResult,
  share = Math.floor(QUEUE_RESULT_CHARS / Math.max(result.outcomes.length, 1)),
): PageQueueResult {
  const capped = {...result, outcomes: result.outcomes.map((outcome) => cappedOutcome(outcome, share))}
  if (JSON.stringify(capped).length <= QUEUE_RESULT_CHARS || share === 0) return capped
  return fitted(result, Math.floor(share / 2))
}

function cappedOutcome(outcome: PageQueueOutcome, share: number): PageQueueOutcome {
  if (!outcome.ok) return outcome.error.length <= share ? outcome : {...outcome, error: takeHead(outcome.error, share)}
  const body = JSON.stringify(outcome.result)
  if (body.length <= share) return outcome
  return {...outcome, result: {truncated: true, length: body.length, head: takeHead(body, share)}}
}

function takeHead(text: string, length: number): string {
  return Array.from(text).slice(0, length).join('')
}
