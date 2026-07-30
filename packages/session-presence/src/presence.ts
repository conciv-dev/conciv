export type PresenceState = 'idle' | 'launching' | 'connected' | 'working'

export type PresenceSource = 'hook' | 'signal' | 'launch'

export type PresenceSnapshot = {state: PresenceState; source: PresenceSource; lastSeenAt: number}

export type HookEventName = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SessionEnd'

export type PresenceSignal =
  | {kind: 'launched'}
  | {kind: 'hook'; event: HookEventName}
  | {kind: 'mcp'}
  | {kind: 'transcript'}

export type SendPolicy = 'allow' | 'confirm' | 'block'

export const LAUNCH_GRACE_MS = 90_000
export const HOOK_STALE_MS = 600_000
export const SIGNAL_STALE_MS = 120_000
export const WORK_STALE_MS = 120_000

const UNKNOWN: PresenceSnapshot = {state: 'idle', source: 'signal', lastSeenAt: 0}

const HOOK_STATES: Record<HookEventName, PresenceState> = {
  SessionStart: 'connected',
  UserPromptSubmit: 'working',
  PreToolUse: 'working',
  PostToolUse: 'working',
  Stop: 'connected',
  SessionEnd: 'idle',
}

function staleAfter(snapshot: PresenceSnapshot): number {
  if (snapshot.state === 'launching') return LAUNCH_GRACE_MS
  if (snapshot.source === 'hook') return HOOK_STALE_MS
  return SIGNAL_STALE_MS
}

function resolve(snapshot: PresenceSnapshot, now: number): PresenceSnapshot {
  if (snapshot.state === 'idle') return snapshot
  const age = now - snapshot.lastSeenAt
  if (age >= staleAfter(snapshot)) return {...snapshot, state: 'idle'}
  if (snapshot.state === 'working' && age >= WORK_STALE_MS) return {...snapshot, state: 'connected'}
  return snapshot
}

function applySignal(current: PresenceSnapshot, signal: PresenceSignal, now: number): PresenceSnapshot {
  if (signal.kind === 'launched') return {state: 'launching', source: 'launch', lastSeenAt: now}
  if (signal.kind === 'hook') return {state: HOOK_STATES[signal.event], source: 'hook', lastSeenAt: now}
  if (current.state !== 'idle' && current.source === 'hook') return {...current, lastSeenAt: now}
  return {state: 'connected', source: 'signal', lastSeenAt: now}
}

export function makePresence(deps: {now(): number; onChange(key: string): void}): {
  report(key: string, signal: PresenceSignal): void
  snapshot(key: string): PresenceSnapshot
  active(): string[]
  sendPolicy(key: string, force: boolean): SendPolicy
} {
  const entries = new Map<string, PresenceSnapshot>()
  const snapshot = (key: string): PresenceSnapshot => resolve(entries.get(key) ?? UNKNOWN, deps.now())
  return {
    snapshot,
    report(key, signal) {
      const now = deps.now()
      const current = resolve(entries.get(key) ?? UNKNOWN, now)
      entries.set(key, applySignal(current, signal, now))
      deps.onChange(key)
    },
    active() {
      return [...entries.keys()].filter((key) => snapshot(key).state !== 'idle')
    },
    sendPolicy(key, force) {
      const {state} = snapshot(key)
      if (state === 'working') return 'block'
      if (state === 'connected') return force ? 'allow' : 'confirm'
      return 'allow'
    },
  }
}
