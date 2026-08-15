import {render} from '@solidjs/testing-library'
import {expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {GRAB_FILE_NAME, GRAB_MIME} from '@conciv/grab/grab-attachment'
import {GrabCard} from '../src/client/cards/grab-card.js'
import {mountAttachment} from './fixtures/attachment-harness.js'

const PAYLOAD = JSON.stringify({
  text: '<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9',
  snippet: '<h1 class="title">Start simple</h1>',
  source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
  rect: {x: 0, y: 0, width: 320, height: 48},
  preview: {kind: 'dom', html: '<h1>Start simple</h1>', width: 320, height: 48},
})

function mount(payload: string = PAYLOAD) {
  return render(() => mountAttachment(new File([payload], GRAB_FILE_NAME, {type: GRAB_MIME}), () => <GrabCard />))
}

test('the card shows the snapshot and its source label', async () => {
  mount()

  await expect.element(page.getByTitle('Grabbed element snapshot')).toBeVisible()
  await expect.element(page.getByText('Hero at src/routes/index.tsx:12')).toBeVisible()
})

test('clicking the card opens a dialog that can reveal the agent text', async () => {
  mount()

  await userEvent.click(page.getByRole('button', {name: 'Open grabbed element'}))
  await expect.element(page.getByRole('dialog', {name: 'Grabbed element'})).toBeVisible()

  await userEvent.click(page.getByRole('button', {name: 'What the agent sees'}))

  await expect.element(page.getByText('<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9')).toBeVisible()
})

test('a payload with no preview falls back to the agent text', async () => {
  mount(JSON.stringify({text: 'grabbed thing at a.tsx:1:1', source: null, rect: null, preview: null}))

  await expect.element(page.getByText('grabbed thing at a.tsx:1:1')).toBeVisible()
})

test('an unreadable payload reports that the grab could not be read', async () => {
  mount('not a grab payload at all')

  await expect.element(page.getByRole('status')).toHaveTextContent('Grabbed element could not be read')
})

test('an image preview renders as the snapshot image', async () => {
  mount(
    JSON.stringify({
      text: 'grabbed thing at a.tsx:1:1',
      source: null,
      rect: null,
      preview: {
        kind: 'image',
        dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
        width: 40,
        height: 20,
      },
    }),
  )

  await expect.element(page.getByRole('img', {name: 'Grabbed element snapshot'})).toBeVisible()
})
