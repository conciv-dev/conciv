import {createSignal, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {PermissionCard} from './permission-card.js'

const meta: Meta = {title: 'styled/tools/PermissionCard'}
export default meta
type Story = StoryObj

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[30rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

const pendingPart: ToolCallPart = {
  type: 'tool-call',
  id: 'p1',
  name: 'bash',
  arguments: JSON.stringify({command: 'rm -rf build'}),
  state: 'approval-requested',
  approval: {id: 'appr-1', needsApproval: true},
}

export const Pending: Story = {
  render: () => {
    const [decided, setDecided] = createSignal<boolean | null>(null)
    const ctx: ToolViewCtx = {
      apiBase: '',
      harnessId: 'story',
      sendMessage: () => {},
      respondApproval: (_id, approved) => setDecided(approved),
    }
    return frame(
      'chat-theme-dark',
      <>
        <PermissionCard part={pendingPart} result={undefined} ctx={ctx} label="Run this command?" />
        <div data-decided>{decided() === null ? 'undecided' : decided() ? 'approved' : 'rejected'}</div>
      </>,
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('group', {name: 'Approve this action?'})).toBeVisible()
    await expect(c.getByRole('button', {name: 'Deny'})).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: 'Allow'}))
    // Out-of-band decision fired, and the controls optimistically hide.
    await waitFor(() => expect(c.getByText('approved')).toBeVisible())
    await expect(c.queryByRole('button', {name: 'Allow'})).toBeNull()
  },
}

// No controls render once the part has settled (or there's no respondApproval seam).
export const Settled: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <PermissionCard
        part={{...pendingPart, state: 'complete'}}
        result={undefined}
        ctx={{apiBase: '', harnessId: 'story', sendMessage: () => {}, respondApproval: () => {}}}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.queryByRole('button', {name: 'Allow'})).toBeNull()
  },
}
