import {expect, test} from 'vitest'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {clientEntry, createFloatingComment, openCanvas, openThreadPin} from './canvas-it-helpers.js'

test('deleting a thread root removes its replies and pin', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await createFloatingComment(api, {cid, text: 'thread to delete'})
    await api.callTool('comment.reply', {cid, parts: [{type: 'text', text: 'a reply that should also go'}]})

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 30_000})

    await api.callToolApproved('comment.delete', {cid})

    await expect.poll(async () => pin.count(), {timeout: 30_000, interval: 200}).toBe(0)
    expect(await api.page.getByText('thread to delete').count()).toBe(0)
    expect(await api.page.getByText('a reply that should also go').count()).toBe(0)
  } finally {
    await api.dispose()
  }
})

test('the delete confirmation interrupts as an alertdialog named by one visible heading', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await createFloatingComment(api, {cid, text: 'thread to confirm'})

    await openThreadPin(api.page)

    const remove = api.page.getByRole('button', {name: 'Delete thread'})
    await remove.waitFor({timeout: 30_000})
    await remove.focus()
    await remove.press('Enter')

    const confirm = api.page.getByRole('alertdialog', {name: 'Delete this thread?'})
    await confirm.waitFor({timeout: 30_000})
    await expect.poll(async () => confirm.getByText('Delete this thread?').count()).toBe(1)
  } finally {
    await api.dispose()
  }
})
