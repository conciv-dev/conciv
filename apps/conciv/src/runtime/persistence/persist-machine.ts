export type PersistStoreState =
  | {
      readonly status: 'hydrating'
      readonly edit: {readonly baseline: string; readonly remote: string | undefined} | undefined
    }
  | {readonly status: 'clean'; readonly last: string | undefined; readonly writing: PersistSave | undefined}
  | {
      readonly status: 'dirty'
      readonly last: string | undefined
      readonly remote: string | undefined
      readonly baseline: string | undefined
      readonly writing: PersistSave | undefined
    }
  | {readonly status: 'disposed'}

export type PersistStoreEvent =
  | {readonly type: 'init.resolved'; readonly raw: string | null}
  | {readonly type: 'init.failed'}
  | {readonly type: 'edited'; readonly baseline: string | undefined}
  | {readonly type: 'remote.received'; readonly raw: string}
  | {readonly type: 'flushed'; readonly serialized: string}
  | {readonly type: 'write.settled'; readonly save: PersistSave}
  | {readonly type: 'write.failed'; readonly save: PersistSave}
  | {readonly type: 'left'}
  | {readonly type: 'disposed'; readonly serialized: string | undefined}

export type PersistSave = {readonly type: 'save'; readonly serialized: string; readonly fallback: string | undefined}

export type PersistStoreEffect =
  | {readonly type: 'hydrate'; readonly raw: string}
  | {readonly type: 'schedule-save'}
  | PersistSave

export type PersistStoreTransition = {
  readonly state: PersistStoreState
  readonly effects: readonly PersistStoreEffect[]
}

const EMPTY_EFFECTS: readonly PersistStoreEffect[] = Object.freeze([])

const SCHEDULE: readonly PersistStoreEffect[] = Object.freeze([{type: 'schedule-save'}])

const HYDRATING: PersistStoreState = Object.freeze({status: 'hydrating', edit: undefined})

const DISPOSED: PersistStoreState = Object.freeze({status: 'disposed'})

export function createPersistStoreState(init: {readonly async: true} | {readonly raw: string | null}) {
  if ('async' in init) return {state: HYDRATING, effects: EMPTY_EFFECTS}

  return loaded(init.raw)
}

export function transitionPersistStore(state: PersistStoreState, event: PersistStoreEvent): PersistStoreTransition {
  const same = {state, effects: EMPTY_EFFECTS}

  if (state.status === 'disposed') return same

  if (event.type === 'disposed') return dispose(state, event.serialized)

  if (state.status === 'hydrating') {
    const edit = state.edit

    if (event.type === 'init.resolved') {
      if (!edit) return loaded(event.raw)

      return dirty(event.raw || undefined, edit.remote, edit.baseline)
    }

    if (event.type === 'init.failed') return edit ? dirty(undefined, edit.remote, edit.baseline) : loaded(null)

    if (event.type === 'edited') {
      if (edit) return same

      return {
        state: {status: 'hydrating', edit: {baseline: event.baseline ?? '', remote: undefined}},
        effects: SCHEDULE,
      }
    }

    if (event.type === 'remote.received') {
      if (!edit) return {state: clean(event.raw, undefined), effects: [{type: 'hydrate', raw: event.raw}]}

      if (edit.remote === event.raw) return same

      return {state: {status: 'hydrating', edit: {...edit, remote: event.raw}}, effects: EMPTY_EFFECTS}
    }

    if (event.type === 'flushed' && edit) {
      if (event.serialized === edit.baseline && edit.remote === undefined)
        return {state: HYDRATING, effects: EMPTY_EFFECTS}

      return settle(edit.baseline, undefined, edit.remote, undefined, event.serialized)
    }

    return same
  }

  if (event.type === 'init.resolved' || event.type === 'init.failed') return same

  if (event.type === 'write.settled' || event.type === 'write.failed' || event.type === 'left') {
    return transitionWriting(state, event)
  }

  if (state.status === 'clean') {
    if (event.type === 'edited') {
      return {state: dirty(state.last, undefined, undefined, state.writing).state, effects: SCHEDULE}
    }

    if (event.type === 'remote.received' && event.raw !== state.last) {
      return {state: clean(event.raw, undefined), effects: [{type: 'hydrate', raw: event.raw}]}
    }

    return same
  }

  if (event.type === 'remote.received') {
    if (state.remote === event.raw) return same

    return {state: {...state, remote: event.raw}, effects: EMPTY_EFFECTS}
  }

  if (event.type === 'flushed') {
    return settle(state.baseline, state.last, state.remote, state.writing, event.serialized)
  }

  return same
}

type LivePersistStoreState = Extract<PersistStoreState, {status: 'clean' | 'dirty'}>

type WritingEvent = Extract<PersistStoreEvent, {type: 'write.settled' | 'write.failed' | 'left'}>

function transitionWriting(state: LivePersistStoreState, event: WritingEvent): PersistStoreTransition {
  const same = {state, effects: EMPTY_EFFECTS}

  if (event.type === 'left') {
    if (!state.writing) return same
    const redo: PersistSave = {...state.writing}

    return {state: {...state, writing: redo}, effects: [redo]}
  }

  const writing = state.writing === event.save ? undefined : state.writing
  const rolledBack =
    event.type === 'write.failed' && state.last === event.save.serialized && state.last !== event.save.fallback

  if (!rolledBack && writing === state.writing) return same

  return {state: {...state, last: rolledBack ? event.save.fallback : state.last, writing}, effects: EMPTY_EFFECTS}
}

export function isPersistReady(state: PersistStoreState) {
  return state.status === 'clean' || state.status === 'dirty'
}

export function needsPersistFlush(state: PersistStoreState) {
  return state.status === 'dirty' || (state.status === 'hydrating' && state.edit !== undefined)
}

export function holdsUnsavedWork(state: PersistStoreState) {
  return (
    needsPersistFlush(state) || ((state.status === 'clean' || state.status === 'dirty') && state.writing !== undefined)
  )
}

export function canWriteBackHydration(state: PersistStoreState) {
  return state.status === 'hydrating'
}

function clean(last: string | undefined, writing: PersistSave | undefined): PersistStoreState {
  return {status: 'clean', last, writing}
}

function loaded(raw: string | null): PersistStoreTransition {
  if (!raw) return {state: clean(undefined, undefined), effects: EMPTY_EFFECTS}

  return {state: clean(raw, undefined), effects: [{type: 'hydrate', raw}]}
}

function dirty(
  last: string | undefined,
  remote: string | undefined,
  baseline: string | undefined,
  writing: PersistSave | undefined = undefined,
) {
  return {
    state: {status: 'dirty', last, remote, baseline, writing} satisfies PersistStoreState,
    effects: EMPTY_EFFECTS,
  }
}

function settle(
  baseline: string | undefined,
  last: string | undefined,
  remote: string | undefined,
  writing: PersistSave | undefined,
  serialized: string,
): PersistStoreTransition {
  if (serialized === baseline || serialized === last) {
    const adopted = remote ?? last
    const kept = clean(adopted, adopted === last ? writing : undefined)

    if (adopted === undefined || adopted === serialized) return {state: kept, effects: EMPTY_EFFECTS}

    return {state: kept, effects: [{type: 'hydrate', raw: adopted}]}
  }

  const save: PersistSave = {type: 'save', serialized, fallback: last}

  return {state: clean(serialized, save), effects: [save]}
}

function dispose(state: Exclude<PersistStoreState, {status: 'disposed'}>, serialized: string | undefined) {
  if (serialized === undefined || !needsPersistFlush(state)) return {state: DISPOSED, effects: EMPTY_EFFECTS}

  const flushed = transitionPersistStore(state, {type: 'flushed', serialized})

  return {state: DISPOSED, effects: flushed.effects.filter((effect) => effect.type === 'save')}
}
