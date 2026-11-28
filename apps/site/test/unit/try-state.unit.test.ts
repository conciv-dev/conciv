import {describe, expect, test} from 'vitest'
import {readPanelToggle, shouldAutoOpen, tryButtonLabel} from '../../src/lib/try-state'

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
    {wasOpen: true, open: false, connected: false, action: 'dismiss'},
    {wasOpen: true, open: false, connected: true, action: 'close'},
    {wasOpen: false, open: false, connected: false, action: 'none'},
    {wasOpen: false, open: true, connected: false, action: 'none'},
    {wasOpen: true, open: true, connected: true, action: 'none'},
  ])('a report of open $open after open $wasOpen while connected $connected is: $action', ({action, ...state}) => {
    expect(readPanelToggle(state)).toBe(action)
  })
})
