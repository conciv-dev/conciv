import {describe, expect, it} from 'vitest'
import {NavigationStateSchema} from '@conciv/protocol/chat-types'
import {openPanelNavigation} from '../src/lib/connect-live'

describe('openPanelNavigation', () => {
  it('produces a schema-valid single open-panel entry', () => {
    const state = openPanelNavigation('abc123')
    expect(NavigationStateSchema.parse(state)).toEqual(state)
    expect(state.entries).toEqual([{href: '/panel/abc123?open=true'}])
    expect(state.index).toBe(0)
  })
})
