import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {PermissionScope} from '@conciv/protocol/chat-types'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {INERT_TOOL_CTX} from '../src/store/tool-context.js'
import {PermissionCard} from '../src/tools/styled/permission-card.js'
import {mountView} from './mount-view.js'

type Decision = {id: string; approved: boolean; scope: PermissionScope | undefined}

function askingPart(input: Record<string, unknown>): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'p1',
    name: 'Bash',
    arguments: JSON.stringify(input),
    state: 'approval-requested',
    approval: {id: 'appr-1', needsApproval: true},
  }
}

function ctxRecording(decisions: Decision[]): ToolViewCtx {
  return {
    ...INERT_TOOL_CTX,
    respondApproval: (id, approved, scope) => decisions.push({id, approved, scope}),
  }
}

it('reports a one-shot allow for the plain Allow action', async () => {
  const decisions: Decision[] = []
  mountView(() => <PermissionCard part={askingPart({command: 'pnpm run build'})} ctx={ctxRecording(decisions)} />)

  await page.getByRole('button', {name: 'Allow', exact: true}).click()

  expect(decisions).toEqual([{id: 'appr-1', approved: true, scope: 'once'}])
})

it('reports a session allow for the session action on a command approval', async () => {
  const decisions: Decision[] = []
  mountView(() => <PermissionCard part={askingPart({command: 'pnpm run build'})} ctx={ctxRecording(decisions)} />)

  await page.getByRole('button', {name: 'Allow for session'}).click()

  expect(decisions).toEqual([{id: 'appr-1', approved: true, scope: 'session'}])
})

it('omits the session action when the approval carries no command to remember', async () => {
  const decisions: Decision[] = []
  mountView(() => <PermissionCard part={askingPart({elementId: 'e1'})} ctx={ctxRecording(decisions)} />)

  await expect.element(page.getByRole('button', {name: 'Allow', exact: true})).toBeVisible()
  expect(document.querySelectorAll('button')).toHaveLength(2)
})
