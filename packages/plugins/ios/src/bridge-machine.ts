export * as IosBridgeMachine from './bridge-machine.js'
import type {ElementRect, Grab} from '@conciv/grab'
import {
  BRIDGE_MAX_VERSION,
  BRIDGE_MIN_VERSION,
  type GrabMode,
  type NativeToPageMessage,
  type NeutralGrab,
  type PageToNativeMessage,
  SUBTREE_MAX_DEPTH,
  SUBTREE_MAX_NODES,
  type ViewNode,
} from './rpc.js'

type NativeLink =
  | {readonly status: 'announcing'; readonly acked: boolean; readonly apiBase: string}
  | {readonly status: 'ready'; readonly version: number; readonly apiBase: string}

type NativeStatus =
  | {readonly status: 'idle'; readonly apiBase: string}
  | NativeLink
  | {
      readonly status: 'incompatible'
      readonly link: NativeLink
      readonly nativeMinV: number
      readonly nativeMaxV: number
    }
  | {readonly status: 'disposed'}

type PickState =
  | {readonly status: 'idle'}
  | {readonly status: 'picking'; readonly requestId: string; readonly attempt: number}

export type NativeState = {
  readonly clientId: string
  readonly link: NativeStatus
  readonly pick: PickState
  readonly attempts: number
  readonly grabbable: boolean
}

export type PanelToggle = {
  readonly open: boolean
  readonly connected: boolean
  readonly mascotRect: ElementRect | null
}

export type NativeEvent =
  | {readonly type: 'started'}
  | {readonly type: 'tick'}
  | {readonly type: 'native-parsed'; readonly message: NativeToPageMessage}
  | {readonly type: 'native-unparseable'; readonly grabRequestId: string | undefined}
  | {readonly type: 'pick-requested'; readonly mode: GrabMode}
  | {readonly type: 'cancel-requested'}
  | {readonly type: 'pick-timeout'; readonly attempt: number}
  | {readonly type: 'panel-toggled'; readonly toggle: PanelToggle}
  | {readonly type: 'disposed'}

type PickFailure = 'timed-out' | 'failed' | 'unparseable'

export type PickOutcome =
  | {readonly type: 'picked'; readonly grab: Grab}
  | {readonly type: 'cancelled'}
  | {readonly type: 'failed'; readonly failure: PickFailure; readonly requestId: string}

export type NativeSignal =
  | {readonly type: 'open'}
  | {readonly type: 'close'}
  | {readonly type: 'rebind'; readonly apiBase: string}

export type NativeEffect =
  | {readonly type: 'post'; readonly message: PageToNativeMessage}
  | {readonly type: 'schedule-tick'}
  | {readonly type: 'schedule-timeout'; readonly attempt: number}
  | {readonly type: 'settle'; readonly attempt: number; readonly outcome: PickOutcome}
  | {readonly type: 'publish'; readonly signal: NativeSignal}
  | {readonly type: 'log'; readonly message: string}

type NativeTransition = {readonly state: NativeState; readonly effects: readonly NativeEffect[]}

export function createNativeState(options: {readonly clientId: string; readonly apiBase: string}): NativeState {
  return {
    clientId: options.clientId,
    link: {status: 'idle', apiBase: options.apiBase},
    pick: {status: 'idle'},
    attempts: 0,
    grabbable: false,
  }
}

export function isAnnouncing(state: NativeState): boolean {
  const link = currentLink(state.link)
  return link !== undefined && link.status === 'announcing'
}

export function readIncompatible(state: NativeState): {nativeMinV: number; nativeMaxV: number} | null {
  if (state.link.status !== 'incompatible') return null
  return {nativeMinV: state.link.nativeMinV, nativeMaxV: state.link.nativeMaxV}
}

function currentLink(status: NativeStatus): NativeLink | undefined {
  if (status.status === 'incompatible') return status.link
  if (status.status === 'announcing' || status.status === 'ready') return status
  return undefined
}

function agreedVersion(link: NativeLink): number {
  return link.status === 'ready' ? link.version : BRIDGE_MAX_VERSION
}

function withLink(status: NativeStatus, link: NativeLink): NativeStatus {
  return status.status === 'incompatible' ? {...status, link} : link
}

function trimBase(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base
}

function formatRect(rect: ElementRect): string {
  return `(${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)})`
}

function formatViewNode(node: ViewNode, depth: number, remaining: number): {lines: string[]; remaining: number} {
  if (depth > SUBTREE_MAX_DEPTH || remaining <= 0) return {lines: [], remaining}
  const anchor = node.a11yId === null ? '' : ` #${node.a11yId}`
  const label = node.text === null ? '' : ` "${node.text}"`
  const line = `${'  '.repeat(depth)}${node.class}${anchor}${label} ${formatRect(node.rect)}`
  return node.children.reduce(
    (folded, child) => {
      const next = formatViewNode(child, depth + 1, folded.remaining)
      return {lines: [...folded.lines, ...next.lines], remaining: next.remaining}
    },
    {lines: [line], remaining: remaining - 1},
  )
}

function neutralGrabToGrab(neutral: NeutralGrab): Grab {
  const text =
    neutral.subtree === undefined
      ? neutral.text
      : `${neutral.text}\n\n[view]\n${formatViewNode(neutral.subtree, 0, SUBTREE_MAX_NODES).lines.join('\n')}`
  return {text, preview: neutral.preview, rect: neutral.rect, source: neutral.source}
}

function unchanged(state: NativeState): NativeTransition {
  return {state, effects: []}
}

function settlePick(state: NativeState, outcome: PickOutcome): NativeTransition {
  if (state.pick.status !== 'picking') return unchanged(state)
  return {
    state: {...state, pick: {status: 'idle'}},
    effects: [{type: 'settle', attempt: state.pick.attempt, outcome}],
  }
}

function cancelPick(state: NativeState, link: NativeLink): NativeTransition {
  if (state.pick.status !== 'picking') return unchanged(state)
  const requestId = state.pick.requestId
  const settled = settlePick(state, {type: 'cancelled'})
  return {
    state: settled.state,
    effects: [{type: 'post', message: {v: agreedVersion(link), type: 'grab.cancel', requestId}}, ...settled.effects],
  }
}

function tick(state: NativeState, link: NativeLink): NativeTransition {
  if (link.status !== 'announcing') return unchanged(state)
  const version = agreedVersion(link)
  const hello: NativeEffect = {
    type: 'post',
    message: {
      v: version,
      type: 'handshake.hello',
      minV: BRIDGE_MIN_VERSION,
      maxV: BRIDGE_MAX_VERSION,
      clientId: state.clientId,
      bundleReady: true,
    },
  }
  if (link.acked) return {state, effects: [hello]}
  return {state, effects: [{type: 'post', message: {v: version, type: 'bridge.ready'}}, hello]}
}

function requestPick(state: NativeState, link: NativeLink, mode: GrabMode): NativeTransition {
  const previous = settlePick(state, {type: 'cancelled'})
  const attempt = state.attempts + 1
  const requestId = `${state.clientId}-pick-${attempt}`
  return {
    state: {...previous.state, attempts: attempt, pick: {status: 'picking', requestId, attempt}},
    effects: [
      ...previous.effects,
      {type: 'schedule-timeout', attempt},
      {type: 'post', message: {v: agreedVersion(link), type: 'grab.pick', requestId, mode}},
    ],
  }
}

function timeOutPick(state: NativeState, link: NativeLink, attempt: number): NativeTransition {
  if (state.pick.status !== 'picking' || state.pick.attempt !== attempt) return unchanged(state)
  const requestId = state.pick.requestId
  return {
    state: {...state, pick: {status: 'idle'}},
    effects: [
      {type: 'log', message: `grab pick ${requestId} timed out`},
      {type: 'post', message: {v: agreedVersion(link), type: 'grab.cancel', requestId}},
      {type: 'settle', attempt, outcome: {type: 'failed', failure: 'timed-out', requestId}},
    ],
  }
}

function dropUnparseable(state: NativeState, grabRequestId: string | undefined): NativeTransition {
  const log: NativeEffect = {type: 'log', message: 'dropping unparseable native call'}
  if (state.pick.status !== 'picking' || state.pick.requestId !== grabRequestId) return {state, effects: [log]}
  const settled = settlePick(state, {type: 'failed', failure: 'unparseable', requestId: state.pick.requestId})
  return {state: settled.state, effects: [log, ...settled.effects]}
}

function receiveHandshake(
  state: NativeState,
  link: NativeLink,
  message: Extract<NativeToPageMessage, {type: 'handshake'}>,
): NativeTransition {
  if (message.v < BRIDGE_MIN_VERSION || message.v > BRIDGE_MAX_VERSION) {
    return {
      state: {...state, link: {status: 'incompatible', link, nativeMinV: message.v, nativeMaxV: message.v}},
      effects: [
        {
          type: 'log',
          message: `native handshake version ${message.v} is outside ${BRIDGE_MIN_VERSION}..${BRIDGE_MAX_VERSION}`,
        },
      ],
    }
  }
  const rebinds = trimBase(message.apiBase) !== trimBase(link.apiBase)
  const ready: NativeLink = {status: 'ready', version: message.v, apiBase: rebinds ? message.apiBase : link.apiBase}
  return {
    state: {...state, link: withLink(state.link, ready)},
    effects: rebinds ? [{type: 'publish', signal: {type: 'rebind', apiBase: message.apiBase}}] : [],
  }
}

function receiveGrabResult(
  state: NativeState,
  message: Extract<NativeToPageMessage, {type: 'grabResult'}>,
): NativeTransition {
  if (state.pick.status !== 'picking' || state.pick.requestId !== message.requestId) {
    return {state, effects: [{type: 'log', message: `dropping stale grabResult for ${message.requestId}`}]}
  }
  if (message.grab !== null) return settlePick(state, {type: 'picked', grab: neutralGrabToGrab(message.grab)})
  if (message.reason === 'cancelled') return settlePick(state, {type: 'cancelled'})
  return settlePick(state, {type: 'failed', failure: 'failed', requestId: message.requestId})
}

function receive(state: NativeState, link: NativeLink, message: NativeToPageMessage): NativeTransition {
  if (message.type === 'handshake') return receiveHandshake(state, link, message)
  if (message.type === 'bridge.incompatible') {
    return {
      state: {
        ...state,
        link: {status: 'incompatible', link, nativeMinV: message.nativeMinV, nativeMaxV: message.nativeMaxV},
      },
      effects: [],
    }
  }
  if (message.type === 'open') return {state, effects: [{type: 'publish', signal: {type: 'open'}}]}
  if (message.type === 'close') return {state, effects: [{type: 'publish', signal: {type: 'close'}}]}
  if (message.type === 'grabResult') return receiveGrabResult(state, message)
  if (state.grabbable === message.grabbable) return unchanged(state)
  return {state: {...state, grabbable: message.grabbable}, effects: []}
}

function receiveParsed(state: NativeState, link: NativeLink, message: NativeToPageMessage): NativeTransition {
  const ack: NativeEffect = {type: 'post', message: {v: agreedVersion(link), type: 'bridge.ack', seq: message.seq}}
  const acked: NativeLink = link.status === 'announcing' ? {...link, acked: true} : link
  const ackedState: NativeState = acked === link ? state : {...state, link: withLink(state.link, acked)}
  const next = receive(ackedState, acked, message)
  return {state: next.state, effects: [ack, ...next.effects]}
}

function togglePanel(state: NativeState, link: NativeLink, toggle: PanelToggle): NativeTransition {
  const version = agreedVersion(link)
  const message: PageToNativeMessage =
    toggle.mascotRect === null
      ? {v: version, type: 'host.panelToggled', open: toggle.open, connected: toggle.connected}
      : {
          v: version,
          type: 'host.panelToggled',
          open: toggle.open,
          connected: toggle.connected,
          mascotRect: toggle.mascotRect,
        }
  return {state, effects: [{type: 'post', message}]}
}

export function transitionNative(state: NativeState, event: NativeEvent): NativeTransition {
  if (state.link.status === 'disposed') return unchanged(state)
  if (event.type === 'disposed') {
    const settled = settlePick(state, {type: 'cancelled'})
    return {state: {...settled.state, link: {status: 'disposed'}}, effects: settled.effects}
  }
  if (state.link.status === 'idle') {
    if (event.type !== 'started') return unchanged(state)
    return {
      state: {...state, link: {status: 'announcing', acked: false, apiBase: state.link.apiBase}},
      effects: [{type: 'schedule-tick'}],
    }
  }
  const link = currentLink(state.link)
  if (link === undefined) return unchanged(state)
  if (event.type === 'tick') return tick(state, link)
  if (event.type === 'native-parsed') return receiveParsed(state, link, event.message)
  if (event.type === 'native-unparseable') return dropUnparseable(state, event.grabRequestId)
  if (event.type === 'pick-requested') return requestPick(state, link, event.mode)
  if (event.type === 'cancel-requested') return cancelPick(state, link)
  if (event.type === 'pick-timeout') return timeOutPick(state, link, event.attempt)
  if (event.type === 'panel-toggled') return togglePanel(state, link, event.toggle)
  return unchanged(state)
}
