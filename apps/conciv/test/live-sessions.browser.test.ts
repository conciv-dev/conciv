import {createComputed, createRoot} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {makeLiveSessions} from '../src/app/live-sessions.js'

function trackAnyRunning(): {
  live: ReturnType<typeof makeLiveSessions>
  notifications: () => number
  dispose: () => void
} {
  return createRoot((dispose) => {
    const live = makeLiveSessions()
    let runs = 0
    createComputed(() => {
      live.anyRunning()
      runs += 1
    })
    return {live, notifications: () => runs, dispose}
  })
}

describe('makeLiveSessions', () => {
  it('stopping a session it never saw notifies nobody', () => {
    const {live, notifications, dispose} = trackAnyRunning()

    expect(notifications()).toBe(1)
    live.setRunning('never-started', false)

    expect(notifications(), 'an unknown stop leaves the counts untouched').toBe(1)
    expect(live.anyRunning()).toBe(false)
    dispose()
  })

  it('still notifies on the real start and the real stop', () => {
    const {live, notifications, dispose} = trackAnyRunning()

    live.setRunning('session-a', true)

    expect(notifications(), 'a start notifies').toBe(2)
    expect(live.anyRunning()).toBe(true)

    live.setRunning('session-a', false)

    expect(notifications(), 'the matching stop notifies').toBe(3)
    expect(live.anyRunning()).toBe(false)
    dispose()
  })

  it('keeps a session running until every one of its runs has stopped', () => {
    const {live, notifications, dispose} = trackAnyRunning()

    live.setRunning('session-a', true)
    live.setRunning('session-a', true)
    live.setRunning('session-a', false)

    expect(live.anyRunning(), 'two runs and one stop leave the session live').toBe(true)

    live.setRunning('session-a', false)

    expect(live.anyRunning(), 'the last stop drains the session').toBe(false)
    expect(notifications(), 'the middle start and stop never flip the boolean, so nobody wakes').toBe(3)
    dispose()
  })
})
