import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor, within} from 'storybook/test'
import {RelativeTime} from './relative-time.js'

const meta: Meta<typeof RelativeTime> = {title: 'ui-kit/RelativeTime', component: RelativeTime}
export default meta
type Story = StoryObj<typeof RelativeTime>

const ago = (ms: number): Date => new Date(Date.now() - ms)

export const HoursAgo: Story = {
  args: {value: ago(2 * 60 * 60 * 1000)},
  play: async ({canvasElement}) => {
    await waitFor(() => expect(within(canvasElement).getByText(/ago|hr|hour/i)).toBeInTheDocument())
  },
}

// A timestamp a hair in the future must not read as "in …" — it clamps to "now".
export const JustNow: Story = {
  args: {value: ago(-500)},
  play: async ({canvasElement}) => {
    await waitFor(() => expect(within(canvasElement).getByText(/now/i)).toBeInTheDocument())
    expect(within(canvasElement).queryByText(/\bin\b/)).toBeNull()
  },
}
