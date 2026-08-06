import {expect, test} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {bootWhiteboard, createFloatingComment, openCanvas, openThreadPin} from './canvas-it-helpers.js'

test('deleting a thread root removes its replies and pin', async () => {
  const api = await bootWhiteboard()
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await createFloatingComment(api, cid, 'thread to delete')
    await api.callToolApproved('comment.reply', {cid, parts: [{type: 'text', text: 'a reply that should also go'}]})

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 30_000})

    await api.callToolApproved('comment.delete', {cid})

    await expectLocator(pin).toHaveCount(0, {timeout: 30_000})
    expect(await api.page.getByText('thread to delete').count()).toBe(0)
    expect(await api.page.getByText('a reply that should also go').count()).toBe(0)
  } finally {
    await api.dispose()
  }
})

test('the delete confirmation interrupts as an alertdialog named by one visible heading', async () => {
  const api = await bootWhiteboard()
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await createFloatingComment(api, cid, 'thread to confirm')

    await openThreadPin(api.page)

    const remove = api.page.getByRole('button', {name: 'Delete thread'})
    await remove.waitFor({timeout: 30_000})
    await remove.focus()
    await remove.press('Enter')

    const confirm = api.page.getByRole('alertdialog', {name: 'Delete this thread?'})
    await confirm.waitFor({timeout: 30_000})
    await expectLocator(confirm.getByText('Delete this thread?')).toHaveCount(1, {timeout: 30_000})
  } finally {
    await api.dispose()
  }
})
