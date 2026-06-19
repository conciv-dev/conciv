import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {Progress} from './progress.js'

const meta: Meta<typeof Progress.Root> = {title: 'ui-kit/Progress', component: Progress.Root}
export default meta
type Story = StoryObj<typeof Progress.Root>

export const Circle: Story = {
  render: () => (
    <Progress.Root value={25} class="block [--size:1.375rem] [--thickness:0.15625rem]" aria-label="Working">
      <Progress.Circle class="[transform-origin:center] anim-compact">
        <Progress.CircleTrack class="stroke-pw-line-2" />
        <Progress.CircleRange class="[stroke-linecap:round] stroke-pw-accent" />
      </Progress.Circle>
    </Progress.Root>
  ),
}

export const Bar: Story = {
  render: () => (
    <Progress.Root value={60} class="flex flex-col gap-1 w-64">
      <Progress.Label class="text-[0.75rem] text-pw-text-2">Uploading</Progress.Label>
      <Progress.Track class="rounded-pw-pill bg-pw-fill h-2 overflow-hidden">
        <Progress.Range class="bg-pw-accent h-full" />
      </Progress.Track>
    </Progress.Root>
  ),
}
