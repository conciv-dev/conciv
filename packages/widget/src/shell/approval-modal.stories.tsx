import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, within} from 'storybook/test'
import {createSignal} from 'solid-js'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ApprovalModal, type PendingApproval} from './approval-modal.js'

function Harness() {
  const [decided, setDecided] = createSignal('')
  const [approvals, setApprovals] = createSignal<PendingApproval[]>([])
  const part: ToolCallPart = {
    type: 'tool-call',
    id: 't1',
    name: 'bash',
    arguments: JSON.stringify({command: 'ls -la /etc'}),
    state: 'approval-requested',
    approval: {id: 'a1', needsApproval: true},
  }
  const ctx: ToolViewCtx = {
    apiBase: '',
    harnessId: 'claude',
    sendMessage: () => {},
    respondApproval: (id, approved) => {
      setDecided(`${id}:${approved}`)
      setApprovals([])
    },
  }
  setApprovals([{id: 'a1', part, ctx, label: 'ls -la /etc'}])
  return (
    <div>
      <span data-testid="decided">{decided()}</span>
      <ApprovalModal visible={() => true} approvals={approvals} />
    </div>
  )
}

const meta: Meta = {title: 'widget/ApprovalModal'}
export default meta
type Story = StoryObj

export const AllowsACommand: Story = {
  render: () => <Harness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await c.findByText('ls -la /etc')
    await userEvent.click(c.getByRole('button', {name: /Allow/}))
    await expect(c.getByTestId('decided')).toHaveTextContent('a1:true')
  },
}

export const DeniesACommand: Story = {
  render: () => <Harness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await c.findByText('ls -la /etc')
    await userEvent.click(c.getByRole('button', {name: /Deny/}))
    await expect(c.getByTestId('decided')).toHaveTextContent('a1:false')
  },
}
