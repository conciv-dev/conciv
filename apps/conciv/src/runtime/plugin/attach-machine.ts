export const HOST_API_MAX_QUEUE = 1024

export type QueuedHostWrite<A> = {
  readonly id: number
  readonly run: (attached: A) => void

  readonly onDrop?: () => void
}

export type HostApiAttachState<A> =
  | {
      readonly status: 'detached'
      readonly attempt: number
      readonly writeId: number
      readonly queue: readonly QueuedHostWrite<A>[]
    }
  | {
      readonly status: 'draining'
      readonly attempt: number
      readonly writeId: number
      readonly attached: A
      readonly queue: readonly QueuedHostWrite<A>[]
    }
  | {readonly status: 'live'; readonly attempt: number; readonly writeId: number; readonly attached: A}
  | {readonly status: 'disposed'}

export type HostApiAttachEvent<A> =
  | {readonly type: 'attach'; readonly attached: A}
  | {readonly type: 'detach'; readonly attempt: number}
  | {readonly type: 'drain.next'; readonly attempt: number}
  | {readonly type: 'write'; readonly run: (attached: A) => void; readonly onDrop?: () => void}
  | {readonly type: 'cancel'; readonly id: number}
  | {readonly type: 'disposed'}

export type HostApiAttachEffect<A> =
  | {readonly type: 'schedule.drain'; readonly attempt: number}
  | {readonly type: 'run'; readonly attached: A; readonly run: (attached: A) => void}
  | {readonly type: 'drop'; readonly items: readonly QueuedHostWrite<A>[]}

export type HostApiAttachTransition<A> = {
  readonly state: HostApiAttachState<A>
  readonly effects: readonly HostApiAttachEffect<A>[]

  readonly queued?: number
}

export function createHostApiAttachState<A>(): HostApiAttachState<A> {
  return {status: 'detached', attempt: 0, writeId: 0, queue: []}
}

export function transitionHostApiAttach<A>(
  state: HostApiAttachState<A>,
  event: HostApiAttachEvent<A>,
): HostApiAttachTransition<A> {
  if (state.status === 'disposed') {
    if (event.type === 'write' && event.onDrop)
      return step(state, [drop([{id: 0, run: event.run, onDrop: event.onDrop}])])

    return step(state)
  }

  if (event.type === 'attach') {
    const attempt = state.attempt + 1
    const queue = state.status === 'live' ? [] : state.queue

    return step({status: 'draining', attempt, writeId: state.writeId, attached: event.attached, queue}, [
      {type: 'schedule.drain', attempt},
    ])
  }

  if (event.type === 'disposed') {
    if (state.status === 'live' || state.queue.length === 0) return step({status: 'disposed'})

    return step({status: 'disposed'}, [drop(state.queue)])
  }

  if (state.status === 'live') {
    if (event.type === 'write') return step(state, [{type: 'run', attached: state.attached, run: event.run}])

    if (event.type === 'detach' && event.attempt === state.attempt)
      return step({status: 'detached', attempt: state.attempt, writeId: state.writeId, queue: []})

    return step(state)
  }

  if (event.type === 'write') {
    const id = state.writeId + 1
    const item = {id, run: event.run, onDrop: event.onDrop}
    const overflow = state.queue.length >= HOST_API_MAX_QUEUE ? state.queue.slice(0, 1) : []
    const queue = [...state.queue.slice(overflow.length), item]

    return {
      state: {...state, writeId: id, queue},
      effects: overflow.length > 0 ? [drop(overflow)] : [],
      queued: id,
    }
  }

  if (event.type === 'cancel') {
    if (!state.queue.some((item) => item.id === event.id)) return step(state)

    return step({...state, queue: state.queue.filter((item) => item.id !== event.id)})
  }

  if (state.status === 'detached' || event.attempt !== state.attempt) return step(state)

  if (event.type === 'detach')
    return step({status: 'detached', attempt: state.attempt, writeId: state.writeId, queue: state.queue})

  const [head, ...rest] = state.queue

  if (!head) return step({status: 'live', attempt: state.attempt, writeId: state.writeId, attached: state.attached})

  return step({...state, queue: rest}, [{type: 'run', attached: state.attached, run: head.run}])
}

export function selectAttached<A>(state: HostApiAttachState<A>) {
  return state.status === 'draining' || state.status === 'live' ? state.attached : undefined
}

export function selectAttachAttempt<A>(state: HostApiAttachState<A>) {
  return state.status === 'disposed' ? 0 : state.attempt
}

export function selectDraining<A>(state: HostApiAttachState<A>, attempt: number) {
  return state.status === 'draining' && state.attempt === attempt
}

function drop<A>(items: readonly QueuedHostWrite<A>[]): HostApiAttachEffect<A> {
  return {type: 'drop', items}
}

function step<A>(
  state: HostApiAttachState<A>,
  effects: readonly HostApiAttachEffect<A>[] = [],
): HostApiAttachTransition<A> {
  return {state, effects}
}
