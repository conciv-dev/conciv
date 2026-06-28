import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {TextArea} from './text-field.js'

const meta: Meta = {title: 'ui-kit/TextArea'}
export default meta
type Story = StoryObj

export const Autosize: Story = {
  render: () => {
    const [value, setValue] = createSignal('')
    return (
      <TextArea
        placeholder="Ask anything…"
        minRows={1}
        maxRows={5}
        value={value()}
        onInput={(event) => setValue(event.currentTarget.value)}
      />
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const area = c.getByPlaceholderText('Ask anything…')
    const before = area.clientHeight
    await userEvent.type(area, 'line one\nline two\nline three')
    await waitFor(() => expect(area.clientHeight).toBeGreaterThan(before))
  },
}
