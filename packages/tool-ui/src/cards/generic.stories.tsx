import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, within} from 'storybook/test'
import {GenericCard} from './generic.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof GenericCard> = {title: 'tool-ui/Generic', component: GenericCard}
export default meta
type Story = StoryObj<typeof GenericCard>

const unknown = (over = {}) => callPart({name: 'mcp__foo__bar', input: {a: 1, b: 'two'}, ...over})

// Interaction test: the raw args/result are tucked behind a details that opens on click.
export const Complete: Story = {
  args: {part: unknown(), result: resultPart('{"ok":true}'), ctx: noopCtx()},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('mcp__foo__bar')).toBeInTheDocument()
    await expect(c.getByText(/"ok":true/)).not.toBeVisible()
    await userEvent.click(c.getByText('details'))
    await expect(c.getByText(/"ok":true/)).toBeVisible()
  },
}

export const Errored: Story = {
  args: {part: unknown(), result: resultPart('boom', {state: 'error', error: 'tool exploded'}), ctx: noopCtx()},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('tool exploded')).toBeInTheDocument()
  },
}

export const Streaming: Story = {
  args: {
    part: unknown({state: 'input-streaming', input: undefined, arguments: '{"a":1,"b":'}),
    result: undefined,
    ctx: noopCtx(),
  },
}
