import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {NoteFrame} from './note-frame.js'

const meta: Meta = {title: 'ui-kit-chat/styled/NoteFrame'}
export default meta
type Story = StoryObj

function ChipInside(props: {heading: string; meta: string}) {
  return (
    <>
      <span class="text-chat-sm text-chat-text-hi block truncate">{props.heading}</span>
      <span class="text-chat-xs text-chat-text-3 block truncate">{props.meta}</span>
    </>
  )
}

export const StagedAndWide: Story = {
  render: () => (
    <div class="p-3 bg-chat-panel flex flex-col gap-3 max-w-80">
      <div class="flex flex-wrap gap-1">
        <NoteFrame>
          <ChipInside heading="Make this button primary" meta="Button.tsx" />
        </NoteFrame>
        <NoteFrame>
          <p>A plugin's own drawing</p>
        </NoteFrame>
      </div>
      <NoteFrame wide>
        <ChipInside heading="Make this button primary" meta="Button.tsx" />
      </NoteFrame>
      <NoteFrame wide>
        <p>A plugin's own drawing</p>
      </NoteFrame>
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)

    await expect(canvas.getAllByText('Make this button primary')).toHaveLength(2)
    await expect(canvas.getAllByText("A plugin's own drawing")).toHaveLength(2)
  },
}
