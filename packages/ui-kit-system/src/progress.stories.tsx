import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {Progress} from './progress.js'

const meta: Meta<typeof Progress.Root> = {title: 'ui-kit-system/Progress', component: Progress.Root}
export default meta
type Story = StoryObj<typeof Progress.Root>

export const Circle: Story = {
  render: () => (
    <Progress.Root value={25} class="block [--size:1.375rem] [--thickness:0.15625rem]" aria-label="Working">
      <Progress.Circle class="[transform-origin:center] anim-compact">
        <Progress.CircleTrack class="stroke-chat-line-2" />
        <Progress.CircleRange class="[stroke-linecap:round] stroke-chat-accent" />
      </Progress.Circle>
    </Progress.Root>
  ),
}

export const Bar: Story = {
  render: () => (
    <Progress.Root value={60} class="flex flex-col gap-1 w-64">
      <Progress.Label class="text-[0.75rem] text-chat-text-2">Uploading</Progress.Label>
      <Progress.Track class="rounded-chat-pill bg-chat-fill h-2 overflow-hidden">
        <Progress.Range class="bg-chat-accent h-full" />
      </Progress.Track>
    </Progress.Root>
  ),
}
