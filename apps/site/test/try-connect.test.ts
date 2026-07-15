import {describe, expect, it} from 'vitest'
import {shouldAutoOpen} from '../src/lib/try-state'

describe('shouldAutoOpen', () => {
  it('opens on first visit', () => {
    expect(shouldAutoOpen({tryParam: false, dismissed: false, widgetPresent: false})).toBe(true)
  })
  it('stays closed after dismissal', () => {
    expect(shouldAutoOpen({tryParam: false, dismissed: true, widgetPresent: false})).toBe(false)
  })
  it('does nothing when the param is already present', () => {
    expect(shouldAutoOpen({tryParam: true, dismissed: false, widgetPresent: false})).toBe(false)
  })
  it('never opens when a widget is on the page', () => {
    expect(shouldAutoOpen({tryParam: false, dismissed: false, widgetPresent: true})).toBe(false)
  })
})
