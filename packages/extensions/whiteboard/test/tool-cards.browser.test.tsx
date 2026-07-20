import {afterEach, describe, expect, it} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import type {ToolUIComponent, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {CanvasOpCard} from '../src/tool/canvas/card.js'
import {CommentOpCard} from '../src/tool/comment/card.js'

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'claude', sendMessage: () => {}}

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

function mount(Card: ToolUIComponent, name: string, args: unknown, content?: string): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const part = {type: 'tool-call', id: 't1', name, arguments: JSON.stringify(args), state: 'input-complete'} as const
  const result =
    content === undefined ? undefined : ({type: 'tool-result', toolCallId: 't1', content, state: 'complete'} as const)
  disposers.push(render(() => <Card part={part} result={result} ctx={ctx} />, host))
}

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('CanvasOpCard (real browser)', () => {
  it('canvas.read renders an element count chip', async () => {
    mount(CanvasOpCard, 'canvas.read', {scope: 'live'}, JSON.stringify({elements: [{}, {}, {}], scope: 'live'}))
    await expect.element(page.getByText('canvas.read')).toBeVisible()
    await expect.element(page.getByText('3 elements').first()).toBeVisible()
  })

  it('canvas.preview renders the result thumbnail', async () => {
    const content = JSON.stringify([
      {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
      {type: 'text', content: JSON.stringify({elements: 2})},
    ])
    mount(CanvasOpCard, 'canvas.preview', {}, content)
    await expect.element(page.getByRole('button', {name: /canvas\.preview/})).toBeVisible()
    await page.getByRole('button', {name: /canvas\.preview/}).click()
    await expect.element(page.getByRole('img', {name: 'canvas preview'})).toBeVisible()
  })

  it('canvas.delete renders a red op chip and no success-only body', async () => {
    mount(CanvasOpCard, 'canvas.delete', {elementId: 'el_9'}, JSON.stringify({deleted: 'el_9'}))
    await expect.element(page.getByText('canvas.delete')).toBeVisible()
    await page.getByRole('button', {name: /canvas\.delete/}).click()
    await expect.element(page.getByText('delete el_9')).toBeVisible()
  })

  it('a failed op surfaces the error and reason', async () => {
    mount(CanvasOpCard, 'canvas.preview', {}, JSON.stringify({error: 'preview render failed', reason: 'no renderer'}))
    await page.getByRole('button', {name: /canvas\.preview/}).click()
    await expect.element(page.getByText('preview render failed')).toBeVisible()
    await expect.element(page.getByText(/no renderer/)).toBeVisible()
  })
})

describe('CommentOpCard (real browser)', () => {
  it('comment.create shows the text preview and cid chip', async () => {
    mount(
      CommentOpCard,
      'comment.create',
      {cid: 'c_42', kind: 'floating', parts: [{type: 'text', text: 'Looks off-center'}], x: 1, y: 2, authorKind: 'ai'},
      JSON.stringify({cid: 'c_42'}),
    )
    await page.getByRole('button', {name: /comment\.create/}).click()
    await expect.element(page.getByText('Looks off-center')).toBeVisible()
    await expect.element(page.getByText('c_42').first()).toBeVisible()
  })

  it('comment.list shows the count', async () => {
    mount(CommentOpCard, 'comment.list', {scope: 'session'}, JSON.stringify({comments: [{}, {}]}))
    await expect.element(page.getByText('2 comments').first()).toBeVisible()
  })

  it('comment.delete renders a red op chip', async () => {
    mount(CommentOpCard, 'comment.delete', {cid: 'c_42'}, JSON.stringify({cid: 'c_42', deleted: true}))
    await page.getByRole('button', {name: /comment\.delete/}).click()
    await expect.element(page.getByText('delete', {exact: true})).toBeVisible()
    await expect.element(page.getByText('deleted').first()).toBeVisible()
  })

  it('pin.setState shows the pin state', async () => {
    mount(
      CommentOpCard,
      'pin.setState',
      {cid: 'c_42', pinState: 'locked'},
      JSON.stringify({cid: 'c_42', pinState: 'locked'}),
    )
    await expect.element(page.getByText('locked').first()).toBeVisible()
  })
})
