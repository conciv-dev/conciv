import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, within} from 'storybook/test'
import {createSignal} from 'solid-js'
import {ApprovalModal, type PendingApproval} from './approval-modal.js'

function Harness() {
  const [decided, setDecided] = createSignal('')
  const [approvals, setApprovals] = createSignal<PendingApproval[]>([])
  setApprovals([{id: 'a1', title: 'ls -la /etc', decide: (ok) => (setDecided(`a1:${ok}`), setApprovals([]))}])
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
