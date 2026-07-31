import {describe, expect, it} from 'vitest'
import {
  applyLocalRun,
  applyRevision,
  derive,
  HOOK_IDLE_MS,
  IDLE_ENTRY,
  isLocalWrite,
  LAUNCH_GRACE_MS,
  LOCAL_SETTLE_MS,
  nonDecreasing,
  sendPolicy,
  snapshotOf,
  STALE_IDLE_MS,
  WORK_FRESH_MS,
  WRITE_IDLE_MS,
  applySignal,
  withTranscriptHealth,
  type Entry,
  type RevisionState,
} from '../src/machine.js'
import {PRESENCE_STATES, type EvidenceSource, type ObserverSignal, type PresenceState} from '../src/types.js'

const NOW = 1_000
const WALL = 1_760_000_000_000
const BEFORE = 500

function entryIn(state: PresenceState): Entry {
  return {...IDLE_ENTRY, state, evidence: 'hook', lastEvidenceAt: BEFORE, lastEvidenceWallAt: BEFORE}
}

function always(state: PresenceState): Record<PresenceState, PresenceState> {
  return {idle: state, launching: state, connected: state, working: state, stale: state}
}

type SignalCase = {
  label: string
  signal: ObserverSignal
  targets: Record<PresenceState, PresenceState>
  evidence: EvidenceSource | null
}

const SIGNAL_CASES: SignalCase[] = [
  {label: 'launch', signal: {kind: 'launch'}, targets: always('launching'), evidence: 'launch'},
  {
    label: 'hook SessionStart',
    signal: {kind: 'hook', event: 'SessionStart'},
    targets: always('connected'),
    evidence: 'hook',
  },
  {
    label: 'hook UserPromptSubmit',
    signal: {kind: 'hook', event: 'UserPromptSubmit'},
    targets: always('working'),
    evidence: 'hook',
  },
  {label: 'hook PreToolUse', signal: {kind: 'hook', event: 'PreToolUse'}, targets: always('working'), evidence: 'hook'},
  {
    label: 'hook PostToolUse',
    signal: {kind: 'hook', event: 'PostToolUse'},
    targets: always('working'),
    evidence: 'hook',
  },
  {label: 'hook Stop', signal: {kind: 'hook', event: 'Stop'}, targets: always('connected'), evidence: 'hook'},
  {label: 'hook SessionEnd', signal: {kind: 'hook', event: 'SessionEnd'}, targets: always('idle'), evidence: null},
  {label: 'mcp', signal: {kind: 'mcp'}, targets: always('working'), evidence: 'mcp'},
  {
    label: 'external-write',
    signal: {kind: 'external-write'},
    targets: {
      idle: 'connected',
      launching: 'connected',
      connected: 'connected',
      working: 'working',
      stale: 'working',
    },
    evidence: 'external-write',
  },
  {label: 'detach', signal: {kind: 'detach'}, targets: always('idle'), evidence: null},
]

const TABLE = PRESENCE_STATES.flatMap((from) =>
  SIGNAL_CASES.map((signalCase) => ({
    from,
    label: signalCase.label,
    signal: signalCase.signal,
    to: signalCase.targets[from],
    evidence: signalCase.evidence,
  })),
)

describe('transition table', () => {
  it.each(TABLE)('$from + $label -> $to', ({from, signal, to, evidence}) => {
    const next = applySignal(entryIn(from), signal, NOW, WALL)
    expect(next.state).toBe(to)
    expect(next.evidence).toBe(evidence ?? 'hook')
    expect(next.lastEvidenceAt).toBe(evidence === null ? BEFORE : NOW)
    expect(next.lastEvidenceWallAt).toBe(evidence === null ? BEFORE : WALL)
  })
})

describe('decay boundaries', () => {
  function aged(state: PresenceState, evidence: EvidenceSource, age: number): PresenceState {
    return derive({...entryIn(state), evidence, lastEvidenceAt: NOW}, NOW + age).state
  }

  it('holds launching until the launch grace elapses', () => {
    expect(aged('launching', 'launch', LAUNCH_GRACE_MS - 1)).toBe('launching')
    expect(aged('launching', 'launch', LAUNCH_GRACE_MS)).toBe('idle')
  })

  it('turns working into stale rather than silently allowing sends', () => {
    expect(aged('working', 'hook', WORK_FRESH_MS - 1)).toBe('working')
    expect(aged('working', 'hook', WORK_FRESH_MS)).toBe('stale')
  })

  it('retires stale after the idle window', () => {
    expect(aged('stale', 'hook', STALE_IDLE_MS - 1)).toBe('stale')
    expect(aged('stale', 'hook', STALE_IDLE_MS)).toBe('idle')
  })

  it('gives hook evidence a longer connected life than write evidence', () => {
    expect(aged('connected', 'hook', HOOK_IDLE_MS - 1)).toBe('connected')
    expect(aged('connected', 'hook', HOOK_IDLE_MS)).toBe('idle')
    expect(aged('connected', 'external-write', WRITE_IDLE_MS - 1)).toBe('connected')
    expect(aged('connected', 'external-write', WRITE_IDLE_MS)).toBe('idle')
    expect(aged('connected', 'mcp', WRITE_IDLE_MS)).toBe('idle')
  })

  it('leaves idle untouched at any age', () => {
    expect(aged('idle', 'hook', STALE_IDLE_MS * 10)).toBe('idle')
  })

  it('decays a long silence all the way to idle in one derive', () => {
    expect(aged('working', 'hook', 3_600_000)).toBe('idle')
  })

  it('does not move backwards when the clock reading is older', () => {
    const entry = {...entryIn('working'), lastEvidenceAt: NOW}
    expect(derive(entry, NOW - 5_000).state).toBe('working')
    expect(nonDecreasing(NOW, NOW - 5_000)).toBe(NOW)
    expect(nonDecreasing(NOW, NOW + 5_000)).toBe(NOW + 5_000)
    expect(derive(entry, nonDecreasing(NOW, NOW - 5_000)).state).toBe('working')
  })
})

describe('sendPolicy', () => {
  const EXPECTED: Record<PresenceState, {open: string; forced: string}> = {
    idle: {open: 'allow', forced: 'allow'},
    launching: {open: 'confirm', forced: 'allow'},
    connected: {open: 'confirm', forced: 'allow'},
    working: {open: 'block', forced: 'block'},
    stale: {open: 'confirm', forced: 'allow'},
  }

  it.each(PRESENCE_STATES)('%s resolves both force branches', (state) => {
    expect(sendPolicy(state, false)).toBe(EXPECTED[state].open)
    expect(sendPolicy(state, true)).toBe(EXPECTED[state].forced)
  })
})

describe('long tool run', () => {
  it('degrades to stale with a confirmable send and recovers on the next hook', () => {
    const working = applySignal(IDLE_ENTRY, {kind: 'hook', event: 'PreToolUse'}, NOW, WALL)
    const later = NOW + 300_000
    const stale = derive(working, later)
    expect(stale.state).toBe('stale')
    expect(sendPolicy(stale.state, false)).toBe('confirm')
    expect(sendPolicy(stale.state, true)).toBe('allow')
    const resumed = applySignal(stale, {kind: 'hook', event: 'PostToolUse'}, later, WALL)
    expect(resumed.state).toBe('working')
    expect(sendPolicy(resumed.state, false)).toBe('block')
  })
})

describe('attribution', () => {
  it('drops external writes while a local run is in flight', () => {
    const running = applyLocalRun(IDLE_ENTRY, 'start', NOW)
    expect(isLocalWrite(running, NOW)).toBe(true)
    const next = applySignal(running, {kind: 'external-write'}, NOW + 1_000, WALL)
    expect(next.state).toBe('idle')
    expect(next.lastEvidenceAt).toBe(IDLE_ENTRY.lastEvidenceAt)
  })

  it('drops our own mcp traffic while a local run is in flight', () => {
    const running = applyLocalRun(IDLE_ENTRY, 'start', NOW)
    const next = applySignal(running, {kind: 'mcp'}, NOW + 1_000, WALL)
    expect(next.state).toBe('idle')
  })

  it('keeps dropping writes inside the settle window and accepts them after it', () => {
    const ended = applyLocalRun(applyLocalRun(IDLE_ENTRY, 'start', NOW), 'end', NOW)
    expect(ended.localRuns).toBe(0)
    const inside = NOW + LOCAL_SETTLE_MS - 1
    expect(isLocalWrite(ended, inside)).toBe(true)
    expect(applySignal(ended, {kind: 'external-write'}, inside, WALL).state).toBe('idle')
    expect(applySignal(ended, {kind: 'mcp'}, inside, WALL).state).toBe('idle')
    const outside = NOW + LOCAL_SETTLE_MS + 1
    expect(isLocalWrite(ended, outside)).toBe(false)
    const accepted = applySignal(ended, {kind: 'external-write'}, outside, WALL)
    expect(accepted.state).toBe('connected')
    expect(accepted.lastEvidenceAt).toBe(outside)
  })

  it('counts nested local runs so one end does not open the gate', () => {
    const nested = applyLocalRun(applyLocalRun(IDLE_ENTRY, 'start', NOW), 'start', NOW)
    const one = applyLocalRun(nested, 'end', NOW)
    expect(one.localRuns).toBe(1)
    expect(isLocalWrite(one, NOW + LOCAL_SETTLE_MS * 10)).toBe(true)
    const none = applyLocalRun(one, 'end', NOW)
    expect(none.localRuns).toBe(0)
    expect(isLocalWrite(none, NOW + LOCAL_SETTLE_MS * 10)).toBe(false)
  })

  it('never floors the local run count below zero', () => {
    expect(applyLocalRun(IDLE_ENTRY, 'end', NOW).localRuns).toBe(0)
  })

  it('accepts hook and launch evidence even during a local run', () => {
    const running = applyLocalRun(IDLE_ENTRY, 'start', NOW)
    expect(applySignal(running, {kind: 'hook', event: 'SessionStart'}, NOW, WALL).state).toBe('connected')
    expect(applySignal(running, {kind: 'launch'}, NOW, WALL).state).toBe('launching')
  })

  it('lets a forced send terminate instead of re-arming the window', () => {
    const working = applySignal(IDLE_ENTRY, {kind: 'hook', event: 'PreToolUse'}, NOW, WALL)
    const running = applyLocalRun(working, 'start', NOW)
    const spammed = [1, 2, 3, 4, 5].reduce(
      (entry, step) => applySignal(entry, {kind: 'external-write'}, NOW + step * 100, WALL),
      running,
    )
    expect(spammed.lastEvidenceAt).toBe(NOW)
    expect(derive(spammed, NOW + WORK_FRESH_MS).state).toBe('stale')
    expect(derive(spammed, NOW + STALE_IDLE_MS).state).toBe('idle')
  })
})

describe('pending revision attribution', () => {
  const committed: RevisionState = {committedRevision: 'rev-0', pendingRevision: null}

  it('signals a revision change when no local run owns it', () => {
    const outcome = applyRevision(IDLE_ENTRY, committed, 'rev-1', NOW, WALL)
    expect(outcome.signalled).toBe(true)
    expect(outcome.revisions).toEqual({committedRevision: 'rev-1', pendingRevision: null})
    expect(outcome.entry.state).toBe('connected')
  })

  it('stays quiet while the revision is unchanged', () => {
    const outcome = applyRevision(IDLE_ENTRY, committed, 'rev-0', NOW, WALL)
    expect(outcome.signalled).toBe(false)
    expect(outcome.entry).toBe(IDLE_ENTRY)
    expect(outcome.revisions.committedRevision).toBe('rev-0')
  })

  it('signals a lone external write that landed inside the settle window once the window closes', () => {
    const ended = applyLocalRun(applyLocalRun(IDLE_ENTRY, 'start', NOW), 'end', NOW)
    const suppressed = applyRevision(ended, committed, 'rev-1', NOW + 1_000, WALL)
    expect(suppressed.signalled).toBe(false)
    expect(suppressed.entry.state).toBe('idle')
    expect(suppressed.revisions).toEqual({committedRevision: 'rev-0', pendingRevision: 'rev-1'})

    const after = NOW + LOCAL_SETTLE_MS + 1
    const resolved = applyRevision(suppressed.entry, suppressed.revisions, 'rev-1', after, WALL)
    expect(resolved.signalled).toBe(true)
    expect(resolved.entry.state).toBe('connected')
    expect(resolved.entry.lastEvidenceAt).toBe(after)
    expect(resolved.revisions).toEqual({committedRevision: 'rev-1', pendingRevision: null})
    expect(sendPolicy(resolved.entry.state, false)).toBe('confirm')
  })

  it('keeps the pending revision across ticks that are still inside the window', () => {
    const ended = applyLocalRun(applyLocalRun(IDLE_ENTRY, 'start', NOW), 'end', NOW)
    const first = applyRevision(ended, committed, 'rev-1', NOW + 1_000, WALL)
    const second = applyRevision(first.entry, first.revisions, 'rev-1', NOW + 2_000, WALL)
    expect(second.signalled).toBe(false)
    expect(second.revisions).toEqual({committedRevision: 'rev-0', pendingRevision: 'rev-1'})
  })

  it('forgets a pending revision that reverts to the committed one', () => {
    const pending: RevisionState = {committedRevision: 'rev-0', pendingRevision: 'rev-1'}
    const outcome = applyRevision(IDLE_ENTRY, pending, 'rev-0', NOW, WALL)
    expect(outcome.signalled).toBe(false)
    expect(outcome.revisions).toEqual({committedRevision: 'rev-0', pendingRevision: null})
  })

  it('takes the first revision reading as the baseline without signalling', () => {
    const outcome = applyRevision(IDLE_ENTRY, {committedRevision: null, pendingRevision: null}, 'rev-1', NOW, WALL)
    expect(outcome.signalled).toBe(false)
    expect(outcome.entry.state).toBe('idle')
    expect(outcome.revisions.committedRevision).toBe('rev-1')
  })
})

describe('transcript health', () => {
  it('stamps since on the first failure and holds it while the failure continues', () => {
    const failed = withTranscriptHealth(IDLE_ENTRY, {reason: 'unreadable', detail: 'EACCES'}, NOW)
    expect(failed.health).toEqual({ok: false, reason: 'unreadable', detail: 'EACCES', since: NOW})
    const still = withTranscriptHealth(failed, {reason: 'unreadable', detail: 'EACCES'}, NOW + 60_000)
    expect(still.health).toEqual({ok: false, reason: 'unreadable', detail: 'EACCES', since: NOW})
    const recovered = withTranscriptHealth(still, null, NOW + 90_000)
    expect(recovered.health).toEqual({ok: true})
    const again = withTranscriptHealth(recovered, {reason: 'missing', detail: 'ENOENT'}, NOW + 120_000)
    expect(again.health).toEqual({ok: false, reason: 'missing', detail: 'ENOENT', since: NOW + 120_000})
  })
})

describe('detach', () => {
  it.each(PRESENCE_STATES.filter((state) => state !== 'idle'))('drops %s to idle', (state) => {
    const next = applySignal(entryIn(state), {kind: 'detach'}, NOW, WALL)
    expect(next.state).toBe('idle')
    expect(snapshotOf(next, NOW).state).toBe('idle')
  })

  it('reports a canonical idle snapshot for an unknown session', () => {
    expect(snapshotOf(IDLE_ENTRY, NOW)).toEqual({
      state: 'idle',
      evidence: IDLE_ENTRY.evidence,
      lastEvidenceAt: 0,
      lastEvidenceWallAt: 0,
      health: {ok: true},
    })
  })

  it('derives the snapshot instead of mutating the entry', () => {
    const working = applySignal(IDLE_ENTRY, {kind: 'hook', event: 'PreToolUse'}, NOW, WALL)
    const snapshot = snapshotOf(working, NOW + WORK_FRESH_MS)
    expect(snapshot.state).toBe('stale')
    expect(working.state).toBe('working')
  })
})
