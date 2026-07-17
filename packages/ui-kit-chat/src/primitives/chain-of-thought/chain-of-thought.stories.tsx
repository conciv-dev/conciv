import {createSignal, Show, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ChainOfThought, useChainOfThought} from './chain-of-thought.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/ChainOfThought'}
export default meta
type Story = StoryObj

function Body(props: {children: JSX.Element}): JSX.Element {
  const chain = useChainOfThought()
  return (
    <Show when={chain.open()}>
      <div class="text-[0.75rem] mt-1">{props.children}</div>
    </Show>
  )
}

export const TogglesCollapsed: Story = {
  render: () => (
    <ChainOfThought.Root>
      <ChainOfThought.AccordionTrigger class="text-[0.75rem] text-pw-text-2">Reasoning</ChainOfThought.AccordionTrigger>
      <Body>
        <div>Step 1: read the file</div>
        <div>Step 2: spot the missing await</div>
      </Body>
    </ChainOfThought.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = await waitFor(() => c.getByRole('button', {name: 'Reasoning'}))
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(c.queryByText('Step 1: read the file')).toBeNull()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByText('Step 1: read the file')).toBeVisible())
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  },
}

export const OpenWhileStreaming: Story = {
  render: () => (
    <ChainOfThought.Root streaming>
      <ChainOfThought.AccordionTrigger class="text-[0.75rem]">Thinking…</ChainOfThought.AccordionTrigger>
      <Body>
        <div>still working</div>
      </Body>
    </ChainOfThought.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('still working')).toBeVisible()
  },
}

function SettleHarness(props: {settleDelayMs: number}): JSX.Element {
  const [streaming, setStreaming] = createSignal(true)
  return (
    <div>
      <button type="button" onClick={() => setStreaming(false)}>
        settle
      </button>
      <ChainOfThought.Root streaming={streaming()} settleDelayMs={props.settleDelayMs}>
        <ChainOfThought.AccordionTrigger class="text-[0.75rem]">Thinking…</ChainOfThought.AccordionTrigger>
        <Body>
          <div>still working</div>
        </Body>
      </ChainOfThought.Root>
    </div>
  )
}

export const CollapsesAfterSettleDelay: Story = {
  render: () => <SettleHarness settleDelayMs={400} />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('still working')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: 'settle'}))
    await expect(c.getByText('still working')).toBeVisible()
    await waitFor(() => expect(c.queryByText('still working')).toBeNull(), {timeout: 1500})
  },
}

export const UserToggleOverridesAutoCollapse: Story = {
  render: () => <SettleHarness settleDelayMs={200} />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = c.getByRole('button', {name: 'Thinking…'})
    await expect(c.getByText('still working')).toBeVisible()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.queryByText('still working')).toBeNull())
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByText('still working')).toBeVisible())
    await userEvent.click(c.getByRole('button', {name: 'settle'}))
    await new Promise((resolve) => setTimeout(resolve, 600))
    await expect(c.getByText('still working')).toBeVisible()
  },
}
