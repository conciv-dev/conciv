import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {
  TranscriptChunk,
  TranscriptFailure,
  TranscriptHandle,
  TranscriptRevision,
} from '@conciv/protocol/harness-types'
import type {UIMessage} from '@tanstack/ai'
import {makeSessionObserver, type ObserverDeps, type SessionObserver} from '../src/observer.js'
import type {Clock, SessionSnapshot, SessionUpdate} from '../src/types.js'
import {WORK_FRESH_MS} from '../src/machine.js'

const TICK_MS = 500
const IDLE_TICK_MS = 2000

type FakeHandle = TranscriptHandle & {
  revisions: number
  reads: number
  closes: number
  setRevision(rev: string): void
  setMessages(messages: UIMessage[]): void
  failWith(failure: TranscriptFailure | null): void
}

function message(id: string): UIMessage {
  return {id, role: 'assistant', parts: [{type: 'text', content: id}]}
}

function makeFakeHandle(rev = 'r0'): FakeHandle {
  const state = {
    rev,
    messages: [message('m0')],
    failure: null as TranscriptFailure | null,
    revisions: 0,
    reads: 0,
    closes: 0,
  }
  return {
    get revisions() {
      return state.revisions
    },
    get reads() {
      return state.reads
    },
    get closes() {
      return state.closes
    },
    setRevision: (next) => {
      state.rev = next
    },
    setMessages: (next) => {
      state.messages = next
    },
    failWith: (failure) => {
      state.failure = failure
    },
    revision: (): Promise<TranscriptRevision | TranscriptFailure> => {
      state.revisions += 1
      if (state.failure) return Promise.resolve(state.failure)
      return Promise.resolve({rev: state.rev, changedAt: 1})
    },
    read: (): Promise<TranscriptChunk | TranscriptFailure> => {
      state.reads += 1
      if (state.failure) return Promise.resolve(state.failure)
      return Promise.resolve({ok: true, rev: state.rev, changedAt: 1, messages: state.messages, replaced: true})
    },
    close: () => {
      state.closes += 1
    },
  }
}

type Rig = {
  observer: SessionObserver
  clock: Clock
  handles: Map<string, FakeHandle>
  handleCalls: string[]
  stateChanges: {sessionId: string; snapshot: SessionSnapshot}[]
  advance(ms: number): Promise<void>
  ticks(count: number): Promise<void>
  settle(): Promise<void>
}

function makeRig(over: Partial<ObserverDeps> = {}): Rig {
  const time = {monotonic: 1000, wall: 1_700_000_000_000}
  const clock: Clock = {monotonic: () => time.monotonic, wall: () => time.wall}
  const handles = new Map<string, FakeHandle>()
  const handleCalls: string[] = []
  const stateChanges: {sessionId: string; snapshot: SessionSnapshot}[] = []
  const observer = makeSessionObserver({
    clock,
    handleFor: (sessionId) => {
      handleCalls.push(sessionId)
      const existing = handles.get(sessionId)
      if (existing) return Promise.resolve(existing)
      const fresh = makeFakeHandle()
      handles.set(sessionId, fresh)
      return Promise.resolve(fresh)
    },
    onStateChange: (sessionId, snapshot) => stateChanges.push({sessionId, snapshot}),
    ...over,
  })
  observer.start()
  const advance = async (ms: number): Promise<void> => {
    time.monotonic += ms
    time.wall += ms
    await vi.advanceTimersByTimeAsync(ms)
  }
  return {
    observer,
    clock,
    handles,
    handleCalls,
    stateChanges,
    advance,
    ticks: async (count) => {
      for (let index = 0; index < count; index += 1) await advance(TICK_MS)
    },
    settle: async () => {
      await vi.advanceTimersByTimeAsync(0)
    },
  }
}

const rigs: Rig[] = []

function rig(over: Partial<ObserverDeps> = {}): Rig {
  const made = makeRig(over)
  rigs.push(made)
  return made
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const made of rigs.splice(0)) made.observer.dispose()
  vi.useRealTimers()
})

function collect(observer: SessionObserver, sessionId: string): {updates: SessionUpdate[]; stop: () => void} {
  const updates: SessionUpdate[] = []
  const stop = observer.subscribe(sessionId, (update) => updates.push(update))
  return {updates, stop}
}

function transcripts(updates: SessionUpdate[]): Extract<SessionUpdate, {kind: 'transcript'}>[] {
  return updates.flatMap((update) => (update.kind === 'transcript' ? [update] : []))
}

function presences(updates: SessionUpdate[]): Extract<SessionUpdate, {kind: 'presence'}>[] {
  return updates.flatMap((update) => (update.kind === 'presence' ? [update] : []))
}

describe('poll gating', () => {
  it('checks the revision every tick but reads only once while the revision holds', async () => {
    const made = rig()
    collect(made.observer, 'a')
    await made.ticks(10)

    const handle = made.handles.get('a')
    expect(handle?.revisions).toBe(10)
    expect(handle?.reads).toBe(1)
  })

  it('reads exactly once more when the revision advances', async () => {
    const made = rig()
    const seen = collect(made.observer, 'a')
    await made.ticks(3)
    made.handles.get('a')?.setRevision('r1')
    made.handles.get('a')?.setMessages([message('m0'), message('m1')])
    await made.ticks(3)

    expect(made.handles.get('a')?.reads).toBe(2)
    expect(transcripts(seen.updates).map((update) => update.rev)).toEqual(['r0', 'r1'])
    expect(transcripts(seen.updates).at(-1)?.messages).toHaveLength(2)
  })

  it('never reads content for a session nobody subscribes to', async () => {
    const made = rig()
    made.observer.report('a', {kind: 'hook', event: 'SessionStart'})
    await made.ticks(6)

    expect(made.handles.get('a')?.revisions).toBeGreaterThan(0)
    expect(made.handles.get('a')?.reads).toBe(0)
  })

  it('backs an unsubscribed non-working session off to the idle interval', async () => {
    const made = rig()
    made.observer.report('a', {kind: 'hook', event: 'SessionStart'})
    await made.ticks(8)

    const handle = made.handles.get('a')
    expect(handle?.revisions).toBeLessThanOrEqual(Math.ceil((8 * TICK_MS) / IDLE_TICK_MS) + 1)
    expect(handle?.revisions).toBeGreaterThan(0)
  })
})

describe('per-subscriber emit state', () => {
  it('gives a late subscriber the current snapshot without replaying it to the first', async () => {
    const made = rig()
    const first = collect(made.observer, 'a')
    await made.ticks(2)
    made.observer.report('a', {kind: 'hook', event: 'UserPromptSubmit'})
    await made.settle()
    const beforeJoin = presences(first.updates).length

    const second = collect(made.observer, 'a')
    await made.settle()

    expect(presences(second.updates).at(0)?.snapshot.state).toBe('working')
    expect(presences(first.updates).length).toBe(beforeJoin)
  })

  it('replays the cached transcript to a late subscriber only', async () => {
    const made = rig()
    const first = collect(made.observer, 'a')
    await made.ticks(2)
    const beforeJoin = transcripts(first.updates).length

    const second = collect(made.observer, 'a')
    await made.settle()

    expect(transcripts(second.updates)).toHaveLength(1)
    expect(transcripts(first.updates).length).toBe(beforeJoin)
  })

  it('keeps a second subscriber alive when the first unsubscribes twice', async () => {
    const made = rig()
    const first = collect(made.observer, 'a')
    first.stop()
    const second = collect(made.observer, 'a')
    await made.settle()
    first.stop()

    made.observer.report('a', {kind: 'hook', event: 'UserPromptSubmit'})
    await made.settle()

    expect(presences(second.updates).at(-1)?.snapshot.state).toBe('working')
  })
})

describe('baseline pruning', () => {
  it('does not signal a re-activated session for writes made while it was idle', async () => {
    const made = rig()
    made.observer.report('a', {kind: 'hook', event: 'SessionStart'})
    await made.ticks(2)
    made.observer.report('a', {kind: 'detach'})
    await made.ticks(2)
    expect(made.handles.get('a')?.closes).toBeGreaterThan(0)

    made.handles.get('a')?.setRevision('r-external-while-idle')
    made.observer.report('a', {kind: 'launch'})
    await made.ticks(2)

    expect(made.observer.snapshot('a').state).toBe('launching')

    made.handles.get('a')?.setRevision('r-after')
    await made.ticks(10)
    expect(made.observer.snapshot('a').state).toBe('connected')
  })
})

describe('transcript failure', () => {
  it('reports a failure instead of an empty transcript and clears it on recovery', async () => {
    const made = rig()
    made.handles.set('a', makeFakeHandle())
    made.handles.get('a')?.failWith({ok: false, reason: 'unreadable', detail: 'EACCES'})
    const seen = collect(made.observer, 'a')
    await made.ticks(6)

    const errors = seen.updates.filter((update) => update.kind === 'transcript-error')
    expect(errors).toHaveLength(1)
    expect(transcripts(seen.updates)).toHaveLength(0)
    const failing = made.observer.snapshot('a')
    expect(failing.health.ok).toBe(false)
    const since = failing.health.ok === false ? failing.health.since : 0

    await made.ticks(2)
    const still = made.observer.snapshot('a')
    expect(still.health.ok === false ? still.health.since : -1).toBe(since)

    made.handles.get('a')?.failWith(null)
    await made.ticks(2)
    expect(made.observer.snapshot('a').health.ok).toBe(true)
    expect(transcripts(seen.updates)).toHaveLength(1)
  })
})

describe('state-change notifications', () => {
  it('stays silent while the revision churns without a state transition', async () => {
    const made = rig()
    collect(made.observer, 'a')
    made.observer.report('a', {kind: 'hook', event: 'SessionStart'})
    await made.advance(3000)
    const baseline = made.stateChanges.length
    expect(baseline).toBe(1)

    for (let index = 0; index < 20; index += 1) {
      made.handles.get('a')?.setRevision(`r${index}`)
      await made.advance(100)
    }

    expect(made.observer.snapshot('a').state).toBe('connected')
    expect(made.stateChanges.length).toBe(baseline)
  })

  it('notifies once when a working session decays to stale', async () => {
    const made = rig()
    collect(made.observer, 'a')
    made.observer.report('a', {kind: 'hook', event: 'UserPromptSubmit'})
    await made.ticks(4)
    const baseline = made.stateChanges.length

    await made.advance(WORK_FRESH_MS)
    await made.advance(4000)

    expect(made.observer.snapshot('a').state).toBe('stale')
    expect(made.stateChanges.length).toBe(baseline + 1)
    expect(made.stateChanges.at(-1)?.snapshot.state).toBe('stale')
  })
})

describe('dispose', () => {
  it('closes every handle, runs every wire teardown once and stops vetoing sends', async () => {
    const wire: (() => void)[] = []
    const ran = {count: 0}
    wire.push(() => {
      ran.count += 1
    })
    const made = rig({wire})
    collect(made.observer, 'a')
    made.observer.report('a', {kind: 'hook', event: 'UserPromptSubmit'})
    await made.ticks(3)
    expect(made.observer.sendPolicy('a', false)).toBe('block')

    made.observer.dispose()
    made.observer.dispose()

    expect(made.handles.get('a')?.closes).toBe(1)
    expect(ran.count).toBe(1)
    expect(made.observer.sendPolicy('a', true)).toBe('allow')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('settle-window attribution', () => {
  it('signals a single external write that landed during a local run once the window closes', async () => {
    const made = rig()
    collect(made.observer, 'a')
    await made.ticks(2)
    made.observer.localRun('a', 'start')
    made.handles.get('a')?.setRevision('r-during-run')
    await made.ticks(2)
    expect(made.observer.snapshot('a').state).toBe('idle')

    made.observer.localRun('a', 'end')
    await made.advance(6000)

    expect(made.observer.snapshot('a').state).toBe('connected')
    expect(made.observer.sendPolicy('a', false)).toBe('confirm')
  })
})
