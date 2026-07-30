import {describe, expect, it} from 'vitest'
import {makePresence, type PresenceSnapshot} from '../src/presence.js'

const LAUNCH_GRACE_MS = 90_000
const HOOK_STALE_MS = 600_000
const SIGNAL_STALE_MS = 120_000
const WORK_STALE_MS = 120_000

function setup(startAt = 1_000) {
  const clock = {now: startAt}
  const changed: string[] = []
  const presence = makePresence({now: () => clock.now, onChange: (key) => changed.push(key)})
  const advance = (ms: number) => {
    clock.now += ms
  }
  return {presence, changed, advance, clock}
}

function stateOf(snapshot: PresenceSnapshot): [string, string] {
  return [snapshot.state, snapshot.source]
}

describe('presence transitions', () => {
  it('reports idle for an unknown key', () => {
    const {presence} = setup()
    expect(presence.snapshot('missing')).toEqual({state: 'idle', source: 'signal', lastSeenAt: 0})
  })

  it('marks a launched session as launching', () => {
    const {presence, clock} = setup()
    presence.report('a', {kind: 'launched'})
    expect(presence.snapshot('a')).toEqual({state: 'launching', source: 'launch', lastSeenAt: clock.now})
  })

  it('decays launching to idle after the launch grace window', () => {
    const {presence, advance} = setup()
    presence.report('a', {kind: 'launched'})
    advance(LAUNCH_GRACE_MS - 1)
    expect(presence.snapshot('a').state).toBe('launching')
    advance(1)
    expect(presence.snapshot('a').state).toBe('idle')
  })

  it('connects on SessionStart', () => {
    const {presence} = setup()
    presence.report('a', {kind: 'hook', event: 'SessionStart'})
    expect(stateOf(presence.snapshot('a'))).toEqual(['connected', 'hook'])
  })

  it('works on prompt and tool hooks', () => {
    const {presence} = setup()
    for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse'] as const) {
      presence.report(event, {kind: 'hook', event})
      expect(stateOf(presence.snapshot(event))).toEqual(['working', 'hook'])
    }
  })

  it('returns to connected on Stop and to idle on SessionEnd', () => {
    const {presence} = setup()
    presence.report('a', {kind: 'hook', event: 'UserPromptSubmit'})
    presence.report('a', {kind: 'hook', event: 'Stop'})
    expect(stateOf(presence.snapshot('a'))).toEqual(['connected', 'hook'])
    presence.report('a', {kind: 'hook', event: 'SessionEnd'})
    expect(presence.snapshot('a').state).toBe('idle')
  })

  it('expires hook presence after the hook stale window', () => {
    const {presence, advance} = setup()
    presence.report('a', {kind: 'hook', event: 'SessionStart'})
    advance(HOOK_STALE_MS - 1)
    expect(presence.snapshot('a').state).toBe('connected')
    advance(1)
    expect(presence.snapshot('a').state).toBe('idle')
  })

  it('expires signal presence after the signal stale window', () => {
    const {presence, advance} = setup()
    presence.report('a', {kind: 'mcp'})
    advance(SIGNAL_STALE_MS - 1)
    expect(presence.snapshot('a').state).toBe('connected')
    advance(1)
    expect(presence.snapshot('a').state).toBe('idle')
  })

  it('decays working back to connected without a Stop hook', () => {
    const {presence, advance} = setup()
    presence.report('a', {kind: 'hook', event: 'PreToolUse'})
    advance(WORK_STALE_MS - 1)
    expect(presence.snapshot('a').state).toBe('working')
    advance(1)
    expect(stateOf(presence.snapshot('a'))).toEqual(['connected', 'hook'])
  })

  it('only refreshes last seen when a signal lands on a hook session', () => {
    const {presence, advance, clock} = setup()
    presence.report('a', {kind: 'hook', event: 'PreToolUse'})
    advance(1_000)
    presence.report('a', {kind: 'mcp'})
    expect(presence.snapshot('a')).toEqual({state: 'working', source: 'hook', lastSeenAt: clock.now})
    advance(1_000)
    presence.report('a', {kind: 'transcript'})
    expect(presence.snapshot('a')).toEqual({state: 'working', source: 'hook', lastSeenAt: clock.now})
  })

  it('never promotes a signal-only session to working', () => {
    const {presence} = setup()
    presence.report('a', {kind: 'mcp'})
    presence.report('a', {kind: 'transcript'})
    expect(stateOf(presence.snapshot('a'))).toEqual(['connected', 'signal'])
  })

  it('lets a signal revive a session whose hook presence has gone stale', () => {
    const {presence, advance} = setup()
    presence.report('a', {kind: 'hook', event: 'SessionStart'})
    advance(HOOK_STALE_MS)
    presence.report('a', {kind: 'transcript'})
    expect(stateOf(presence.snapshot('a'))).toEqual(['connected', 'signal'])
  })

  it('upgrades a launching session to connected on a signal', () => {
    const {presence} = setup()
    presence.report('a', {kind: 'launched'})
    presence.report('a', {kind: 'mcp'})
    expect(stateOf(presence.snapshot('a'))).toEqual(['connected', 'signal'])
  })

  it('fires onChange for every report', () => {
    const {presence, changed} = setup()
    presence.report('a', {kind: 'hook', event: 'SessionStart'})
    presence.report('a', {kind: 'hook', event: 'SessionStart'})
    presence.report('b', {kind: 'mcp'})
    expect(changed).toEqual(['a', 'a', 'b'])
  })
})

describe('presence active keys', () => {
  it('lists only keys whose effective state is not idle', () => {
    const {presence, advance} = setup()
    presence.report('working', {kind: 'hook', event: 'PreToolUse'})
    presence.report('connected', {kind: 'mcp'})
    presence.report('launching', {kind: 'launched'})
    presence.report('ended', {kind: 'hook', event: 'SessionEnd'})
    expect(presence.active().toSorted()).toEqual(['connected', 'launching', 'working'])
    advance(SIGNAL_STALE_MS)
    expect(presence.active()).toEqual(['working'])
    advance(HOOK_STALE_MS)
    expect(presence.active()).toEqual([])
  })
})

describe('presence send policy', () => {
  it('blocks a working session even with force', () => {
    const {presence} = setup()
    presence.report('a', {kind: 'hook', event: 'PreToolUse'})
    expect(presence.sendPolicy('a', false)).toBe('block')
    expect(presence.sendPolicy('a', true)).toBe('block')
  })

  it('confirms a connected session unless forced', () => {
    const {presence} = setup()
    presence.report('a', {kind: 'hook', event: 'SessionStart'})
    expect(presence.sendPolicy('a', false)).toBe('confirm')
    expect(presence.sendPolicy('a', true)).toBe('allow')
  })

  it('allows idle and launching sessions', () => {
    const {presence} = setup()
    presence.report('a', {kind: 'launched'})
    expect(presence.sendPolicy('a', false)).toBe('allow')
    expect(presence.sendPolicy('unknown', false)).toBe('allow')
  })

  it('stops blocking once the working state has decayed past the work window', () => {
    const {presence, advance} = setup()
    presence.report('a', {kind: 'hook', event: 'PreToolUse'})
    advance(WORK_STALE_MS)
    expect(presence.sendPolicy('a', false)).toBe('confirm')
    expect(presence.sendPolicy('a', true)).toBe('allow')
  })
})
