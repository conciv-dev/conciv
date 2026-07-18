import {expect, test} from 'vitest'
import type {Locator} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {openCanvas} from './canvas-it-helpers.js'

const clientEntry = '@conciv/extension-whiteboard/client'

const projectedTop = (pin: Locator) => async (): Promise<number> =>
  pin.evaluate((element) => (element as HTMLElement).getBoundingClientRect().top)

test('a comment pin is projected to screen and tracks canvas pan', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await api.callTool('comment.create', {
      cid: crypto.randomUUID(),
      kind: 'floating',
      parts: [{type: 'text', text: 'pan test'}],
      x: 240,
      y: 240,
      authorKind: 'ai',
    })

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 30_000})
    const top0 = await projectedTop(pin)()
    expect(top0).toBeGreaterThan(0)

    await api.page.mouse.move(cx, cy)
    await api.page.mouse.wheel(0, 320)

    await expect
      .poll(async () => Math.abs((await projectedTop(pin)()) - top0), {timeout: 30_000, interval: 200})
      .toBeGreaterThan(80)
  } finally {
    await api.dispose()
  }
})
