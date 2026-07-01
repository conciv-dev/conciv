import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent} from 'storybook/test'
import {createSignal} from 'solid-js'
import {Button} from './button.js'

const meta: Meta<typeof Button> = {title: 'ui-kit/Button', component: Button}
export default meta
type Story = StoryObj<typeof Button>

export const Variants: Story = {
  render: () => (
    <div class="flex gap-2 items-center">
      <Button variant="solid">Solid</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', {name: 'Solid'})).toBeVisible()
    await expect(c.getByRole('button', {name: 'Outline'})).toBeVisible()
    await expect(c.getByRole('button', {name: 'Ghost'})).toBeVisible()
    await expect(c.getByRole('button', {name: 'Danger'})).toBeVisible()
  },
}

export const Sizes: Story = {
  render: () => (
    <div class="flex gap-2 items-center">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="icon" aria-label="Icon">
        ✕
      </Button>
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <Button disabled aria-label="Disabled action">
      Disabled
    </Button>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', {name: /Disabled/})).toBeDisabled()
  },
}

export const Clickable: Story = {
  render: () => {
    const [count, setCount] = createSignal(0)
    return <Button onClick={() => setCount((n) => n + 1)}>Clicked {count()}</Button>
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const button = c.getByRole('button')
    await userEvent.click(button)
    await expect(c.getByRole('button', {name: /Clicked 1/})).toBeVisible()
  },
}
