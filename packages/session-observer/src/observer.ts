import type {TranscriptFailure as HandleFailure, TranscriptHandle} from '@conciv/protocol/harness-types'
import type {UIMessage} from '@tanstack/ai'
import {
  applyLocalRun,
  applyRevision,
  applySignal,
  derive,
  IDLE_ENTRY,
  isLocalWrite,
  nonDecreasing,
  sendPolicy as policyForState,
  snapshotOf,
  withTranscriptHealth,
  type Entry,
  type RevisionState,
} from './machine.js'
import type {
  Clock,
  LocalRunPhase,
  ObserverSignal,
  PresenceState,
  SendPolicy,
  SessionSnapshot,
  SessionUpdate,
} from './types.js'

const DEFAULT_ACTIVE_INTERVAL_MS = 500
const DEFAULT_IDLE_INTERVAL_MS = 2_000
const NOTIFY_COALESCE_MS = 2_000

export type ObserverDeps = {
  clock: Clock
  handleFor(sessionId: string): Promise<TranscriptHandle | null>
  onStateChange(sessionId: string, snapshot: SessionSnapshot): void
  wire?: (() => void)[]
  activeIntervalMs?: number
  idleIntervalMs?: number
}

export type SessionObserver = {
  start(): void
  dispose(): void
  report(sessionId: string, signal: ObserverSignal): void
  localRun(sessionId: string, phase: LocalRunPhase): void
  resetTranscript(sessionId: string): void
  snapshot(sessionId: string): SessionSnapshot
  sendPolicy(sessionId: string, force: boolean): SendPolicy
  subscribe(sessionId: string, sink: (update: SessionUpdate) => void): () => void
}

type Subscription = {
  sink: (update: SessionUpdate) => void
  lastPresence: SessionSnapshot | null
  lastRev: string | null
}

type Payload = {rev: string; messages: UIMessage[]}

type Watch = {
  entry: Entry
  revisions: RevisionState
  handle: TranscriptHandle | null
  emittedRevision: string | null
  payload: Payload | null
  polledAt: number
  inFlight: boolean
  failureKey: string | null
  broadcastState: PresenceState
}

function freshWatch(): Watch {
  return {
    entry: IDLE_ENTRY,
    revisions: {committedRevision: null, pendingRevision: null},
    handle: null,
    emittedRevision: null,
    payload: null,
    polledAt: Number.NEGATIVE_INFINITY,
    inFlight: false,
    failureKey: null,
    broadcastState: 'idle',
  }
}

function samePresence(left: SessionSnapshot | null, right: SessionSnapshot): boolean {
  if (left === null) return false
  if (left.state !== right.state || left.evidence !== right.evidence) return false
  if (left.lastEvidenceAt !== right.lastEvidenceAt) return false
  if (left.health.ok !== right.health.ok) return false
  if (left.health.ok || right.health.ok) return true
  return left.health.reason === right.health.reason && left.health.detail === right.health.detail
}

export function makeSessionObserver(deps: ObserverDeps): SessionObserver {
  const activeIntervalMs = deps.activeIntervalMs ?? DEFAULT_ACTIVE_INTERVAL_MS
  const idleIntervalMs = deps.idleIntervalMs ?? DEFAULT_IDLE_INTERVAL_MS
  const wire = deps.wire ?? []
  const sessions = new Map<string, Watch>()
  const watches = new Map<string, Set<Subscription>>()
  const pendingNotify = new Set<string>()
  const timers: {tick: ReturnType<typeof setInterval> | null; notify: ReturnType<typeof setTimeout> | null} = {
    tick: null,
    notify: null,
  }
  const life = {disposed: false, monotonic: 0}

  const now = (): number => {
    life.monotonic = nonDecreasing(life.monotonic, deps.clock.monotonic())
    return life.monotonic
  }

  const subscribersOf = (sessionId: string): Set<Subscription> => watches.get(sessionId) ?? new Set<Subscription>()

  const watchOf = (sessionId: string): Watch => {
    const existing = sessions.get(sessionId)
    if (existing) return existing
    const created = freshWatch()
    sessions.set(sessionId, created)
    return created
  }

  const flushNotify = (): void => {
    timers.notify = null
    const ids = [...pendingNotify]
    pendingNotify.clear()
    for (const sessionId of ids) {
      const watch = sessions.get(sessionId)
      deps.onStateChange(sessionId, snapshotOf(watch?.entry ?? IDLE_ENTRY, now()))
    }
  }

  const scheduleNotify = (): void => {
    if (timers.notify !== null || life.disposed) return
    const timer = setTimeout(flushNotify, NOTIFY_COALESCE_MS)
    timer.unref?.()
    timers.notify = timer
  }

  const publishPresence = (sessionId: string): void => {
    const watch = sessions.get(sessionId)
    if (!watch) return
    const snapshot = snapshotOf(watch.entry, now())
    for (const subscription of subscribersOf(sessionId)) {
      if (samePresence(subscription.lastPresence, snapshot)) continue
      subscription.lastPresence = snapshot
      subscription.sink({kind: 'presence', snapshot})
    }
    if (watch.broadcastState === snapshot.state) return
    watch.broadcastState = snapshot.state
    pendingNotify.add(sessionId)
    scheduleNotify()
  }

  const releaseHandle = (watch: Watch): void => {
    watch.handle?.close()
    watch.handle = null
    watch.revisions = {committedRevision: null, pendingRevision: null}
    watch.emittedRevision = null
    watch.payload = null
    watch.failureKey = null
  }

  const watched = (sessionId: string, watch: Watch, at: number): boolean => {
    if (subscribersOf(sessionId).size > 0) return true
    if (derive(watch.entry, at).state !== 'idle') return true
    return isLocalWrite(watch.entry, at)
  }

  const noteFailure = (sessionId: string, watch: Watch, failure: HandleFailure): void => {
    watch.entry = withTranscriptHealth(watch.entry, {reason: failure.reason, detail: failure.detail}, now())
    publishPresence(sessionId)
    const key = `${failure.reason}:${failure.detail}`
    if (watch.failureKey === key) return
    watch.failureKey = key
    for (const subscription of subscribersOf(sessionId))
      subscription.sink({kind: 'transcript-error', reason: failure.reason, detail: failure.detail})
  }

  const clearFailure = (sessionId: string, watch: Watch): void => {
    if (watch.entry.health.ok && watch.failureKey === null) return
    watch.entry = withTranscriptHealth(watch.entry, null, now())
    watch.failureKey = null
    publishPresence(sessionId)
  }

  const readForSubscribers = async (sessionId: string, watch: Watch, rev: string): Promise<void> => {
    if (subscribersOf(sessionId).size === 0) return
    if (watch.payload !== null && watch.emittedRevision === rev) return
    const handle = watch.handle
    if (!handle) return
    const chunk = await handle.read()
    if (sessions.get(sessionId) !== watch) return
    if (chunk.ok === false) {
      noteFailure(sessionId, watch, chunk)
      return
    }
    clearFailure(sessionId, watch)
    watch.emittedRevision = chunk.rev
    watch.payload = {rev: chunk.rev, messages: chunk.messages}
    for (const subscription of subscribersOf(sessionId)) {
      if (subscription.lastRev === chunk.rev) continue
      subscription.lastRev = chunk.rev
      subscription.sink({kind: 'transcript', rev: chunk.rev, messages: chunk.messages})
    }
  }

  const pollSession = async (sessionId: string, watch: Watch): Promise<void> => {
    watch.inFlight = true
    try {
      const handle = watch.handle ?? (await deps.handleFor(sessionId))
      if (sessions.get(sessionId) !== watch) return
      if (handle === null) return
      watch.handle = handle
      watch.polledAt = now()
      const revision = await handle.revision()
      if (sessions.get(sessionId) !== watch) return
      if ('ok' in revision) {
        noteFailure(sessionId, watch, revision)
        return
      }
      clearFailure(sessionId, watch)
      const outcome = applyRevision(watch.entry, watch.revisions, revision.rev, now(), deps.clock.wall())
      watch.entry = outcome.entry
      watch.revisions = outcome.revisions
      if (outcome.signalled) publishPresence(sessionId)
      await readForSubscribers(sessionId, watch, revision.rev)
    } finally {
      watch.inFlight = false
    }
  }

  const tick = (): void => {
    if (life.disposed) return
    const at = now()
    const entries = Array.from(sessions)
    for (const [sessionId, watch] of entries) {
      publishPresence(sessionId)
      if (!watched(sessionId, watch, at)) {
        releaseHandle(watch)
        sessions.delete(sessionId)
        continue
      }
      if (watch.inFlight) continue
      const subscribed = subscribersOf(sessionId).size > 0
      const working = derive(watch.entry, at).state === 'working'
      if (!subscribed && !working && at - watch.polledAt < idleIntervalMs) continue
      void pollSession(sessionId, watch)
    }
  }

  return {
    start() {
      if (life.disposed || timers.tick !== null) return
      const timer = setInterval(tick, activeIntervalMs)
      timer.unref?.()
      timers.tick = timer
    },
    dispose() {
      if (life.disposed) return
      life.disposed = true
      if (timers.tick !== null) clearInterval(timers.tick)
      if (timers.notify !== null) clearTimeout(timers.notify)
      timers.tick = null
      timers.notify = null
      for (const watch of sessions.values()) watch.handle?.close()
      sessions.clear()
      watches.clear()
      pendingNotify.clear()
      for (const stop of wire.splice(0)) stop()
    },
    report(sessionId, signal) {
      if (life.disposed) return
      const watch = watchOf(sessionId)
      const applied = applySignal(watch.entry, signal, now(), deps.clock.wall())
      if (signal.kind === 'detach') {
        releaseHandle(watch)
        watch.entry = {...IDLE_ENTRY, localRuns: applied.localRuns, localRunEndedAt: applied.localRunEndedAt}
      }
      if (signal.kind !== 'detach') watch.entry = applied
      publishPresence(sessionId)
    },
    localRun(sessionId, phase) {
      if (life.disposed) return
      const watch = watchOf(sessionId)
      watch.entry = applyLocalRun(watch.entry, phase, now())
    },
    resetTranscript(sessionId) {
      const watch = sessions.get(sessionId)
      if (!watch) return
      releaseHandle(watch)
    },
    snapshot(sessionId) {
      return snapshotOf(sessions.get(sessionId)?.entry ?? IDLE_ENTRY, now())
    },
    sendPolicy(sessionId, force) {
      if (life.disposed) return 'allow'
      return policyForState(snapshotOf(sessions.get(sessionId)?.entry ?? IDLE_ENTRY, now()).state, force)
    },
    subscribe(sessionId, sink) {
      if (life.disposed) return () => {}
      watchOf(sessionId)
      const bucket = watches.get(sessionId) ?? new Set<Subscription>()
      watches.set(sessionId, bucket)
      const subscription: Subscription = {sink, lastPresence: null, lastRev: null}
      bucket.add(subscription)
      queueMicrotask(() => {
        if (!bucket.has(subscription)) return
        const watch = sessions.get(sessionId) ?? watchOf(sessionId)
        const snapshot = snapshotOf(watch.entry, now())
        subscription.lastPresence = snapshot
        sink({kind: 'presence', snapshot})
        const payload = watch.payload
        if (payload === null) return
        subscription.lastRev = payload.rev
        sink({kind: 'transcript', rev: payload.rev, messages: payload.messages})
      })
      return () => {
        bucket.delete(subscription)
        if (bucket.size > 0) return
        if (watches.get(sessionId) === bucket) watches.delete(sessionId)
      }
    },
  }
}
