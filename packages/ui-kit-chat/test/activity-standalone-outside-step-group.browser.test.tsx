import 'virtual:uno.css'
import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import type {MessagePart, ToolCallPart, UIMessage} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Activity} from '../src/styled/activity.js'
import {mountView} from './mount-view.js'

function ConfirmCard(props: ToolCardProps): JSX.Element {
  return <p>Confirm this action for {props.part.name}</p>
}

const entries: ToolCardEntry[] = [{names: ['confirm_ui'], render: ConfirmCard, display: 'standalone'}]

function call(id: string, name: string, state: ToolCallPart['state']): MessagePart {
  return {type: 'tool-call', id, name, arguments: '{}', state}
}

function result(toolCallId: string, state: 'complete' | 'error'): MessagePart {
  return {type: 'tool-result', toolCallId, content: 'ok', state}
}

const messages: UIMessage[] = [
  {id: 'u1', role: 'user', parts: [{type: 'text', content: 'please confirm the deploy'}]},
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {type: 'thinking', content: 'checking the deploy target'},
      call('t1', 'read', 'complete'),
      result('t1', 'complete'),
      call('s1', 'confirm_ui', 'complete'),
      result('s1', 'complete'),
    ],
  },
]

it('renders a standalone tool card outside StepGroup collapsible', async () => {
  mountView(() => (
    <Activity.Root messages={messages} tools={entries}>
      <Activity.Timeline />
    </Activity.Root>
  ))

  const stepGroup = page.getByRole('button', {name: '2 steps'})
  await expect.element(stepGroup, {timeout: 3000}).toHaveAttribute('aria-expanded', 'false')

  await expect.element(page.getByText('Confirm this action for confirm_ui'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'read'}), {timeout: 3000}).not.toBeInTheDocument()

  await stepGroup.click()
  await expect.element(page.getByRole('button', {name: 'read'}), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('Confirm this action for confirm_ui'), {timeout: 3000}).toBeVisible()
})
