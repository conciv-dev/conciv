import {Index, type JSX} from 'solid-js'
import Brain from 'lucide-solid/icons/brain'
import FileText from 'lucide-solid/icons/file-text'
import Search from 'lucide-solid/icons/search'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Reasoning} from './reasoning.js'
import {ChainOfThought} from './chain-of-thought.js'

const meta: Meta = {title: 'ui-kit-chat/styled/ChainOfThought'}
export default meta
type Story = StoryObj

const STEP = 'py-2 text-[length:var(--chat-text-md)] [color:var(--chat-text-2)] [font-family:var(--chat-mono)]'

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
    await expect(c.getByText(/grep -rn/)).toBeVisible()
  },
}

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

    expect(c.queryByText(/grep -rn/)).toBeNull()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByText(/grep -rn/)).toBeVisible())
  },
}

export const StreamingPreviewCapsHeight: Story = {
  render: () => (
    <Frame>
      <ChainOfThought streaming>
        <Index each={Array.from({length: 30}, (_, index) => index)}>
          {(step) => (
            <ChainOfThought.Step icon={<Search size={13} />} last={step() === 29}>
              <div class={STEP}>step number {step()}</div>
            </ChainOfThought.Step>
          )}
        </Index>
      </ChainOfThought>
    </Frame>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('step number 29')).toBeVisible())
    await expect(canvasElement.getBoundingClientRect().height).toBeLessThan(500)
  },
}

function ManySteps(): JSX.Element {
  return (
    <Index each={Array.from({length: 30}, (_, index) => index)}>
      {(step) => (
        <ChainOfThought.Step icon={<Search size={13} />} last={step() === 29}>
          <div class={STEP}>step number {step()}</div>
        </ChainOfThought.Step>
      )}
    </Index>
  )
}

export const CappedVsGrowSideBySide: Story = {
  render: () => (
    <div class="p-3 flex gap-4 [background:var(--chat-bg)]">
      <div class="w-96">
        <div class="text-[length:var(--chat-text-xs)] pb-1.5 [color:var(--chat-text-3)]">grow=false (default)</div>
        <ChainOfThought streaming>
          <ManySteps />
        </ChainOfThought>
      </div>
      <div class="w-96">
        <div class="text-[length:var(--chat-text-xs)] pb-1.5 [color:var(--chat-text-3)]">grow=true</div>
        <ChainOfThought streaming grow>
          <ManySteps />
        </ChainOfThought>
      </div>
    </div>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getAllByText('step number 29')).toHaveLength(2))
    await expect(c.getAllByText('step number 0')).toHaveLength(2)
  },
}
