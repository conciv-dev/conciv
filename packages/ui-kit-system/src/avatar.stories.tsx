import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {Avatar} from './avatar.js'

const meta: Meta = {title: 'ui-kit/Avatar'}
export default meta
type Story = StoryObj

export const Fallback: Story = {
  render: () => (
    <Avatar.Root>
      <Avatar.Image src="" alt="Ada" />
      <Avatar.Fallback>AD</Avatar.Fallback>
    </Avatar.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('AD')).toBeVisible())
  },
}

export const Image: Story = {
  render: () => (
    <Avatar.Root>
      <Avatar.Image
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Crect width='28' height='28' fill='%23c026d3'/%3E%3C/svg%3E"
        alt="Magenta"
      />
      <Avatar.Fallback>MZ</Avatar.Fallback>
    </Avatar.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByAltText('Magenta')).toBeInTheDocument())
  },
}
