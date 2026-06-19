import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {For} from 'solid-js'
import {ScrollArea} from './scroll-area.js'

const meta: Meta<typeof ScrollArea.Root> = {title: 'ui-kit/ScrollArea', component: ScrollArea.Root}
export default meta
type Story = StoryObj<typeof ScrollArea.Root>

export const Default: Story = {
  render: () => (
    <ScrollArea.Root class="border border-pw-line rounded-pw-md bg-pw-sunken h-40 w-64">
      <ScrollArea.Viewport class="p-3 h-full w-full">
        <ScrollArea.Content>
          <For each={Array.from({length: 40}, (_, i) => i + 1)}>
            {(n) => <div class="text-[0.75rem] text-pw-text-2 font-pw-mono py-0.5">Line {n}</div>}
          </For>
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar>
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  ),
}
