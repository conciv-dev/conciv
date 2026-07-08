import {test} from 'vitest'
import {drawRectangle} from './canvas-it-helpers.js'
import {bootCanvas} from './canvas-it-boot.js'

test('a human-drawn element shows an author chip with the guest name', async () => {
  const {api, cx, cy} = await bootCanvas()
  try {
    await drawRectangle(api.page, cx, cy)
    const chip = api.page.getByText(/^Guest \w+/).first()
    await chip.waitFor({state: 'visible', timeout: 15_000})
  } finally {
    await api.dispose()
  }
})
