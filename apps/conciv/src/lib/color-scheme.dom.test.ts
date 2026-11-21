import {describe, expect, it} from 'vitest'
import {createRoot} from 'solid-js'
import {SKIN_NAMES} from '@conciv/ui-kit-system'
import {createHostTheme} from './color-scheme.js'

describe('the host page declares a skin in --conciv-skin', () => {
  it.each<[string, string, boolean]>([
    ...SKIN_NAMES.map((skin): [string, string, boolean] => [skin, skin, true]),
    ['', 'terminal', false],
    ['neon', 'terminal', false],
    ['toString', 'terminal', false],
    ['constructor', 'terminal', false],
  ])('a page skin of %j shows the %s skin, taken from the page: %s', (declared, skin, skinFromPage) => {
    const page = document.createElement('div')
    page.style.setProperty('--conciv-skin', declared)
    const widget = document.createElement('div')
    page.append(widget)
    document.body.append(page)

    const theme = createRoot((dispose) => {
      const hostTheme = createHostTheme(widget, () => ({colorScheme: 'light', skin: 'terminal'}))
      const shown = hostTheme()
      dispose()
      return shown
    })
    page.remove()

    expect(theme).toEqual({scheme: 'light', skin, skinFromPage})
  })
})
