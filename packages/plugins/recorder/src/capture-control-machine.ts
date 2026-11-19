import type {RecorderControl} from './rpc.js'

const CAPTURE_TTL_MS = 10 * 60 * 1000

const VIEWER_LEASE_MS = 20_000

type Capture = {readonly captureId: string; readonly startTs: number; readonly expiresAt: number}

type Viewer = {readonly viewerId: string; readonly expiresAt: number}

export type CaptureRange = {readonly startTs: number; readonly stopTs: number}

export type CaptureControlState =
  | {readonly status: 'idle'}
  | {readonly status: 'live'; readonly captures: readonly Capture[]; readonly viewers: readonly Viewer[]}
  | {readonly status: 'disposed'}

export type CaptureControlEvent =
  | {readonly type: 'capture.started'; readonly captureId: string; readonly now: number}
  | {readonly type: 'capture.stopped'; readonly captureId: string; readonly now: number}
  | {readonly type: 'viewer.renewed'; readonly viewerId: string; readonly now: number}
  | {readonly type: 'viewer.dropped'; readonly viewerId: string; readonly now: number}
  | {readonly type: 'clock.ticked'; readonly now: number}
  | {readonly type: 'disposed'}

export type CaptureControlEffect =
  | {readonly type: 'emit'; readonly control: RecorderControl}
  | {readonly type: 'answer-stop'; readonly captureId: string; readonly range: CaptureRange | undefined}

type CaptureControlTransition = {
  readonly state: CaptureControlState
  readonly effects: readonly CaptureControlEffect[]
}

type Claims = {readonly captures: readonly Capture[]; readonly viewers: readonly Viewer[]}

const NO_CLAIMS: Claims = {captures: [], viewers: []}

export const initialCaptureControl: CaptureControlState = {status: 'idle'}

export function isCaptureLive(state: CaptureControlState): boolean {
  return state.status === 'live'
}

function readClaims(state: CaptureControlState): Claims {
  return state.status === 'live' ? state : NO_CLAIMS
}

function settle(claims: Claims): CaptureControlState {
  if (claims.captures.length === 0 && claims.viewers.length === 0) return {status: 'idle'}
  return {status: 'live', captures: claims.captures, viewers: claims.viewers}
}

function expire(state: CaptureControlState, now: number): CaptureControlTransition {
  const claims = readClaims(state)
  const captures = claims.captures.filter((capture) => capture.expiresAt > now)
  const viewers = claims.viewers.filter((viewer) => viewer.expiresAt > now)
  if (captures.length === claims.captures.length && viewers.length === claims.viewers.length)
    return {state, effects: []}
  const next = settle({captures, viewers})
  return {state: next, effects: isCaptureLive(next) ? [] : [{type: 'emit', control: {live: false}}]}
}

function followWith(
  expired: CaptureControlTransition,
  step: (state: CaptureControlState) => CaptureControlTransition,
): CaptureControlTransition {
  const next = step(expired.state)
  return {state: next.state, effects: [...expired.effects, ...next.effects]}
}

function startCapture(state: CaptureControlState, captureId: string, now: number): CaptureControlTransition {
  const claims = readClaims(state)
  return {
    state: settle({
      ...claims,
      captures: [...claims.captures, {captureId, startTs: now, expiresAt: now + CAPTURE_TTL_MS}],
    }),
    effects: [{type: 'emit', control: {live: true, snapshot: true, flush: true}}],
  }
}

function stopCapture(state: CaptureControlState, captureId: string, now: number): CaptureControlTransition {
  const claims = readClaims(state)
  const capture = claims.captures.find((candidate) => candidate.captureId === captureId)
  if (!capture) return {state, effects: [{type: 'answer-stop', captureId, range: undefined}]}
  const next = settle({...claims, captures: claims.captures.filter((candidate) => candidate !== capture)})
  return {
    state: next,
    effects: [
      {type: 'emit', control: {flush: true, live: isCaptureLive(next)}},
      {type: 'answer-stop', captureId, range: {startTs: capture.startTs, stopTs: now}},
    ],
  }
}

function renewViewer(state: CaptureControlState, viewerId: string, now: number): CaptureControlTransition {
  const claims = readClaims(state)
  const known = claims.viewers.some((viewer) => viewer.viewerId === viewerId)
  const viewers = [
    ...claims.viewers.filter((viewer) => viewer.viewerId !== viewerId),
    {viewerId, expiresAt: now + VIEWER_LEASE_MS},
  ]
  const next = settle({...claims, viewers})
  if (known) return {state: next, effects: []}
  const turnsLive: readonly CaptureControlEffect[] =
    viewers.length === 1 && claims.captures.length === 0 ? [{type: 'emit', control: {live: true}}] : []
  return {state: next, effects: [...turnsLive, {type: 'emit', control: {snapshot: true, flush: true}}]}
}

function dropViewer(state: CaptureControlState, viewerId: string): CaptureControlTransition {
  const claims = readClaims(state)
  if (!claims.viewers.some((viewer) => viewer.viewerId === viewerId)) return {state, effects: []}
  const next = settle({...claims, viewers: claims.viewers.filter((viewer) => viewer.viewerId !== viewerId)})
  return {state: next, effects: isCaptureLive(next) ? [] : [{type: 'emit', control: {live: false}}]}
}

export function transitionCaptureControl(
  state: CaptureControlState,
  event: CaptureControlEvent,
): CaptureControlTransition {
  if (state.status === 'disposed') return {state, effects: []}
  if (event.type === 'disposed') return {state: {status: 'disposed'}, effects: []}
  const expired = expire(state, event.now)
  if (event.type === 'clock.ticked') return expired
  if (event.type === 'capture.started')
    return followWith(expired, (current) => startCapture(current, event.captureId, event.now))
  if (event.type === 'capture.stopped')
    return followWith(expired, (current) => stopCapture(current, event.captureId, event.now))
  if (event.type === 'viewer.renewed')
    return followWith(expired, (current) => renewViewer(current, event.viewerId, event.now))
  return followWith(expired, (current) => dropViewer(current, event.viewerId))
}
