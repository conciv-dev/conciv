export * as RecorderFlusherMachine from './flusher-machine.js'
import {MAX_FLUSH_BYTES, jsonByteLength, type RrwebEvent} from './rpc.js'

const MAX_QUEUE_BYTES = 8 * 1024 * 1024

const MAX_POST_BYTES = 1024 * 1024

type Queued = {readonly event: RrwebEvent; readonly bytes: number}

type Backlog = {readonly queue: readonly Queued[]; readonly queueBytes: number}

export type FlusherState =
  | ({readonly status: 'waiting'; readonly attempt: number; readonly live: boolean} & Backlog)
  | ({
      readonly status: 'draining'
      readonly attempt: number
      readonly live: boolean
      readonly chunk: readonly Queued[]
    } & Backlog)
  | ({readonly status: 'closing'; readonly attempt: number; readonly chunk: readonly Queued[]} & Backlog)
  | ({readonly status: 'disposed'; readonly attempt: number} & Backlog)

export type FlusherEvent =
  | {readonly type: 'pushed'; readonly event: RrwebEvent}
  | {readonly type: 'live.changed'; readonly live: boolean}
  | {readonly type: 'drain.requested'}
  | {readonly type: 'chunk.sent'; readonly attempt: number}
  | {readonly type: 'chunk.failed'; readonly attempt: number}
  | {readonly type: 'disposed'}

export type FlusherEffect =
  | {readonly type: 'send'; readonly attempt: number; readonly events: readonly RrwebEvent[]}
  | {readonly type: 'arm'; readonly live: boolean}
  | {readonly type: 'cancel-arm'}
  | {readonly type: 'settled'}

type FlusherTransition = {readonly state: FlusherState; readonly effects: readonly FlusherEffect[]}

export const initialFlusher: FlusherState = {status: 'waiting', attempt: 0, live: false, queue: [], queueBytes: 0}

function enqueue<Held extends Backlog>(backlog: Held, event: RrwebEvent): Held | Backlog {
  const bytes = jsonByteLength(event)
  if (jsonByteLength([event]) > MAX_FLUSH_BYTES) return backlog
  const queue = [...backlog.queue, {event, bytes}]
  const queueBytes = backlog.queueBytes + bytes
  if (queueBytes <= MAX_QUEUE_BYTES) return {queue, queueBytes}
  const lastSnapshot = queue.findLastIndex((item) => item.event.type === 2)
  const droppable = lastSnapshot === -1 ? queue.length - 1 : Math.min(lastSnapshot, queue.length - 1)
  return dropOldest({queue, queueBytes}, droppable)
}

function dropOldest(backlog: Backlog, droppable: number): Backlog {
  const head = backlog.queue[0]
  if (backlog.queueBytes <= MAX_QUEUE_BYTES || droppable <= 0 || !head) return backlog
  return dropOldest({queue: backlog.queue.slice(1), queueBytes: backlog.queueBytes - head.bytes}, droppable - 1)
}

function takeChunk(backlog: Backlog): {readonly chunk: readonly Queued[]} & Backlog {
  const size = backlog.queue.reduce(
    (taken, item) =>
      taken.done || (taken.count > 0 && taken.bytes + item.bytes > MAX_POST_BYTES)
        ? {...taken, done: true}
        : {count: taken.count + 1, bytes: taken.bytes + item.bytes, done: false},
    {count: 0, bytes: 0, done: false},
  )
  return {
    chunk: backlog.queue.slice(0, size.count),
    queue: backlog.queue.slice(size.count),
    queueBytes: backlog.queueBytes - size.bytes,
  }
}

function readEvents(chunk: readonly Queued[]): readonly RrwebEvent[] {
  return chunk.map((item) => item.event)
}

function drain(backlog: Backlog, attempt: number, live: boolean): FlusherTransition {
  if (backlog.queue.length === 0)
    return {
      state: {status: 'waiting', attempt, live, queue: backlog.queue, queueBytes: backlog.queueBytes},
      effects: [{type: 'arm', live}, {type: 'settled'}],
    }
  const next = attempt + 1
  const taken = takeChunk(backlog)
  return {
    state: {status: 'draining', attempt: next, live, ...taken},
    effects: [{type: 'send', attempt: next, events: readEvents(taken.chunk)}],
  }
}

function close(backlog: Backlog, attempt: number): FlusherTransition {
  if (backlog.queue.length === 0)
    return {
      state: {status: 'disposed', attempt, queue: backlog.queue, queueBytes: backlog.queueBytes},
      effects: [{type: 'settled'}],
    }
  const next = attempt + 1
  const taken = takeChunk(backlog)
  return {
    state: {status: 'closing', attempt: next, ...taken},
    effects: [{type: 'send', attempt: next, events: readEvents(taken.chunk)}],
  }
}

function backlogWithChunk(state: Backlog & {readonly chunk: readonly Queued[]}): Backlog {
  return {
    queue: [...state.chunk, ...state.queue],
    queueBytes: state.queueBytes + state.chunk.reduce((sum, item) => sum + item.bytes, 0),
  }
}

function transitionOpen(
  state: Extract<FlusherState, {readonly status: 'waiting' | 'draining'}>,
  event: FlusherEvent,
): FlusherTransition {
  if (event.type === 'pushed') {
    const backlog = enqueue(state, event.event)
    return {state: backlog === state ? state : {...state, ...backlog}, effects: []}
  }
  if (event.type === 'live.changed')
    return {state: {...state, live: event.live}, effects: [{type: 'arm', live: event.live}]}
  if (event.type === 'drain.requested')
    return state.status === 'waiting' ? drain(state, state.attempt, state.live) : {state, effects: []}
  if (event.type === 'disposed') {
    if (state.status === 'draining')
      return {
        state: {
          status: 'closing',
          attempt: state.attempt,
          chunk: state.chunk,
          queue: state.queue,
          queueBytes: state.queueBytes,
        },
        effects: [{type: 'cancel-arm'}],
      }
    const closed = close(state, state.attempt)
    return {state: closed.state, effects: [{type: 'cancel-arm'}, ...closed.effects]}
  }
  if (state.status !== 'draining' || event.attempt !== state.attempt) return {state, effects: []}
  if (event.type === 'chunk.sent') return drain(state, state.attempt, state.live)
  return {
    state: {status: 'waiting', attempt: state.attempt, live: state.live, ...backlogWithChunk(state)},
    effects: [{type: 'arm', live: state.live}, {type: 'settled'}],
  }
}

export function transitionFlusher(state: FlusherState, event: FlusherEvent): FlusherTransition {
  if (state.status === 'waiting' || state.status === 'draining') return transitionOpen(state, event)
  if (state.status === 'disposed') return {state, effects: []}
  if ((event.type !== 'chunk.sent' && event.type !== 'chunk.failed') || event.attempt !== state.attempt)
    return {state, effects: []}
  if (event.type === 'chunk.sent') return close(state, state.attempt)
  return {
    state: {status: 'disposed', attempt: state.attempt, ...backlogWithChunk(state)},
    effects: [{type: 'settled'}],
  }
}
