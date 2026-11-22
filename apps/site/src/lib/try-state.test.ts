import {describe, expect, test} from 'vitest'
import {shouldAutoOpen, shouldDismissOnClose, tryButtonLabel} from './try-state'

describe('the try panel state', () => {
  test.each([
    {connected: true, pending: false, label: 'Open agent panel'},
    {connected: true, pending: true, label: 'Open agent panel'},
    {connected: false, pending: true, label: 'Opening…'},
    {connected: false, pending: false, label: 'Try it live'},
  ])('connected $connected and pending $pending labels the try button $label', ({connected, pending, label}) => {
    expect(tryButtonLabel({connected, pending})).toBe(label)
  })

  test.each([
    {widgetOpen: true, tryParam: false, dismissed: false, widgetPresent: false, opens: true},
    {widgetOpen: false, tryParam: false, dismissed: false, widgetPresent: false, opens: false},
    {widgetOpen: true, tryParam: true, dismissed: false, widgetPresent: false, opens: false},
    {widgetOpen: true, tryParam: false, dismissed: true, widgetPresent: false, opens: false},
    {widgetOpen: true, tryParam: false, dismissed: false, widgetPresent: true, opens: false},
  ])(
    'widget open $widgetOpen, ?try $tryParam, dismissed $dismissed and widget present $widgetPresent auto-opens: $opens',
    ({opens, ...state}) => {
      expect(shouldAutoOpen(state)).toBe(opens)
    },
  )

  test.each([
    {hasBeenOpen: true, connected: false, dismisses: true},
    {hasBeenOpen: true, connected: true, dismisses: false},
    {hasBeenOpen: false, connected: false, dismisses: false},
  ])('closing after open $hasBeenOpen while connected $connected dismisses: $dismisses', ({dismisses, ...state}) => {
    expect(shouldDismissOnClose(state)).toBe(dismisses)
  })
})
