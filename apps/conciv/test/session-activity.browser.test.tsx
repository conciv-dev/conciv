import {batch, createRoot, createSignal, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {describe, expect, it} from 'vitest'
import {AppContext, type AppContextValue} from '../src/app/context.js'
import {trackSessionActivity} from '../src/pane/session-activity.js'
import {makeAppContextValue} from './helpers/app-context-value.js'

const OFFLINE_BASE = 'http://127.0.0.1:1'
const PANE_SESSION_ID = 'the-mounted-session'

type ActivityProbe = {
  app: AppContextValue
  setWorking: (value: boolean) => void
  invalidations: () => number
  settles: () => number
  unmount: () => void
}

function mountActivity(): ActivityProbe {
  const scope = createRoot((dispose) => ({app: makeAppContextValue({base: OFFLINE_BASE}), dispose}))
  const [working, setWorking] = createSignal(false)
  let invalidations = 0
  let settles = 0
  const Pane = (): JSX.Element => {
    trackSessionActivity({
      sessionId: PANE_SESSION_ID,
      working,
      invalidateSessions: () => {
        invalidations += 1
      },
      onSettle: () => {
        settles += 1
      },
    })
    return <div>pane</div>
  }
  const mounted = render(() => (
    <AppContext.Provider value={scope.app}>
      <Pane />
    </AppContext.Provider>
  ))
  return {
    app: scope.app,
    setWorking,
    invalidations: () => invalidations,
    settles: () => settles,
    unmount: () => {
      mounted.unmount()
      scope.dispose()
    },
  }
}

describe('trackSessionActivity', () => {
  it('invalidates the session list when a pane closes while its run is still in flight', () => {
    const probe = mountActivity()
    probe.setWorking(true)

    probe.unmount()

    expect(probe.invalidations(), 'a pane closed mid-run hands the busy state to server truth').toBe(1)
  })

  it('invalidates the session list when the final settle and the close land in one batch', () => {
    const probe = mountActivity()
    probe.setWorking(true)

    batch(() => {
      probe.setWorking(false)
      probe.unmount()
    })

    expect(probe.settles(), 'the queued settle effect dies with the pane').toBe(0)
    expect(probe.invalidations(), 'teardown still refreshes the stale running row').toBe(1)
  })

  it('leaves the session list alone when a pane closes with no run in flight', () => {
    const probe = mountActivity()

    probe.unmount()

    expect(probe.invalidations(), 'an idle pane closing needs no refetch').toBe(0)
  })

  it('releases the launcher when the pane unmounts', () => {
    const probe = mountActivity()
    probe.setWorking(true)

    expect(probe.app.liveSessions.activityIn(PANE_SESSION_ID)).toBe('running')

    probe.unmount()

    expect(probe.app.liveSessions.activityIn(PANE_SESSION_ID), 'an unmounted pane stops holding the launcher').toBe(
      'unmounted',
    )
  })
})
