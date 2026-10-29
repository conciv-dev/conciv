import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ReadValueCard} from '../src/client/cards/read-value-card.js'
import {storyAddResult, storyCtx, storyPart, storyResult} from '../src/client/cards/story.fixtures.js'

const SCREENSHOT_META: ToolViewMeta = {
  summary: 'capture the visible viewport as a webp image',
  category: 'read',
  icon: 'read',
  label: {running: 'Taking a screenshot', done: 'Took a screenshot'},
  mutating: false,
  mirrors: false,
}

function webpBase64(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 6
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no 2d context to paint the fixture image')
  context.fillStyle = 'rgb(0, 128, 255)'
  context.fillRect(0, 0, 8, 6)
  return canvas.toDataURL('image/webp').split(',')[1] ?? ''
}

it('shows an image result as the picture, not as a tree of its base64 parts', async () => {
  const image = webpBase64()
  render(() => (
    <ReadValueCard
      part={storyPart('page_screenshot', {})}
      result={storyResult([
        {type: 'image', source: {type: 'data', value: image, mimeType: 'image/webp'}},
        {type: 'text', content: JSON.stringify({width: 8, height: 6})},
      ])}
      ctx={storyCtx({page_screenshot: SCREENSHOT_META})}
      addResult={storyAddResult}
    />
  ))

  await page.getByRole('button').first().click()
  await expect.element(page.getByRole('img', {name: 'Took a screenshot'})).toBeVisible()
  await expect.element(page.getByRole('tree')).not.toBeInTheDocument()
})
