import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<{cx: number; cy: number}> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
  const {width, height} = page.viewportSize() ?? {width: 1280, height: 720}
  return {cx: width / 2, cy: height / 2}
}

test('moving over the open canvas does not storm the sync feed (no write feedback loop)', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)

    await api.callTool('comment.create', {
      cid: crypto.randomUUID(),
      kind: 'floating',
      parts: [{type: 'text', text: 'quiescence probe'}],
      x: 240,
      y: 240,
      authorKind: 'ai',
      authorModel: 'Opus',
    })
    await api.page.getByRole('button', {name: /comment, open/}).waitFor({timeout: 15_000})
    await api.page.waitForTimeout(1500)

    const cdp = await api.page.context().newCDPSession(api.page)
    await cdp.send('Network.enable')
    let framesSent = 0
    cdp.on('Network.webSocketFrameSent', () => (framesSent += 1))

    for (let step = 0; step < 24; step += 1) {
      await api.page.mouse.move(cx - 120 + step * 10, cy + (step % 2 === 0 ? -8 : 8))
      await api.page.waitForTimeout(80)
    }

    expect(framesSent).toBeLessThan(8)
  } finally {
    await api.dispose()
  }
})
