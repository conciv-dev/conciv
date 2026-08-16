import {describe, expect, it} from 'vitest'
import {shouldAutoOpen, shouldDismissOnClose, tryButtonLabel} from '../src/lib/try-state'

describe('shouldAutoOpen', () => {
  it('opens for a fresh desktop visitor', () => {
    expect(shouldAutoOpen({widgetOpen: true, tryParam: false, dismissed: false, widgetPresent: false})).toBe(true)
  })

  it('stays closed once the visitor dismissed the panel', () => {
    expect(shouldAutoOpen({widgetOpen: true, tryParam: false, dismissed: true, widgetPresent: false})).toBe(false)
  })

  it('stays closed when the widget is already present', () => {
    expect(shouldAutoOpen({widgetOpen: true, tryParam: false, dismissed: false, widgetPresent: true})).toBe(false)
  })
})

describe('shouldDismissOnClose', () => {
  it('dismisses when a visitor closes an opened panel without connecting', () => {
    expect(shouldDismissOnClose({hasBeenOpen: true, connected: false})).toBe(true)
  })

  it('does not dismiss once connected', () => {
    expect(shouldDismissOnClose({hasBeenOpen: true, connected: true})).toBe(false)
  })

  it('does not dismiss a panel that was never opened', () => {
    expect(shouldDismissOnClose({hasBeenOpen: false, connected: false})).toBe(false)
  })
})

describe('tryButtonLabel', () => {
  it('shows the connected label regardless of a stale pending intent', () => {
    expect(tryButtonLabel({connected: true, pending: true})).toBe('Open agent panel')
  })

  it('shows a working state for a pre-mount click', () => {
    expect(tryButtonLabel({connected: false, pending: true})).toBe('Opening…')
  })

  it('shows the default call to action otherwise', () => {
    expect(tryButtonLabel({connected: false, pending: false})).toBe('Try it live')
  })
})
