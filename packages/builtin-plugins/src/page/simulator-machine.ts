export type SimulatorQueue = {readonly queueId: string; readonly stopped: boolean}

export type SimulatorState = {
  readonly status: 'detached' | 'idle' | 'shown' | 'hiding'
  readonly taskSession: string | null
  readonly queues: readonly SimulatorQueue[]
  readonly armed: boolean
}

export type SimulatorEvent =
  | {readonly type: 'attached'}
  | {readonly type: 'detached'}
  | {readonly type: 'task.started'; readonly agent: string; readonly session: string | null}
  | {readonly type: 'task.touched'}
  | {readonly type: 'task.ended'}
  | {readonly type: 'run.ended'; readonly sessionId: string}
  | {readonly type: 'queue.accepted'; readonly queueId: string}
  | {readonly type: 'queue.finished'; readonly queueId: string; readonly running: boolean}
  | {readonly type: 'mask.clicked'}
  | {readonly type: 'confirm.expired'}
  | {readonly type: 'hide.done'}

export type SimulatorEffect =
  | {readonly type: 'show'; readonly agent: string}
  | {readonly type: 'aim'; readonly agent: string}
  | {readonly type: 'hide'}
  | {readonly type: 'unmount-run'}
  | {readonly type: 'arm-confirm'}
  | {readonly type: 'disarm'}
  | {readonly type: 'start-timeout'}
  | {readonly type: 'cancel-timeout'}
  | {readonly type: 'stop-session'; readonly sessionId: string}
  | {readonly type: 'release-queue'; readonly queueId: string}

export type SimulatorTransition = {readonly state: SimulatorState; readonly effects: readonly SimulatorEffect[]}

export const initialSimulatorState: SimulatorState = {status: 'detached', taskSession: null, queues: [], armed: false}

function stay(state: SimulatorState): SimulatorTransition {
  return {state, effects: []}
}

function end(state: SimulatorState): SimulatorTransition {
  if (state.status !== 'shown') return {state, effects: [{type: 'cancel-timeout'}]}
  const disarm: SimulatorEffect[] = state.armed ? [{type: 'disarm'}] : []
  return {
    state: {...state, status: 'hiding', armed: false},
    effects: [{type: 'cancel-timeout'}, ...disarm, {type: 'hide'}],
  }
}

function startTask(state: SimulatorState, agent: string, session: string | null): SimulatorTransition {
  const started = {...state, taskSession: session}
  if (state.status === 'detached') return stay(started)
  if (state.status === 'shown') return {state: started, effects: [{type: 'aim', agent}]}
  return {state: {...started, status: 'shown'}, effects: [{type: 'show', agent}]}
}

function acceptQueue(state: SimulatorState, queueId: string): SimulatorTransition {
  if (state.queues.some((queue) => queue.queueId === queueId)) return stay(state)
  return stay({...state, queues: [...state.queues, {queueId, stopped: false}]})
}

function finishQueue(state: SimulatorState, queueId: string, running: boolean): SimulatorTransition {
  if (!state.queues.some((queue) => queue.queueId === queueId)) return stay(state)
  const left = {...state, queues: state.queues.filter((queue) => queue.queueId !== queueId)}
  const release: SimulatorEffect = {type: 'release-queue', queueId}
  if (left.queues.length > 0 || running) return {state: left, effects: [release]}
  const ended = end(left)
  return {state: ended.state, effects: [release, ...ended.effects]}
}

function clickMask(state: SimulatorState): SimulatorTransition {
  if (!state.armed) return {state: {...state, armed: true}, effects: [{type: 'arm-confirm'}]}
  const stopped = {...state, armed: false, queues: state.queues.map((queue) => ({...queue, stopped: true}))}
  const disarm: SimulatorEffect = {type: 'disarm'}
  if (state.taskSession === null) return {state: stopped, effects: [disarm]}
  const ended = end(stopped)
  return {
    state: ended.state,
    effects: [disarm, {type: 'stop-session', sessionId: state.taskSession}, ...ended.effects],
  }
}

function detach(state: SimulatorState): SimulatorTransition {
  return {
    state: initialSimulatorState,
    effects: [
      {type: 'cancel-timeout'},
      {type: 'disarm'},
      {type: 'unmount-run'},
      ...state.queues.map((queue): SimulatorEffect => ({type: 'release-queue', queueId: queue.queueId})),
    ],
  }
}

export function transitionSimulator(state: SimulatorState, event: SimulatorEvent): SimulatorTransition {
  switch (event.type) {
    case 'attached':
      return stay(state.status === 'detached' ? {...state, status: 'idle'} : state)
    case 'detached':
      return detach(state)
    case 'task.started':
      return startTask(state, event.agent, event.session)
    case 'task.touched':
      return {state, effects: [{type: state.status === 'shown' ? 'start-timeout' : 'cancel-timeout'}]}
    case 'task.ended':
      return end(state)
    case 'run.ended':
      if (state.taskSession !== event.sessionId || state.queues.length > 0) return stay(state)
      return end(state)
    case 'queue.accepted':
      return acceptQueue(state, event.queueId)
    case 'queue.finished':
      return finishQueue(state, event.queueId, event.running)
    case 'mask.clicked':
      return clickMask(state)
    case 'confirm.expired':
      return state.armed ? {state: {...state, armed: false}, effects: [{type: 'disarm'}]} : stay(state)
    case 'hide.done':
      if (state.status !== 'hiding') return stay(state)
      return {state: {...state, status: 'idle'}, effects: [{type: 'unmount-run'}]}
  }
}

export function isQueueStopped(state: SimulatorState, queueId: string): boolean {
  return state.queues.find((queue) => queue.queueId === queueId)?.stopped ?? true
}
