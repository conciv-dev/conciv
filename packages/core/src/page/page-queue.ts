import {randomUUID} from 'node:crypto'
import {setImmediate} from 'node:timers/promises'
import pTimeout from 'p-timeout'
import {
  isPageFailure,
  PAGE_QUEUE_ASYNC_TOOL,
  PAGE_QUEUE_REFUSED,
  PAGE_QUEUE_STOPPED,
  PAGE_QUEUE_SYNC_MS,
  PAGE_QUEUE_TOOL,
  PageQueueActionsSchema,
  type PageOutcome,
  type PageQueueOutcome,
  type PageQueueHandle,
  type PageQueueProgress,
  type PageQueueResult,
} from '@conciv/protocol/page-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import {ChatEventType, pageQueueEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {generateMessageId} from '@conciv/protocol/chat-message-types'
import {queueNotice, RESULT_CAP_CHARS} from '@conciv/contract'
import type {Journal, PageBus} from './page-bus.js'
import {logError} from '../lib/debug.js'

type Landed = 'played' | 'stopped' | 'lost'

type Settled = {outcome: PageQueueOutcome; landed: Landed}

type Delivery = 'owed' | 'claimed' | 'delivered'

export type QueueRecord = {
  queueId: string
  sessionId: SessionId
  outside: boolean
  toolCallId: string | undefined
  tools: string[]
  settled: (Settled | undefined)[]
  result: PageQueueResult | null
  delivery: Delivery
  done: Promise<PageQueueResult>
}

export type QueueStart = {
  agentId: string
  input: Record<string, unknown>
  outside: boolean
  toolCallId: string | undefined
}

export type PageQueues = {
  start: (sessionId: SessionId, start: QueueStart) => Promise<{queueId: string; actions: number}>
  play: (sessionId: SessionId, start: QueueStart, signal?: AbortSignal) => Promise<PageQueueResult | PageQueueProgress>
  wait: (
    sessionId: SessionId,
    queueId: string,
    waitMs: number,
    signal?: AbortSignal,
  ) => Promise<PageQueueResult | PageQueueProgress>
  undelivered: (sessionId: SessionId, outside: boolean) => PageQueueResult[]
  startedBy: (sessionId: SessionId, toolCallIds: ReadonlySet<string>) => PageQueueHandle[]
  claim: (record: QueueRecord) => boolean
  confirm: (record: QueueRecord, delivered: boolean) => void
  owedTurn: (sessionId: SessionId) => QueueRecord[]
  finished: (listener: (record: QueueRecord) => void) => void
}

const KEPT_QUEUES = 200

const OWED_QUEUES = 1000

const QUEUE_RESULT_CHARS = RESULT_CAP_CHARS - 5000

function playedOutcome(index: number, tool: string, outcome: PageOutcome): Settled {
  if (outcome.ok) return {outcome: {index, tool, ok: true, result: outcome.result}, landed: 'played'}
  const raised = outcome.error.raised
  const error = raised?.message ?? outcome.error.message
  return {outcome: {index, tool, ok: false, error}, landed: unplayedAs(raised?.code)}
}

function unplayedAs(code: string | undefined): Landed {
  if (code === PAGE_QUEUE_STOPPED) return 'stopped'
  if (code === PAGE_QUEUE_REFUSED) return 'lost'
  return 'played'
}

function unconfirmedOutcome(index: number, tool: string, error: unknown): Settled {
  if (isPageFailure(error) && error.error.code === 'no-widget') {
    return {
      outcome: {index, tool, ok: false, error: `the page reloaded or closed during ${tool}; it may already have run`},
      landed: 'lost',
    }
  }
  if (isPageFailure(error) && error.error.code === 'timeout') {
    return {
      outcome: {index, tool, ok: false, error: `the page did not confirm ${tool} in time; it may already have run`},
      landed: 'lost',
    }
  }
  const message = isPageFailure(error) ? error.error.message : String(error)
  return {outcome: {index, tool, ok: false, error: message}, landed: 'played'}
}

function resultOf(record: QueueRecord): PageQueueResult {
  const settled = record.settled.flatMap((entry) => (entry === undefined ? [] : [entry]))
  const ran = settled.filter((entry) => entry.landed === 'played')
  const status = settled.some((entry) => entry.landed === 'lost')
    ? 'lost'
    : settled.some((entry) => entry.landed === 'stopped')
      ? 'stopped'
      : 'finished'
  return fitted({
    queueId: record.queueId,
    status,
    outcomes: settled.map((entry) => entry.outcome),
    failed: ran.filter((entry) => !entry.outcome.ok).length,
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
  if (!outcome.ok) return outcome.error.length <= share ? outcome : {...outcome, error: headOf(outcome.error, share)}
  const body = JSON.stringify(outcome.result)
  if (body.length <= share) return outcome
  return {...outcome, result: {truncated: true, length: body.length, head: headOf(body, share)}}
}

function headOf(text: string, length: number): string {
  return Array.from(text).slice(0, length).join('')
}

function stringField(record: Record<string, unknown>, key: 'ref' | 'selector'): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

export function makePageQueues(deps: {bus: PageBus; journal: Journal; syncMs?: number}): PageQueues {
  const records = new Map<string, QueueRecord>()
  const listeners: Array<(record: QueueRecord) => void> = []

  const journaled = async (record: QueueRecord, index: number, action: Record<string, unknown>): Promise<void> => {
    const {tool: verb, ref: _ref, selector: _selector, ...args} = action
    await deps.journal
      .append(
        record.sessionId,
        {verb: String(verb), ref: stringField(action, 'ref'), selector: stringField(action, 'selector'), args},
        Date.now(),
      )
      .catch((error: unknown) =>
        logError(`[core] journaling queued action ${index} of ${record.queueId} failed: ${String(error)}`),
      )
  }

  const announce = (record: QueueRecord): void => {
    if (record.delivery !== 'owed') return
    for (const listener of listeners) {
      try {
        listener(record)
      } catch (error) {
        logError(`[core] delivering queue ${record.queueId} failed: ${String(error)}`)
      }
    }
  }

  const keep = (record: QueueRecord): void => {
    records.set(record.queueId, record)
    const delivered = [...records.values()].filter((each) => each.result !== null && each.delivery === 'delivered')
    for (const old of delivered.slice(0, Math.max(0, delivered.length - KEPT_QUEUES))) records.delete(old.queueId)
  }

  async function start(sessionId: SessionId, given: QueueStart): Promise<{queueId: string; actions: number}> {
    const {actions} = PageQueueActionsSchema.parse(given.input)
    if ([...records.values()].filter((each) => each.delivery !== 'delivered').length >= OWED_QUEUES) {
      throw new Error(`${OWED_QUEUES} queue results are still undelivered; collect them before queueing more`)
    }
    const queueId = `q_${randomUUID()}`
    const playing = deps.bus.playQueue(
      sessionId,
      {agentId: given.agentId, name: PAGE_QUEUE_TOOL, input: given.input, mutating: true},
      queueId,
      actions.length,
    )
    const settledAll = Promise.withResolvers<PageQueueResult>()
    const record: QueueRecord = {
      queueId,
      sessionId,
      outside: given.outside,
      toolCallId: given.toolCallId,
      tools: actions.map((action) => action.tool),
      settled: actions.map(() => undefined),
      result: null,
      delivery: 'owed',
      done: settledAll.promise,
    }
    const landed = playing.played.map((reply, index) => {
      const tool = actions[index]?.tool ?? ''
      return reply.then(
        async (outcome) => {
          record.settled[index] = playedOutcome(index, tool, outcome)
          const action = actions[index]
          if (outcome.ok && action !== undefined) await journaled(record, index, action)
        },
        (error: unknown) => {
          record.settled[index] = unconfirmedOutcome(index, tool, error)
        },
      )
    })
    keep(record)
    void Promise.all(landed).then(async () => {
      record.result = resultOf(record)
      settledAll.resolve(record.result)
      await setImmediate()
      announce(record)
    })
    return {queueId, actions: actions.length}
  }

  async function wait(
    sessionId: SessionId,
    queueId: string,
    waitMs: number,
    signal?: AbortSignal,
  ): Promise<PageQueueResult | PageQueueProgress> {
    const record = records.get(queueId)
    if (record === undefined || record.sessionId !== sessionId) {
      throw new Error(`no queue ${queueId} on this tab`)
    }
    if (record.result === null && waitMs > 0) {
      await pTimeout(record.done, {milliseconds: waitMs, fallback: () => null, signal})
    }
    signal?.throwIfAborted()
    if (record.result !== null) {
      record.delivery = 'delivered'
      return record.result
    }
    return {
      queueId,
      status: 'playing',
      done: record.settled.filter((entry) => entry !== undefined).length,
      of: record.tools.length,
    }
  }

  async function play(
    sessionId: SessionId,
    given: QueueStart,
    signal?: AbortSignal,
  ): Promise<PageQueueResult | PageQueueProgress> {
    const {queueId} = await start(sessionId, given)
    return wait(sessionId, queueId, deps.syncMs ?? PAGE_QUEUE_SYNC_MS, signal)
  }

  function undelivered(sessionId: SessionId, outside: boolean): PageQueueResult[] {
    return [...records.values()].flatMap((record) => {
      if (record.sessionId !== sessionId || record.outside !== outside || record.result === null) return []
      return deliver(record) ? [record.result] : []
    })
  }

  function startedBy(sessionId: SessionId, toolCallIds: ReadonlySet<string>): PageQueueHandle[] {
    return [...records.values()].flatMap((record) =>
      record.sessionId === sessionId &&
      record.result === null &&
      record.toolCallId !== undefined &&
      toolCallIds.has(record.toolCallId)
        ? [{queueId: record.queueId, actions: record.tools.length}]
        : [],
    )
  }

  function deliver(record: QueueRecord): boolean {
    if (record.delivery !== 'owed' || record.result === null) return false
    record.delivery = 'delivered'
    return true
  }

  function claim(record: QueueRecord): boolean {
    if (record.delivery !== 'owed' || record.result === null) return false
    record.delivery = 'claimed'
    return true
  }

  function confirm(record: QueueRecord, delivered: boolean): void {
    if (record.delivery !== 'claimed') return
    record.delivery = delivered ? 'delivered' : 'owed'
  }

  function owedTurn(sessionId: SessionId): QueueRecord[] {
    return [...records.values()].filter(
      (record) =>
        record.sessionId === sessionId && !record.outside && record.delivery === 'owed' && record.result !== null,
    )
  }

  return {
    start,
    play,
    wait,
    undelivered,
    startedBy,
    claim,
    confirm,
    owedTurn,
    finished: (listener) => void listeners.push(listener),
  }
}

export async function startQueueFollowUp(
  queues: PageQueues,
  plane: {
    live: (sessionId: SessionId) => Promise<boolean>
    followUp: (sessionId: SessionId, input: string) => Promise<boolean>
  },
  sessionId: SessionId,
): Promise<void> {
  if (queues.owedTurn(sessionId).length === 0 || (await plane.live(sessionId))) return
  const owed = queues.owedTurn(sessionId).filter((record) => queues.claim(record))
  const results = owed.flatMap((record) => (record.result === null ? [] : [record.result]))
  if (results.length === 0) return
  const started = await plane.followUp(sessionId, results.map(queueNotice).join('\n\n')).catch((error: unknown) => {
    logError(`[core] the page queue follow-up turn for ${sessionId} failed to start: ${String(error)}`)
    return false
  })
  for (const record of owed) queues.confirm(record, started)
}

export function pageQueueChunks(options: {result: PageQueueResult; record: QueueRecord; live: boolean}): ChatEvent[] {
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
