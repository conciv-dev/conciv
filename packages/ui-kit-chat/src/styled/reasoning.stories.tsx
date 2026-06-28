import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Reasoning} from './reasoning.js'

const meta: Meta = {title: 'styled/Reasoning'}
export default meta
type Story = StoryObj

const TEXT =
  'The error is a missing await on the async call — the promise resolves after the assertion runs, so the value is still pending.'

function Frame(props: {children: JSX.Element}): JSX.Element {
  return <div class="p-3 w-96 [background:var(--chat-bg)]">{props.children}</div>
}

// Streaming: open, the "Thinking…" label shimmers and the ghost text shows.
export const Streaming: Story = {
  render: () => (
    <Frame>
      <Reasoning streaming text={TEXT} />
    </Frame>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const label = await waitFor(() => c.getByText('Thinking…'))
    await expect(label).toBeVisible()
    await expect(getComputedStyle(label).animationName).toContain('pw-think-shimmer')
    await expect(c.getByText(/missing await/)).toBeVisible()
  },
}

// Settled: collapsed to a quiet "Reasoning" summary; clicking expands the ghost text (animated).
export const SettledCollapsedThenExpand: Story = {
  render: () => (
    <Frame>
      <Reasoning text={TEXT} />
    </Frame>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = await waitFor(() => c.getByText('Reasoning'))
    await expect(c.getByText(/missing await/)).not.toBeVisible()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByText(/missing await/)).toBeVisible())
  },
}

// Open by default (e.g. when surfaced standalone).
export const DefaultOpen: Story = {
  render: () => (
    <Frame>
      <Reasoning text={TEXT} defaultOpen />
    </Frame>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText(/missing await/)).toBeVisible())
  },
}
