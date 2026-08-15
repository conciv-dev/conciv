import {createComputed, createRoot, createSignal, type Accessor} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {makeLiveSessions, type LiveSessions} from '../src/app/live-sessions.js'

function trackAnyRunning(): {live: LiveSessions; notifications: () => number; dispose: () => void} {
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

function makeChat(): {working: Accessor<boolean>; setWorking: (value: boolean) => void} {
  const [working, setWorking] = createSignal(false)
  return {working, setWorking: (value) => setWorking(value)}
}

function mountPane(live: LiveSessions, working: Accessor<boolean>): () => void {
  return createRoot((dispose) => {
    live.register(working)
    return dispose
  })
}

describe('makeLiveSessions', () => {
  it('a pane whose chat never works never wakes the launcher', () => {
    const {live, notifications, dispose} = trackAnyRunning()
    const chat = makeChat()

    expect(notifications()).toBe(1)
    const closePane = mountPane(live, chat.working)

    expect(notifications(), 'registering an idle pane leaves the launcher asleep').toBe(1)
    expect(live.anyRunning()).toBe(false)
    closePane()
    dispose()
  })

  it('notifies on the real start and the real settle of a registered pane', () => {
    const {live, notifications, dispose} = trackAnyRunning()
    const chat = makeChat()
    const closePane = mountPane(live, chat.working)

    chat.setWorking(true)

    expect(notifications(), 'a start notifies').toBe(2)
    expect(live.anyRunning()).toBe(true)

    chat.setWorking(false)

    expect(notifications(), 'the matching settle notifies').toBe(3)
    expect(live.anyRunning()).toBe(false)
    closePane()
    dispose()
  })

  it('keeps the launcher busy until every pane watching the same session has settled', () => {
    const {live, notifications, dispose} = trackAnyRunning()
    const firstPane = makeChat()
    const secondPane = makeChat()
    const closeFirst = mountPane(live, firstPane.working)
    const closeSecond = mountPane(live, secondPane.working)

    firstPane.setWorking(true)
    secondPane.setWorking(true)

    expect(live.anyRunning()).toBe(true)

    firstPane.setWorking(false)

    expect(live.anyRunning(), 'the second pane still holds the same session live').toBe(true)

    secondPane.setWorking(false)

    expect(live.anyRunning(), 'the last pane settling drains the session').toBe(false)
    expect(notifications(), 'only the two real edges wake the launcher').toBe(3)
    closeFirst()
    closeSecond()
    dispose()
  })

  it('a closed pane stops holding the launcher busy', () => {
    const {live, dispose} = trackAnyRunning()
    const chat = makeChat()
    const closePane = mountPane(live, chat.working)
    chat.setWorking(true)

    expect(live.anyRunning()).toBe(true)

    closePane()

    expect(live.anyRunning(), 'an unmounted pane no longer counts as running').toBe(false)
    dispose()
  })
})
