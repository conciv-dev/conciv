import type {
  EvidenceSource,
  HookEventName,
  LocalRunPhase,
  ObserverSignal,
  PresenceState,
  SendPolicy,
  SessionSnapshot,
  TranscriptFailure,
  TranscriptHealth,
} from './types.js'

export const LAUNCH_GRACE_MS = 90_000
export const WORK_FRESH_MS = 120_000
export const STALE_IDLE_MS = 900_000
export const HOOK_IDLE_MS = 600_000
export const WRITE_IDLE_MS = 300_000
export const LOCAL_SETTLE_MS = 5_000

export type Entry = {
  state: PresenceState
  evidence: EvidenceSource
  lastEvidenceAt: number
  lastEvidenceWallAt: number
  localRuns: number
  localRunEndedAt: number | null
  health: TranscriptHealth
}

export type RevisionState = {committedRevision: string | null; pendingRevision: string | null}

export type RevisionOutcome = {entry: Entry; revisions: RevisionState; signalled: boolean}

export const IDLE_ENTRY: Entry = {
  state: 'idle',
  evidence: 'launch',
  lastEvidenceAt: 0,
  lastEvidenceWallAt: 0,
  localRuns: 0,
  localRunEndedAt: null,
  health: {ok: true},
}

const HOOK_STATES: Record<HookEventName, PresenceState> = {
  SessionStart: 'connected',
  UserPromptSubmit: 'working',
  PreToolUse: 'working',
  PostToolUse: 'working',
  Stop: 'connected',
  SessionEnd: 'idle',
}

export function nonDecreasing(previous: number, next: number): number {
  return Math.max(previous, next)
}

export function isLocalWrite(entry: Entry, now: number): boolean {
  if (entry.localRuns > 0) return true
  if (entry.localRunEndedAt === null) return false
  return now - entry.localRunEndedAt < LOCAL_SETTLE_MS
}

export function applyLocalRun(entry: Entry, phase: LocalRunPhase, now: number): Entry {
  if (phase === 'start') return {...entry, localRuns: entry.localRuns + 1}
  return {...entry, localRuns: Math.max(0, entry.localRuns - 1), localRunEndedAt: now}
}

export function withTranscriptHealth(entry: Entry, failure: TranscriptFailure | null, now: number): Entry {
  if (failure === null) {
    if (entry.health.ok) return entry
    return {...entry, health: {ok: true}}
  }
  const since = entry.health.ok ? now : entry.health.since
  return {...entry, health: {ok: false, reason: failure.reason, detail: failure.detail, since}}
}

function refreshed(entry: Entry, state: PresenceState, evidence: EvidenceSource, now: number, wallNow: number): Entry {
  return {...entry, state, evidence, lastEvidenceAt: now, lastEvidenceWallAt: wallNow}
}

function writeTarget(state: PresenceState): PresenceState {
  if (state === 'working' || state === 'stale') return 'working'
  return 'connected'
}

export function applySignal(entry: Entry, signal: ObserverSignal, now: number, wallNow: number): Entry {
  if (signal.kind === 'detach') return {...entry, state: 'idle'}
  if (signal.kind === 'launch') return refreshed(entry, 'launching', 'launch', now, wallNow)
  if (signal.kind === 'hook') {
    const state = HOOK_STATES[signal.event]
    if (state === 'idle') return {...entry, state: 'idle'}
    return refreshed(entry, state, 'hook', now, wallNow)
  }
  if (isLocalWrite(entry, now)) return entry
  if (signal.kind === 'mcp') return refreshed(entry, 'working', 'mcp', now, wallNow)
  return refreshed(entry, writeTarget(entry.state), 'external-write', now, wallNow)
}

export function applyRevision(
  entry: Entry,
  revisions: RevisionState,
  revision: string,
  now: number,
  wallNow: number,
): RevisionOutcome {
  if (revisions.committedRevision === null) {
    return {entry, revisions: {committedRevision: revision, pendingRevision: null}, signalled: false}
  }
  if (revision === revisions.committedRevision) {
    if (revisions.pendingRevision === null) return {entry, revisions, signalled: false}
    return {entry, revisions: {committedRevision: revision, pendingRevision: null}, signalled: false}
  }
  if (isLocalWrite(entry, now)) {
    return {entry, revisions: {...revisions, pendingRevision: revision}, signalled: false}
  }
  if (revision === revisions.pendingRevision) {
    return {entry, revisions: {committedRevision: revision, pendingRevision: null}, signalled: false}
  }
  return {
    entry: applySignal(entry, {kind: 'external-write'}, now, wallNow),
    revisions: {committedRevision: revision, pendingRevision: null},
    signalled: true,
  }
}

type Decay = {expiresAfter(evidence: EvidenceSource): number; next: PresenceState}

const DECAY_TABLE: Record<PresenceState, Decay | null> = {
  idle: null,
  launching: {expiresAfter: () => LAUNCH_GRACE_MS, next: 'idle'},
  connected: {expiresAfter: (evidence) => (evidence === 'hook' ? HOOK_IDLE_MS : WRITE_IDLE_MS), next: 'idle'},
  working: {expiresAfter: () => WORK_FRESH_MS, next: 'stale'},
  stale: {expiresAfter: () => STALE_IDLE_MS, next: 'idle'},
}

function decayOnce(entry: Entry, now: number): Entry {
  const decay = DECAY_TABLE[entry.state]
  if (decay === null) return entry
  if (now - entry.lastEvidenceAt < decay.expiresAfter(entry.evidence)) return entry
  return {...entry, state: decay.next}
}

export function derive(entry: Entry, now: number): Entry {
  const next = decayOnce(entry, now)
  if (next === entry) return entry
  return derive(next, now)
}

export function snapshotOf(entry: Entry, now: number): SessionSnapshot {
  const derived = derive(entry, now)
  return {
    state: derived.state,
    evidence: derived.evidence,
    lastEvidenceAt: derived.lastEvidenceAt,
    lastEvidenceWallAt: derived.lastEvidenceWallAt,
    health: derived.health,
  }
}

export function sendPolicy(state: PresenceState, force: boolean): SendPolicy {
  if (state === 'working') return 'block'
  if (state === 'idle') return 'allow'
  if (force) return 'allow'
  return 'confirm'
}
