import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {TracePermissionBlock} from '../src/styled/trace/permission-block.js'
import {mountView} from './mount-view.js'

const TARGET = 'rm -rf node_modules/.cache'

function askingPart(): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'call-1',
    name: 'Bash',
    arguments: JSON.stringify({command: TARGET}),
    state: 'approval-requested',
    approval: {id: 'approval-1', needsApproval: true},
  }
}

function ctxRecording(decisions: Array<{id: string; approved: boolean}>): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    catalog: {loaded: () => true, meta: () => undefined},
    addResult: () => {},
    respondApproval: (id, approved) => decisions.push({id, approved}),
  }
}

it('approves through the Approve button', async () => {
  const decisions: Array<{id: string; approved: boolean}> = []
  mountView(() => (
    <TracePermissionBlock
      part={askingPart()}
      ctx={ctxRecording(decisions)}
      target={TARGET}
      explanation="Deletes the cached build output."
    />
  ))

  await expect.element(page.getByRole('group', {name: 'Permission request'})).toBeVisible()
  await expect.element(page.getByText('Deletes the cached build output.')).toBeVisible()
  await expect.element(page.getByText(TARGET)).toBeVisible()

  await page.getByRole('button', {name: 'Approve'}).click()

  await expect.element(page.getByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'approval-1', approved: true}])
})

it('denies through the Deny button', async () => {
  const decisions: Array<{id: string; approved: boolean}> = []
  mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

  await page.getByRole('button', {name: 'Deny'}).click()

  await expect.element(page.getByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'approval-1', approved: false}])
})

it('approves only on the deliberate modifier-Enter, never on a bare Enter', async () => {
  const decisions: Array<{id: string; approved: boolean}> = []
  mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

  await userEvent.tab()
  await expect.element(page.getByRole('group', {name: 'Permission request'})).toHaveFocus()

  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByRole('group', {name: 'Permission request'})).toBeVisible()
  expect(decisions).toEqual([])

  await userEvent.keyboard('{Meta>}{Enter}{/Meta}')

  await expect.element(page.getByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'approval-1', approved: true}])
})

it('denies when Escape is pressed on the focused block', async () => {
  const decisions: Array<{id: string; approved: boolean}> = []
  mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

  await userEvent.tab()
  await userEvent.keyboard('{Escape}')

  await expect.element(page.getByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'approval-1', approved: false}])
})

it('announces the decision the reader just made', async () => {
  const decisions: Array<{id: string; approved: boolean}> = []
  mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

  await page.getByRole('button', {name: 'Deny'}).click()

  await expect.element(page.getByRole('status')).toHaveTextContent('Denied')
})

it('shows the expiry countdown only for a request that carries a deadline', async () => {
  const decisions: Array<{id: string; approved: boolean}> = []
  mountView(() => (
    <>
      <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />
      <TracePermissionBlock
        part={askingPart()}
        ctx={ctxRecording(decisions)}
        target={TARGET}
        expiresAt={Date.now() + 90_000}
      />
    </>
  ))

  await expect.element(page.getByRole('timer')).toBeVisible()
  await expect.element(page.getByRole('timer')).toHaveTextContent(/expires in 1:\d\d/)
  expect(document.querySelectorAll('[role="timer"]')).toHaveLength(1)
})
