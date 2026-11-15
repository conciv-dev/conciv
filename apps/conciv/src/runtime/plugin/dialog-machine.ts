export type PluginDialogState =
  | {readonly status: 'created'}
  | {readonly status: 'waiting'}
  | {readonly status: 'shown'}
  | {readonly status: 'closed'}

export type PluginDialogEvent =
  | {readonly type: 'open'; readonly aborted: boolean}
  | {readonly type: 'mounted'}
  | {readonly type: 'close'}
  | {readonly type: 'dismissed'}

export type PluginDialogEffect =
  | {readonly type: 'register'}
  | {readonly type: 'release'}
  | {readonly type: 'wait'}
  | {readonly type: 'cancel'}
  | {readonly type: 'show'}
  | {readonly type: 'abort'}
  | {readonly type: 'close'}
  | {readonly type: 'ended'}

export type PluginDialogTransition = {
  readonly state: PluginDialogState
  readonly effects: readonly PluginDialogEffect[]
}

const created: PluginDialogState = {status: 'created'}

const waiting: PluginDialogState = {status: 'waiting'}

const shown: PluginDialogState = {status: 'shown'}

const closed: PluginDialogState = {status: 'closed'}

export function createPluginDialogState() {
  return created
}

export function transitionPluginDialog(state: PluginDialogState, event: PluginDialogEvent): PluginDialogTransition {
  if (state.status === 'created') {
    if (event.type !== 'open') return step(state)

    if (event.aborted) return step(closed, [{type: 'ended'}])

    return step(waiting, [{type: 'register'}, {type: 'wait'}])
  }

  if (state.status === 'waiting') {
    if (event.type === 'mounted') return step(shown, [{type: 'show'}])

    if (event.type === 'close') return step(closed, [{type: 'cancel'}, {type: 'release'}, {type: 'ended'}])

    return step(state)
  }

  if (state.status === 'shown') {
    if (event.type === 'close')
      return step(closed, [{type: 'abort'}, {type: 'close'}, {type: 'release'}, {type: 'ended'}])

    if (event.type === 'dismissed') return step(closed, [{type: 'release'}, {type: 'ended'}])

    return step(state)
  }

  return step(state)
}

function step(state: PluginDialogState, effects: readonly PluginDialogEffect[] = []): PluginDialogTransition {
  return {state, effects}
}
