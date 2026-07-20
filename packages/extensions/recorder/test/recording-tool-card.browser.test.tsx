import {afterEach, describe, expect, it} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import type {ToolCardProps, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {RecordingToolCard} from '../src/tool/card.js'

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'claude', sendMessage: () => {}}

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

function mount(name: string, args: unknown, content?: string): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const part = {type: 'tool-call', id: 't1', name, arguments: JSON.stringify(args), state: 'input-complete'} as const
  const result =
    content === undefined ? undefined : ({type: 'tool-result', toolCallId: 't1', content, state: 'complete'} as const)
  const props: ToolCardProps = {part, result, ctx}
  disposers.push(render(() => <RecordingToolCard {...props} />, host))
}

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const LOG = '+0.0s [click] button "Save"\n+2.5s [navigation] /settings\n+4.1s [console] error: boom'

describe('RecordingToolCard (real browser)', () => {
  it('recording_pull shows the window summary and the action list', async () => {
    const content = JSON.stringify([
      {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
      {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
      {type: 'text', content: LOG},
    ])
    mount('recording_pull', {secondsBack: 30, keyframes: 3}, content)
    await expect.element(page.getByText('last 30s · 3 actions · 2 keyframes')).toBeVisible()
    await page.getByRole('button', {name: /recording_pull/}).click()
    await expect.element(page.getByText('button "Save"')).toBeVisible()
    await expect.element(page.getByText('navigation')).toBeVisible()
  })

  it('recording_start shows the capture id', async () => {
    mount('recording_start', {}, JSON.stringify({captureId: 'cap_1', startedAt: 1}))
    await expect.element(page.getByText('capture started')).toBeVisible()
    await page.getByRole('button', {name: /recording_start/}).click()
    await expect.element(page.getByText('cap_1')).toBeVisible()
  })

  it('a stop error renders the error state', async () => {
    mount('recording_stop', {captureId: 'cap_9', keyframes: 0}, JSON.stringify({error: 'no active capture cap_9'}))
    await page.getByRole('button', {name: /recording_stop/}).click()
    await expect.element(page.getByText('no active capture cap_9')).toBeVisible()
  })
})
