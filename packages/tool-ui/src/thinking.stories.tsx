import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ChainOfThought, Reasoning} from './thinking.js'

const meta: Meta<typeof ChainOfThought> = {title: 'tool-ui/ChainOfThought', component: ChainOfThought}
export default meta
type Story = StoryObj<typeof ChainOfThought>

// Settled: a completed chain folds to a "Thought for Xs" trigger; the reasoning is hidden until the
// user expands it. Assert the trigger label (collapsed body is behind the disclosure).
export const Settled: Story = {
  args: {
    streaming: false,
    durationMs: 1800,
    children: <Reasoning content="The user wants to know what is on the page. Let me take a snapshot." />,
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', {name: /Thought for 1\.8s/})).toBeVisible()
  },
}

// No measured duration → the generic "Thought process" label.
export const NoDuration: Story = {
  args: {streaming: false, children: <Reasoning content="Checking the form fields before I fill them." />},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', {name: /Thought process/})).toBeVisible()
  },
}

// Streaming: the live "Thinking…" trigger, auto-expanded so the reasoning is visible as it streams.
export const Streaming: Story = {
  args: {
    streaming: true,
    children: <Reasoning content="The user wants to know what is on the page. Let me take a snapshot." />,
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', {name: /Thinking/})).toBeVisible()
    await expect(c.getByText(/take a snapshot/)).toBeVisible()
  },
}

// The disclosure toggles repeatedly (regression guard for the "works once" bug): settled → expand →
// collapse → expand, asserting the body's visibility each time via the Collapsible.
export const TogglesRepeatedly: Story = {
  args: {streaming: false, children: <Reasoning content="A reasoning step that hides and shows." />},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = c.getByRole('button', {name: /Thought process/})
    const body = c.getByText(/hides and shows/)
    await waitFor(() => expect(body).not.toBeVisible())
    await userEvent.click(trigger)
    await waitFor(() => expect(body).toBeVisible())
    await userEvent.click(trigger)
    await waitFor(() => expect(body).not.toBeVisible())
    await userEvent.click(trigger)
    await waitFor(() => expect(body).toBeVisible())
  },
}

// Structured: recognizable labeled lines parse into glyph rows (auto-expanded here via streaming).
export const Structured: Story = {
  args: {
    streaming: true,
    children: (
      <Reasoning content={'goal: ship the tool cards\nobservation: the diff card renders\nnext: wire the widget'} />
    ),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('ship the tool cards')).toBeVisible()
    await expect(c.getByText('wire the widget')).toBeVisible()
  },
}
