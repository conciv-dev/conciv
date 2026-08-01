export type ThreadMeasurement = {scrollTop: number; scrollHeight: number; clientHeight: number}

export type FollowMode =
  | {kind: 'following'}
  | {kind: 'seeking'; behavior: ScrollBehavior}
  | {kind: 'dragging'}
  | {kind: 'detached'}

export type ThreadHold = {top: number; startedAt: number; durationMs: number}

export type ThreadFollowState = {
  mode: FollowMode
  hold: ThreadHold | null
  atBottom: boolean
  scrolled: {top: number; height: number}
  resized: {height: number; clientHeight: number}
}

export type ThreadFollowEvent =
  | {type: 'scrolled'; at: ThreadMeasurement}
  | {type: 'resized'; at: ThreadMeasurement; autoScroll: boolean; topAnchored: boolean}
  | {type: 'requestBottom'; behavior: ScrollBehavior}
  | {type: 'hold'; at: ThreadMeasurement; startedAt: number; durationMs: number}
  | {type: 'release'}
  | {type: 'pointerDown'}
  | {type: 'wheelUp'}
  | {type: 'scrollKeyDown'}
  | {type: 'scrollKeySettled'; at: ThreadMeasurement}
  | {type: 'touchMove'}
  | {type: 'touchEnd'; at: ThreadMeasurement}

export type ThreadFollowPlan = {pin: ScrollBehavior | null; restore: number | null; rescan: boolean}

export function followingThread(): ThreadFollowState {
  return {
    mode: {kind: 'following'},
    hold: null,
    atBottom: true,
    scrolled: {top: 0, height: 0},
    resized: {height: 0, clientHeight: 0},
  }
}

export function isAtBottomNow(at: ThreadMeasurement): boolean {
  const withinTolerance = Math.abs(at.scrollHeight - at.scrollTop - at.clientHeight) <= 1
  return withinTolerance || at.scrollHeight <= at.clientHeight
}

function seeking(state: ThreadFollowState): ScrollBehavior | null {
  if (state.mode.kind === 'seeking') return state.mode.behavior
  return null
}

function detached(state: ThreadFollowState): boolean {
  return state.mode.kind === 'detached' || state.mode.kind === 'dragging'
}

function withMode(state: ThreadFollowState, mode: FollowMode): ThreadFollowState {
  return {...state, mode}
}

function abandonSeek(state: ThreadFollowState): ThreadFollowState {
  if (state.mode.kind !== 'seeking') return state
  return withMode(state, {kind: 'following'})
}

function published(state: ThreadFollowState, nowAtBottom: boolean): ThreadFollowState {
  const released = nowAtBottom && detached(state) ? withMode(state, {kind: 'following'}) : state
  if (released.atBottom === nowAtBottom) return released
  return {...released, atBottom: nowAtBottom}
}

function noted(state: ThreadFollowState, at: ThreadMeasurement): ThreadFollowState {
  return {...state, scrolled: {top: at.scrollTop, height: at.scrollHeight}}
}

function recomputed(state: ThreadFollowState, at: ThreadMeasurement): ThreadFollowState {
  return noted(published(state, isAtBottomNow(at)), at)
}

function glidingDown(state: ThreadFollowState, at: ThreadMeasurement, nowAtBottom: boolean): boolean {
  return state.mode.kind !== 'dragging' && !nowAtBottom && state.scrolled.top < at.scrollTop
}

function draggedUp(state: ThreadFollowState, at: ThreadMeasurement): boolean {
  return state.scrolled.top > at.scrollTop && state.scrolled.height === at.scrollHeight
}

function seekResolved(state: ThreadFollowState, at: ThreadMeasurement, nowAtBottom: boolean): ThreadFollowState {
  if (nowAtBottom) {
    if (at.scrollHeight > at.clientHeight + 1) return abandonSeek(state)
    return state
  }
  if (draggedUp(state, at)) return abandonSeek(state)
  return state
}

function settled(state: ThreadFollowState, nowAtBottom: boolean): ThreadFollowState {
  if (!nowAtBottom && state.mode.kind === 'seeking') return state
  return published(state, nowAtBottom)
}

function onScrolled(state: ThreadFollowState, at: ThreadMeasurement): ThreadFollowState {
  if (state.hold) return recomputed(state, at)
  const nowAtBottom = isAtBottomNow(at)
  if (glidingDown(state, at, nowAtBottom)) return noted(state, at)
  return noted(settled(seekResolved(state, at, nowAtBottom), nowAtBottom), at)
}

function chased(state: ThreadFollowState, autoScroll: boolean, topAnchored: boolean): ThreadFollowState {
  const behavior = seeking(state)
  if (behavior !== null && topAnchored) return withMode(state, {kind: 'following'})
  if (behavior !== null) return state
  if (autoScroll && state.atBottom && !detached(state)) return withMode(state, {kind: 'seeking', behavior: 'instant'})
  return state
}

function onResized(
  state: ThreadFollowState,
  at: ThreadMeasurement,
  autoScroll: boolean,
  topAnchored: boolean,
): ThreadFollowState {
  if (at.scrollHeight === state.resized.height && at.clientHeight === state.resized.clientHeight) return state
  const measured = {...state, resized: {height: at.scrollHeight, clientHeight: at.clientHeight}}
  if (measured.hold) return recomputed(measured, at)
  return chased(measured, autoScroll, topAnchored)
}

function onTouchEnd(state: ThreadFollowState, at: ThreadMeasurement): ThreadFollowState {
  const next = recomputed(state, at)
  if (next.mode.kind !== 'dragging') return next
  return withMode(next, {kind: 'detached'})
}

function onDetach(state: ThreadFollowState): ThreadFollowState {
  if (state.mode.kind === 'dragging') return state
  return withMode(state, {kind: 'detached'})
}

function onHold(state: ThreadFollowState, at: ThreadMeasurement, startedAt: number, durationMs: number) {
  return {...abandonSeek(state), hold: {top: at.scrollTop, startedAt, durationMs}}
}

export function followTransition(state: ThreadFollowState, event: ThreadFollowEvent): ThreadFollowState {
  if (event.type === 'scrolled') return onScrolled(state, event.at)
  if (event.type === 'resized') return onResized(state, event.at, event.autoScroll, event.topAnchored)
  if (event.type === 'requestBottom') return withMode(state, {kind: 'seeking', behavior: event.behavior})
  if (event.type === 'hold') return onHold(state, event.at, event.startedAt, event.durationMs)
  if (event.type === 'release') return {...state, hold: null}
  if (event.type === 'pointerDown') return abandonSeek(state)
  if (event.type === 'wheelUp' || event.type === 'scrollKeyDown') return onDetach(state)
  if (event.type === 'scrollKeySettled') return recomputed(state, event.at)
  if (event.type === 'touchMove') return withMode(state, {kind: 'dragging'})
  return onTouchEnd(state, event.at)
}

function rescanAfter(after: ThreadFollowState, before: ThreadFollowState, event: ThreadFollowEvent): boolean {
  if (event.type !== 'resized') return false
  return after !== before && after.hold === null
}

function pinAfter(after: ThreadFollowState, rescan: boolean, event: ThreadFollowEvent): ScrollBehavior | null {
  if (event.type === 'requestBottom') return event.behavior
  if (!rescan) return null
  return seeking(after)
}

export function followPlanFor(
  before: ThreadFollowState,
  after: ThreadFollowState,
  event: ThreadFollowEvent,
): ThreadFollowPlan {
  const rescan = rescanAfter(after, before, event)
  return {
    pin: pinAfter(after, rescan, event),
    restore: event.type === 'scrolled' && after.hold ? after.hold.top : null,
    rescan,
  }
}
