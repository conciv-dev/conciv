import {type JSX} from 'solid-js'
import {Brain, FileText, Search} from 'lucide-solid'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Reasoning} from './reasoning.js'
import {ChainOfThought} from './chain-of-thought.js'

const meta: Meta = {title: 'styled/ChainOfThought'}
export default meta
type Story = StoryObj

// py-2 mirrors a step card's header padding, so the rail node centers on the line the same way it
// does for the real card steps in the thread.
const STEP = 'py-2 text-[length:var(--chat-text-md)] [color:var(--chat-text-2)] [font-family:var(--chat-mono)]'

// Steps render through ChainOfThought.Step (icon node + connecting rail line), exactly as the thread wires them.
function Steps(): JSX.Element {
  return (
    <>
      <ChainOfThought.Step icon={<Brain size={13} />}>
        <Reasoning text="Read the stack trace, then grep for the symbol to see where it is used." />
      </ChainOfThought.Step>
      <ChainOfThought.Step icon={<Search size={13} />}>
        <div class={STEP}>grep -rn "useChat" src/</div>
      </ChainOfThought.Step>
      <ChainOfThought.Step icon={<FileText size={13} />} last>
        <div class={STEP}>read packages/widget/chat.ts</div>
      </ChainOfThought.Step>
    </>
  )
}

function Frame(props: {children: JSX.Element}): JSX.Element {
  return <div class="p-3 w-96 [background:var(--chat-bg)]">{props.children}</div>
}

// Streaming: the chain is open and the label shimmers ("Working…").
export const Streaming: Story = {
  render: () => (
    <Frame>
      <ChainOfThought streaming>
        <Steps />
      </ChainOfThought>
    </Frame>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const label = await waitFor(() => c.getByText('Working…'))
    await expect(label).toBeVisible()
    // The shimmer animation is applied to the streaming label.
    await expect(getComputedStyle(label).animationName).toContain('pw-think-shimmer')
    // Open while streaming → the steps are visible.
    await expect(c.getByText(/grep -rn/)).toBeVisible()
  },
}

// Settled: collapsed to a quiet "Steps" summary; clicking expands the chain (animated).
export const SettledCollapsedThenExpand: Story = {
  render: () => (
    <Frame>
      <ChainOfThought>
        <Steps />
      </ChainOfThought>
    </Frame>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = await waitFor(() => c.getByText('Chain of Thought'))
    // Collapsed → steps are mounted-but-hidden (Ark Collapsible).
    await expect(c.getByText(/grep -rn/)).not.toBeVisible()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByText(/grep -rn/)).toBeVisible())
  },
}
