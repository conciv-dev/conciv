import {expect, test} from 'vitest'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {clientEntry, createFloatingComment, openCanvas, openThreadPin} from './canvas-it-helpers.js'

test('the thread card closes when its root comment is gone, leaving no empty header', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await createFloatingComment(api, {cid, text: 'open then vanish'})

    await openThreadPin(api.page)
    await api.page.getByRole('button', {name: 'Close thread'}).waitFor({timeout: 30_000})

    await api.callToolApproved('comment.delete', {cid})

    await expect
      .poll(async () => api.page.getByRole('button', {name: 'Close thread'}).count(), {timeout: 30_000})
      .toBe(0)
    expect(await api.page.getByRole('button', {name: 'Resolve thread'}).count()).toBe(0)
  } finally {
    await api.dispose()
  }
})
