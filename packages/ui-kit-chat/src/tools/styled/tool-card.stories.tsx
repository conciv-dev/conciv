import {createSignal, type JSX} from 'solid-js'
import Wrench from 'lucide-solid/icons/wrench'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolCallState, ToolResultPart} from '@tanstack/ai-client'
import {ToolCard} from './tool-card.js'

const meta: Meta = {title: 'ui-kit-chat/tools/styled/ToolCard'}
export default meta
type Story = StoryObj

const BODY = 'confirm before clicking'

function partIn(state: ToolCallState): ToolCallPart {
  return {type: 'tool-call', id: 'm1', name: 'page_click', arguments: '{}', input: {}, state}
}

const CLICKED: ToolResultPart = {type: 'tool-result', toolCallId: 'm1', content: 'clicked', state: 'complete'}

function frame(child: JSX.Element): JSX.Element {
  return <div class="p-4 w-[28rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
}

function ApprovalHarness(): JSX.Element {
  const [state, setState] = createSignal<ToolCallState>('input-complete')
  const [folded, setFolded] = createSignal(false)
  const result = () => (state() === 'approval-responded' ? CLICKED : undefined)
  return (
    <div>
      <button type="button" onClick={() => setState('approval-requested')}>
        request approval
      </button>
      <button type="button" onClick={() => setState('approval-responded')}>
        resolve approval
      </button>
      <button type="button" onClick={() => setFolded(true)}>
        send next prompt
      </button>
      <ToolCard Icon={Wrench} title="click #submit" part={partIn(state())} result={result()} folded={folded()}>
        {BODY}
      </ToolCard>
    </div>
  )
}

export const ApprovalSettlesInPlace: Story = {
  render: () => frame(<ApprovalHarness />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    expect(c.queryByText(BODY)).toBeNull()

    await userEvent.click(c.getByRole('button', {name: 'request approval'}))
    await waitFor(() => expect(c.getByText(BODY)).toBeVisible())
    await expect(c.getByRole('img', {name: 'needs approval'})).toBeVisible()

    await userEvent.click(c.getByRole('button', {name: 'resolve approval'}))
    await waitFor(() => expect(c.getByRole('img', {name: 'complete'})).toBeVisible())
    await expect(c.getByText(BODY)).toBeVisible()

    const header = c.getByRole('button', {name: /click #submit/})
    await userEvent.click(c.getByRole('button', {name: 'send next prompt'}))
    await waitFor(() => expect(header).toHaveAttribute('aria-expanded', 'false'))

    await userEvent.click(header)
    await waitFor(() => expect(header).toHaveAttribute('aria-expanded', 'true'))
  },
}
