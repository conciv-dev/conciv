import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {ReflectionCard} from './reflection.js'

const meta: Meta<typeof ReflectionCard> = {title: 'tool-ui/Reflection', component: ReflectionCard}
export default meta
type Story = StoryObj<typeof ReflectionCard>

// Structured: labeled lines parse into glyph rows.
export const Structured: Story = {
  args: {content: 'goal: ship the tool cards\nobservation: the diff card renders\nnext: wire the widget'},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('ship the tool cards')).toBeInTheDocument()
    await expect(c.getByText('wire the widget')).toBeInTheDocument()
  },
}

// Freeform: arbitrary thinking renders as-is.
export const Freeform: Story = {
  args: {content: 'Let me think about how the page driver resolves the element before the click.'},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText(/page driver resolves the element/)).toBeInTheDocument()
  },
}
