import {createComputed, createRoot, createSignal, type Accessor} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {makeLiveSessions, type LiveSessions} from '../src/app/live-sessions.js'

const TARGET = 'session-in-front'
const OTHER = 'session-behind'

function trackActivity(sessionId: string | null): {
  live: LiveSessions
  notifications: () => number
  dispose: () => void
} {
  return createRoot((dispose) => {
    const live = makeLiveSessions()
    let runs = 0
    createComputed(() => {
      live.activityIn(sessionId)
      runs += 1
    })
    return {live, notifications: () => runs, dispose}
  })
}

function makeChat(): {working: Accessor<boolean>; setWorking: (value: boolean) => void} {
  const [working, setWorking] = createSignal(false)
  return {working, setWorking}
}

describe('makeLiveSessions', () => {
  it('reports no pane for a session nobody has mounted', () => {
    const {live, dispose} = trackActivity(TARGET)

    expect(live.activityIn(TARGET)).toBe('unmounted')
    dispose()
  })

  it('reports an idle pane without waking the launcher', () => {
    const {live, notifications, dispose} = trackActivity(TARGET)
    const chat = makeChat()

    expect(notifications()).toBe(1)
    const closePane = live.register(TARGET, chat.working)

    expect(live.activityIn(TARGET), 'a mounted idle pane owns the answer').toBe('idle')
    closePane()
    dispose()
  })

  it('notifies on the real start and the real settle of the targeted pane', () => {
    const {live, notifications, dispose} = trackActivity(TARGET)
    const chat = makeChat()
    const closePane = live.register(TARGET, chat.working)

    chat.setWorking(true)

    expect(live.activityIn(TARGET)).toBe('running')

    chat.setWorking(false)

    expect(live.activityIn(TARGET)).toBe('idle')
    expect(notifications(), 'only the registration and the two real edges notify').toBe(4)
    closePane()
    dispose()
  })

  it('never lets a run in another session answer for the targeted one', () => {
    const {live, notifications, dispose} = trackActivity(TARGET)
    const elsewhere = makeChat()
    const closePane = live.register(OTHER, elsewhere.working)
    const before = notifications()

    elsewhere.setWorking(true)

    expect(live.activityIn(TARGET), 'a run behind the targeted session stays behind it').toBe('unmounted')
    expect(live.activityIn(OTHER)).toBe('running')
    expect(notifications(), 'an unrelated session never wakes the launcher').toBe(before)
    closePane()
    dispose()
  })

  it('keeps the targeted session busy until every pane of that session settles', () => {
    const {live, dispose} = trackActivity(TARGET)
    const firstPane = makeChat()
    const secondPane = makeChat()
    const closeFirst = live.register(TARGET, firstPane.working)
    const closeSecond = live.register(TARGET, secondPane.working)

    firstPane.setWorking(true)
    secondPane.setWorking(true)
    firstPane.setWorking(false)

    expect(live.activityIn(TARGET), 'the second pane still holds the launcher busy').toBe('running')

    secondPane.setWorking(false)

    expect(live.activityIn(TARGET), 'the last pane settling releases the launcher').toBe('idle')
    closeFirst()
    closeSecond()
    dispose()
  })

  it('disposes registrations one at a time even when two panes share one accessor', () => {
    const {live, dispose} = trackActivity(TARGET)
    const chat = makeChat()
    const closeFirst = live.register(TARGET, chat.working)
    const closeSecond = live.register(TARGET, chat.working)
    chat.setWorking(true)

    closeFirst()

    expect(live.activityIn(TARGET), 'the surviving registration still holds the launcher').toBe('running')

    closeSecond()

    expect(live.activityIn(TARGET), 'the last registration leaves no pane behind').toBe('unmounted')
    dispose()
  })

  it('answers unmounted for a widget that targets no session at all', () => {
    const {live, dispose} = trackActivity(null)
    const chat = makeChat()
    const closePane = live.register(TARGET, chat.working)
    chat.setWorking(true)

    expect(live.activityIn(null)).toBe('unmounted')
    closePane()
    dispose()
  })
})
