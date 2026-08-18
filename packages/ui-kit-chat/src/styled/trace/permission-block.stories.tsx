import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {TracePermissionBlock} from './permission-block.js'

const meta: Meta = {title: 'ui-kit-chat/styled/trace/PermissionBlock'}
export default meta
type Story = StoryObj

const COMMAND = 'rm -rf apps/conciv/dist'

function askingPart(): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'call-1',
    name: 'Bash',
    arguments: JSON.stringify({command: COMMAND}),
    state: 'approval-requested',
    approval: {id: 'approval-1', needsApproval: true},
  }
}

function askingCtx(): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'story',
    sendMessage: () => {},
    catalog: {loaded: () => true, meta: () => undefined},
    addResult: () => {},
    respondApproval: () => {},
  }
}

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-terminal p-4 rounded-[var(--chat-radius-md)] w-[34rem] [background:var(--chat-panel)] [border:1px_solid_var(--chat-line)] [font-family:var(--chat-font)]">
      <ul class="m-0 p-0 list-none flex flex-col min-w-0">{child}</ul>
    </div>
  )
}

export const Asking: Story = {
  render: () =>
    frame(
      <TracePermissionBlock
        part={askingPart()}
        ctx={askingCtx()}
        target={COMMAND}
        explanation="Deletes the built widget bundle so the next build starts clean."
        last
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', {name: 'Permission request'})).toBeVisible()
    await expect(canvas.getByRole('button', {name: /Approve/})).toBeVisible()
    await expect(canvas.getByRole('button', {name: /Deny/})).toBeVisible()
  },
}

export const WithExpiry: Story = {
  render: () =>
    frame(
      <TracePermissionBlock
        part={askingPart()}
        ctx={askingCtx()}
        target={COMMAND}
        explanation="Deletes the built widget bundle so the next build starts clean."
        expiresAt={Date.now() + 120_000}
        last
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('timer')).toHaveTextContent(/expires in 1:\d\d|expires in 2:00/)
  },
}

export const Answered: Story = {
  render: () => frame(<TracePermissionBlock part={askingPart()} ctx={askingCtx()} target={COMMAND} last />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: /Deny/}))
    await waitFor(() => expect(canvas.queryByRole('group', {name: 'Permission request'})).toBeNull())
    await expect(canvas.getByRole('status')).toHaveTextContent('Denied')
  },
}
