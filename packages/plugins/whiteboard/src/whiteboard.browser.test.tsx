import {assert, describe, expect, test} from 'vitest'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {z} from 'zod'
import {mount, pluginEngine} from '@conciv/plugin-testkit/browser'
import whiteboard from './plugin-experimental.js'

describe('the open board follows changes made from another tab', () => {
  test('a comment added and then resolved from another tab shows on the open board as it happens', async () => {
    const user = userEvent.setup()
    const engine = await pluginEngine({plugins: ['@conciv/plugin-whiteboard']})
    const room = engine.sessionId
    await mount(whiteboard, {id: '@conciv/plugin-whiteboard', engine})
    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    expect(await screen.findByRole('button', {name: /^Comments/})).toBeVisible()
    expect(screen.queryByRole('button', {name: /^AI comment/})).not.toBeInTheDocument()

    await engine.tool('whiteboard_comment_create').call({
      cid: 'shelf',
      kind: 'floating',
      parts: [{type: 'text', text: 'The shelf needs more space'}],
      x: 200,
      y: 200,
      authorKind: 'ai',
    })
    expect(await screen.findByRole('button', {name: 'AI comment, open, unread'})).toBeVisible()
    expect(screen.getByRole('button', {name: /^Comments\s*1/})).toBeVisible()

    const [comment] = z
      .array(z.object({id: z.string()}))
      .parse(await engine.call('whiteboard', 'comments.list', {room}))
    assert(comment !== undefined)
    await engine.call('whiteboard', 'comments.update', {room, id: comment.id, patch: {status: 'resolved'}})
    expect(await screen.findByRole('button', {name: /^AI comment, resolved/})).toBeVisible()
  })
})
