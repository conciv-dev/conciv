export * as WhiteboardCommentsViewMachine from './comments-view-machine.js'

export type InboxSort = 'date' | 'unread'

export type CommentsViewState = {
  readonly openCid: string | null
  readonly inbox: {readonly open: boolean; readonly sort: InboxSort; readonly showResolved: boolean}
}

type CommentsViewEvent =
  | {readonly type: 'open'; readonly cid: string}
  | {readonly type: 'close'}
  | {readonly type: 'toggle'; readonly cid: string}
  | {readonly type: 'step'; readonly delta: number; readonly threads: readonly string[]}
  | {readonly type: 'thread-gone'; readonly cid: string}
  | {readonly type: 'inbox-open'; readonly open: boolean}
  | {readonly type: 'inbox-sort'; readonly sort: InboxSort}
  | {readonly type: 'show-resolved'; readonly showResolved: boolean}

export type CommentsViewEffect = {readonly type: 'mark-read'; readonly cid: string}

type CommentsViewTransition = {readonly state: CommentsViewState; readonly effects: readonly CommentsViewEffect[]}

export const initialCommentsView: CommentsViewState = {
  openCid: null,
  inbox: {open: false, sort: 'date', showResolved: false},
}

function open(state: CommentsViewState, cid: string): CommentsViewTransition {
  return {state: {...state, openCid: cid}, effects: [{type: 'mark-read', cid}]}
}

function close(state: CommentsViewState): CommentsViewTransition {
  return {state: {...state, openCid: null}, effects: []}
}

function step(state: CommentsViewState, delta: number, threads: readonly string[]): CommentsViewTransition {
  const index = threads.findIndex((cid) => cid === state.openCid)
  if (index < 0) return {state, effects: []}
  const target = threads[(index + delta + threads.length) % threads.length]
  return target === undefined ? {state, effects: []} : open(state, target)
}

export function transitionCommentsView(state: CommentsViewState, event: CommentsViewEvent): CommentsViewTransition {
  if (event.type === 'open') return open(state, event.cid)
  if (event.type === 'close') return close(state)
  if (event.type === 'toggle') return state.openCid === event.cid ? close(state) : open(state, event.cid)
  if (event.type === 'step') return step(state, event.delta, event.threads)
  if (event.type === 'thread-gone') return state.openCid === event.cid ? close(state) : {state, effects: []}
  if (event.type === 'inbox-open') return {state: {...state, inbox: {...state.inbox, open: event.open}}, effects: []}
  if (event.type === 'inbox-sort') return {state: {...state, inbox: {...state.inbox, sort: event.sort}}, effects: []}
  return {state: {...state, inbox: {...state.inbox, showResolved: event.showResolved}}, effects: []}
}
