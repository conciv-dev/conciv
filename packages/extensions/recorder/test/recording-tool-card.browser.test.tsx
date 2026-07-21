import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {mountToolCard} from '@conciv/extension-testkit/card-harness'
import {RecordingToolCard} from '../src/tool/card.js'

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const LOG = '+0.0s [click] button "Save"\n+2.5s [navigation] /settings\n+4.1s [console] error: boom'

describe('RecordingToolCard (real browser)', () => {
  it('recording_pull shows the window summary and the action list', async () => {
    const content = JSON.stringify([
      {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
      {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
      {type: 'text', content: LOG},
    ])
    mountToolCard(RecordingToolCard, {name: 'recording_pull', args: {secondsBack: 30, keyframes: 3}, content})
    await expect.element(page.getByText('last 30s · 3 actions · 2 keyframes')).toBeVisible()
    await page.getByRole('button', {name: /recording_pull/}).click()
    await expect.element(page.getByText('button "Save"')).toBeVisible()
    await expect.element(page.getByText('navigation')).toBeVisible()
  })

  it('recording_start shows the capture id', async () => {
    mountToolCard(RecordingToolCard, {
      name: 'recording_start',
      content: JSON.stringify({captureId: 'cap_1', startedAt: 1}),
    })
    await expect.element(page.getByText('capture started')).toBeVisible()
    await page.getByRole('button', {name: /recording_start/}).click()
    await expect.element(page.getByText('cap_1')).toBeVisible()
  })

  it('a stop error renders the error state', async () => {
    mountToolCard(RecordingToolCard, {
      name: 'recording_stop',
      args: {captureId: 'cap_9', keyframes: 0},
      content: JSON.stringify({error: 'no active capture cap_9'}),
    })
    await page.getByRole('button', {name: /recording_stop/}).click()
    await expect.element(page.getByText('no active capture cap_9')).toBeVisible()
  })
})
