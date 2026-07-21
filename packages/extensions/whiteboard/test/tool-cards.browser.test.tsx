import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {mountToolCard} from '@conciv/extension-testkit/card-harness'
import {CanvasOpCard} from '../src/tool/canvas/card.js'
import {CommentOpCard} from '../src/tool/comment/card.js'

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('CanvasOpCard (real browser)', () => {
  it('canvas.read renders an element count chip', async () => {
    mountToolCard(CanvasOpCard, {
      name: 'canvas.read',
      args: {scope: 'live'},
      content: JSON.stringify({elements: [{}, {}, {}], scope: 'live'}),
    })
    await expect.element(page.getByText('canvas.read')).toBeVisible()
    await expect.element(page.getByText('3 elements').first()).toBeVisible()
  })

  it('canvas.preview renders the result thumbnail', async () => {
    const content = JSON.stringify([
      {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
      {type: 'text', content: JSON.stringify({elements: 2})},
    ])
    mountToolCard(CanvasOpCard, {name: 'canvas.preview', content})
    await expect.element(page.getByRole('button', {name: /canvas\.preview/})).toBeVisible()
    await page.getByRole('button', {name: /canvas\.preview/}).click()
    await expect.element(page.getByRole('img', {name: 'canvas preview'})).toBeVisible()
  })

  it('canvas.delete renders a red op chip and no success-only body', async () => {
    mountToolCard(CanvasOpCard, {
      name: 'canvas.delete',
      args: {elementId: 'el_9'},
      content: JSON.stringify({deleted: 'el_9'}),
    })
    await expect.element(page.getByText('canvas.delete')).toBeVisible()
    await page.getByRole('button', {name: /canvas\.delete/}).click()
    await expect.element(page.getByText('delete el_9')).toBeVisible()
  })

  it('a failed op surfaces the error and reason', async () => {
    mountToolCard(CanvasOpCard, {
      name: 'canvas.preview',
      content: JSON.stringify({error: 'preview render failed', reason: 'no renderer'}),
    })
    await page.getByRole('button', {name: /canvas\.preview/}).click()
    await expect.element(page.getByText('preview render failed')).toBeVisible()
    await expect.element(page.getByText(/no renderer/)).toBeVisible()
  })
})

describe('CommentOpCard (real browser)', () => {
  it('comment.create shows the text preview and cid chip', async () => {
    mountToolCard(CommentOpCard, {
      name: 'comment.create',
      args: {
        cid: 'c_42',
        kind: 'floating',
        parts: [{type: 'text', text: 'Looks off-center'}],
        x: 1,
        y: 2,
        authorKind: 'ai',
      },
      content: JSON.stringify({cid: 'c_42'}),
    })
    await page.getByRole('button', {name: /comment\.create/}).click()
    await expect.element(page.getByText('Looks off-center')).toBeVisible()
    await expect.element(page.getByText('c_42').first()).toBeVisible()
  })

  it('comment.list shows the count', async () => {
    mountToolCard(CommentOpCard, {
      name: 'comment.list',
      args: {scope: 'session'},
      content: JSON.stringify({comments: [{}, {}]}),
    })
    await expect.element(page.getByText('2 comments').first()).toBeVisible()
  })

  it('comment.delete renders a red op chip', async () => {
    mountToolCard(CommentOpCard, {
      name: 'comment.delete',
      args: {cid: 'c_42'},
      content: JSON.stringify({cid: 'c_42', deleted: true}),
    })
    await page.getByRole('button', {name: /comment\.delete/}).click()
    await expect.element(page.getByText('delete', {exact: true})).toBeVisible()
    await expect.element(page.getByText('deleted').first()).toBeVisible()
  })

  it('pin.setState shows the pin state', async () => {
    mountToolCard(CommentOpCard, {
      name: 'pin.setState',
      args: {cid: 'c_42', pinState: 'locked'},
      content: JSON.stringify({cid: 'c_42', pinState: 'locked'}),
    })
    await expect.element(page.getByText('locked').first()).toBeVisible()
  })
})
