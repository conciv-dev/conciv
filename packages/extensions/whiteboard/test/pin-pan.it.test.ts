import {expect, test} from 'vitest'
import type {Locator} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {until} from '@conciv/harness-testkit'
import {openCanvas, testHost} from './canvas-it-helpers.js'

const projectedTop = (pin: Locator) => async (): Promise<number> =>
  pin.evaluate((element) => (element as HTMLElement).getBoundingClientRect().top)

test('a comment pin is projected to screen and tracks canvas pan', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await api.callToolApproved('comment_create', {
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

    await until(async () => Math.abs((await projectedTop(pin)()) - top0) > 80, {hangGuardMs: 30_000, intervalMs: 250})
  } finally {
    await api.dispose()
  }
})
