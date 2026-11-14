import {delay} from 'es-toolkit'
import {z} from 'zod'
import type {SessionId} from '@conciv/protocol/chat-types'
import {
  PAGE_QUEUE_REFUSED,
  PAGE_QUEUE_STOPPED,
  PAGE_QUEUE_SYNC_MS,
  type PageQueueHandle,
  type PageQueueOutcome,
  type PageQueueProgress,
  type PageQueueResult,
} from '@conciv/protocol/page-types'
import type {PageChangeEntry} from '@conciv/protocol/page-types'
import type {RequestSettlement} from './machine.js'
import {Action} from './rpc.js'

type Landed = 'played' | 'stopped' | 'lost'

type Settled = {outcome: PageQueueOutcome; landed: Landed}

export type Delivery = 'owed' | 'claimed' | 'nextReply' | 'delivered'

export type QueueRecord = {
  queueId: string
  sessionId: SessionId
  toolCallId: string
  tools: string[]
  settled: (Settled | undefined)[]
  result: PageQueueResult | null
  delivery: Delivery
  done: Promise<PageQueueResult>
}

type Queueing = Extract<Action, {readonly type: 'queue' | 'queue_async'}>

export type QueueStart = {agentId: string; action: Queueing; toolCallId: string}

type Play = (
  sessionId: SessionId,
  play: {action: Action; agentId: string; queueId: string; actions: readonly Action[]},
) => Promise<RequestSettlement>[]

type Origin = {readonly toolCallIds?: readonly string[]; readonly excludeToolCallIds?: readonly string[]}

const KEPT_QUEUES = 200

const OWED_QUEUES = 1000

const QUEUE_RESULT_CHARS = 45_000

const Raised = z.object({code: z.string(), message: z.string()})

const Unconfirmed = z.string().regex(/^\[page\.(timeout|disconnected|tab_unavailable)\]/)

const Values = z.record(z.string(), z.unknown())

function playedOutcome(index: number, tool: string, settlement: RequestSettlement): Settled {
  if (settlement.ok) {
    const value = settlement.result.value
    const parsed = Values.safeParse(value)
    return {outcome: {index, tool, ok: true, result: parsed.success ? parsed.data : {value}}, landed: 'played'}
  }
  const raised = Raised.safeParse(settlement.error.error)
  const error = raised.success ? raised.data.message || settlement.error.message : settlement.error.message
  if (raised.success) return {outcome: {index, tool, ok: false, error}, landed: unplayedAs(raised.data.code)}
  const lost = settlement.tabClosed === true || Unconfirmed.safeParse(error).success
  return {outcome: {index, tool, ok: false, error}, landed: lost ? 'lost' : 'played'}
}

function unplayedAs(code: string): Landed {
  if (code === PAGE_QUEUE_STOPPED) return 'stopped'
  if (code === PAGE_QUEUE_REFUSED) return 'lost'
  return 'played'
}

function buildResult(record: QueueRecord): PageQueueResult {
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
  if (!outcome.ok) return outcome.error.length <= share ? outcome : {...outcome, error: takeHead(outcome.error, share)}
  const body = JSON.stringify(outcome.result)
  if (body.length <= share) return outcome
  return {...outcome, result: {truncated: true, length: body.length, head: takeHead(body, share)}}
}

function takeHead(text: string, length: number): string {
  return Array.from(text).slice(0, length).join('')
}

function awaitsDelivery(record: QueueRecord): boolean {
  return (record.delivery === 'owed' || record.delivery === 'nextReply') && record.result !== null
}

function fromOrigin(record: QueueRecord, origin: Origin): boolean {
  if (origin.toolCallIds !== undefined && !origin.toolCallIds.includes(record.toolCallId)) return false
  return origin.excludeToolCallIds?.includes(record.toolCallId) !== true
}

function toAction(queued: {tool: string}): Action {
  const {tool, ...input} = queued
  return Action.parse({...input, type: tool.replace(/^page_/, '')})
}

export function fromPlay(deps: {
  play: Play
  journal: (sessionId: SessionId, change: Omit<PageChangeEntry, 'seq'>) => Promise<void>
  finished: (record: QueueRecord) => void
  syncMs?: number
}) {
  const records = new Map<string, QueueRecord>()

  const journaled = async (record: QueueRecord, index: number, queued: {tool: string}): Promise<void> => {
    const {tool, ref, selector, ...args} = z
      .looseObject({tool: z.string(), ref: z.string().optional(), selector: z.string().optional()})
      .parse(queued)
    await deps
      .journal(record.sessionId, {
        ts: Date.now(),
        verb: tool,
        ...(ref === undefined ? {} : {ref}),
        ...(selector === undefined ? {} : {selector}),
        args,
      })
      .catch((error: unknown) => console.warn(`Journaling queued action ${index} of ${record.queueId} failed`, error))
  }

  const announce = (record: QueueRecord): void => {
    if (record.delivery !== 'owed') return
    try {
      deps.finished(record)
    } catch (error) {
      console.warn(`Delivering queue ${record.queueId} failed`, error)
    }
  }

  const keep = (record: QueueRecord): void => {
    records.set(record.queueId, record)
    const delivered = [...records.values()].filter((each) => each.result !== null && each.delivery === 'delivered')
    for (const old of delivered.slice(0, Math.max(0, delivered.length - KEPT_QUEUES))) records.delete(old.queueId)
  }

  function start(sessionId: SessionId, given: QueueStart): PageQueueHandle {
    const actions = given.action.actions
    if ([...records.values()].filter((each) => each.delivery !== 'delivered').length >= OWED_QUEUES) {
      throw new Error(`${OWED_QUEUES} queue results are still undelivered; collect them before queueing more`)
    }
    const queueId = `q_${crypto.randomUUID()}`
    const played = deps.play(sessionId, {
      action: Action.parse({...given.action, type: 'queue'}),
      agentId: given.agentId,
      queueId,
      actions: actions.map(toAction),
    })
    const settledAll = Promise.withResolvers<PageQueueResult>()
    const record: QueueRecord = {
      queueId,
      sessionId,
      toolCallId: given.toolCallId,
      tools: actions.map((action) => action.tool),
      settled: actions.map(() => undefined),
      result: null,
      delivery: 'owed',
      done: settledAll.promise,
    }
    const landed = played.map(async (reply, index) => {
      const queued = actions[index]
      const settlement = await reply
      record.settled[index] = playedOutcome(index, queued?.tool ?? '', settlement)
      if (settlement.ok && queued !== undefined) await journaled(record, index, queued)
    })
    keep(record)
    void Promise.all(landed).then(async () => {
      record.result = buildResult(record)
      settledAll.resolve(record.result)
      await delay(0)
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
      await Promise.race([record.done, delay(waitMs, signal === undefined ? {} : {signal})]).catch(() => undefined)
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
    const {queueId} = start(sessionId, given)
    return wait(sessionId, queueId, deps.syncMs ?? PAGE_QUEUE_SYNC_MS, signal)
  }

  function undelivered(sessionId: SessionId, origin: Origin): PageQueueResult[] {
    return [...records.values()].flatMap((record) => {
      if (record.sessionId !== sessionId || !fromOrigin(record, origin) || record.result === null) return []
      return deliver(record) ? [record.result] : []
    })
  }

  function startedBy(sessionId: SessionId, toolCallIds: readonly string[]): PageQueueHandle[] {
    return [...records.values()].flatMap((record) =>
      record.sessionId === sessionId && record.result === null && toolCallIds.includes(record.toolCallId)
        ? [{queueId: record.queueId, actions: record.tools.length}]
        : [],
    )
  }

  function deliver(record: QueueRecord): boolean {
    if (!awaitsDelivery(record)) return false
    record.delivery = 'delivered'
    return true
  }

  function owed(sessionId: SessionId, excludeToolCallIds: readonly string[], claim: boolean) {
    return [...records.values()].flatMap((record) => {
      if (record.sessionId !== sessionId || excludeToolCallIds.includes(record.toolCallId)) return []
      if (!awaitsDelivery(record) || record.result === null) return []
      const before: 'owed' | 'nextReply' = record.delivery === 'owed' ? 'owed' : 'nextReply'
      if (claim) record.delivery = 'claimed'
      return [{queueId: record.queueId, toolCallId: record.toolCallId, result: record.result, before}]
    })
  }

  function settle(sessionId: SessionId, queueIds: readonly string[], delivery: Exclude<Delivery, 'claimed'>): void {
    queueIds.forEach((queueId) => {
      const record = records.get(queueId)
      if (record === undefined || record.sessionId !== sessionId || record.delivery !== 'claimed') return
      record.delivery = delivery
    })
  }

  return {start, play, wait, undelivered, startedBy, owed, settle}
}
