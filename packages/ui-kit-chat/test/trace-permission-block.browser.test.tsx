import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {PermissionScope} from '@conciv/protocol/chat-types'
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

type Decision = {id: string; approved: boolean; scope: PermissionScope | undefined}

function ctxRecording(decisions: Decision[]): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    catalog: {loaded: () => true, meta: () => undefined},
    addResult: () => {},
    respondApproval: (id, approved, scope) => decisions.push({id, approved, scope}),
  }
}

it('approves through the Approve button', async () => {
  const decisions: Decision[] = []
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

  await expect.element(page.getByText('Approved', {exact: true})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Approve'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'approval-1', approved: true, scope: 'once'}])
})

it('denies through the Deny button', async () => {
  const decisions: Decision[] = []
  mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

  await page.getByRole('button', {name: 'Deny'}).click()

  await expect.element(page.getByText('Denied', {exact: true})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Deny'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'approval-1', approved: false, scope: 'once'}])
})

it('approves only on the deliberate modifier-Enter, never on a bare Enter', async () => {
  const decisions: Decision[] = []
  mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

  await userEvent.tab()
  await expect.element(page.getByRole('group', {name: 'Permission request'})).toHaveFocus()

  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByRole('group', {name: 'Permission request'})).toBeVisible()
  expect(decisions).toEqual([])

  await userEvent.keyboard('{Meta>}{Enter}{/Meta}')

  await expect.element(page.getByText('Approved', {exact: true})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Approve'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'approval-1', approved: true, scope: 'once'}])
})

it('denies when Escape is pressed on the focused block', async () => {
  const decisions: Decision[] = []
  mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

  await userEvent.tab()
  await userEvent.keyboard('{Escape}')

  await expect.element(page.getByText('Denied', {exact: true})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Deny'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'approval-1', approved: false, scope: 'once'}])
})

it('announces the decision the reader just made', async () => {
  const decisions: Decision[] = []
  mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

  await page.getByRole('button', {name: 'Deny'}).click()

  await expect.element(page.getByRole('status')).toHaveTextContent('Denied')
})

it('keeps the announcement status paragraph a child of the list item, both while pending and after it settles', async () => {
  const decisions: Decision[] = []
  const container = mountView(() => (
    <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />
  ))

  await expect.element(page.getByRole('group', {name: 'Permission request'})).toBeVisible()
  expect(container.querySelector('li > p[role="status"]')).not.toBeNull()

  await page.getByRole('button', {name: 'Deny'}).click()

  await expect.element(page.getByRole('status')).toHaveTextContent('Denied')
  expect(container.querySelector('li > p[role="status"]')).not.toBeNull()
})

it('remembers the exact command for the session through the session action', async () => {
  const decisions: Decision[] = []
  mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

  await page.getByRole('button', {name: 'Allow for session'}).click()

  await expect.element(page.getByText('Approved', {exact: true})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Approve'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'approval-1', approved: true, scope: 'session'}])
})

it('offers the session action only for an approval that carries a command to remember', async () => {
  const decisions: Decision[] = []
  const commandless: ToolCallPart = {
    type: 'tool-call',
    id: 'call-2',
    name: 'canvas.delete',
    arguments: JSON.stringify({elementId: 'e1'}),
    state: 'approval-requested',
    approval: {id: 'approval-2', needsApproval: true},
  }
  mountView(() => <TracePermissionBlock part={commandless} ctx={ctxRecording(decisions)} target="canvas.delete" />)

  await expect.element(page.getByRole('button', {name: 'Approve'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Deny'})).toBeVisible()
  expect(document.querySelectorAll('button')).toHaveLength(2)
})

it('shows the expiry countdown only for a request that carries a deadline', async () => {
  const decisions: Decision[] = []
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
