import {createSignal, type JSX} from 'solid-js'
import Wrench from 'lucide-solid/icons/wrench'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolStatus} from '../primitives/tool-status.js'
import {ToolCard} from './tool-card.js'

const meta: Meta = {title: 'ui-kit-chat/tools/styled/ToolCard'}
export default meta
type Story = StoryObj

const PART = {type: 'tool-call', id: 'm1', name: 'page.click', arguments: '{}', input: {}, state: 'complete'} as const

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 w-[28rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
  )
}

function ApprovalHarness(): JSX.Element {
  const [status, setStatus] = createSignal<ToolStatus>('running')
  return (
    <div>
      <button type="button" onClick={() => setStatus('approval')}>
        request approval
      </button>
      <button type="button" onClick={() => setStatus('complete')}>
        resolve approval
      </button>
      <ToolCard Icon={Wrench} title="click #submit" part={PART} result={undefined} status={status()}>
        confirm before clicking
      </ToolCard>
    </div>
  )
}

export const ApprovalForceOpensOnce: Story = {
  render: () => frame(<ApprovalHarness />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('confirm before clicking')).not.toBeVisible()

    await userEvent.click(c.getByRole('button', {name: 'request approval'}))
    await waitFor(() => expect(c.getByText('confirm before clicking')).toBeVisible())

    await userEvent.click(c.getByRole('button', {name: 'resolve approval'}))
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(c.getByText('confirm before clicking')).toBeVisible()

    await userEvent.click(c.getByText('click #submit'))
    await waitFor(() => expect(c.getByText('confirm before clicking')).not.toBeVisible())

    await userEvent.click(c.getByRole('button', {name: 'request approval'}))
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(c.getByText('confirm before clicking')).not.toBeVisible()
  },
}
