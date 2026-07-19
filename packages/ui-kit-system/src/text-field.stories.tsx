import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {TextArea} from './text-field.js'

const meta: Meta = {title: 'ui-kit-system/TextArea'}
export default meta
type Story = StoryObj

const WRAPPING_TEXT =
  'the quick brown fox jumps over the lazy dog and keeps running far beyond the edge of the visible composer area'

export const RefitsWhenWidthShrinks: Story = {
  render: () => {
    const [width, setWidth] = createSignal(600)
    return (
      <div>
        <button type="button" onClick={() => setWidth(240)}>
          narrow
        </button>
        <div style={{width: `${width()}px`}}>
          <TextArea placeholder="Ask anything…" minRows={1} maxRows={12} value={WRAPPING_TEXT} />
        </div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const area = c.getByPlaceholderText('Ask anything…')
    await waitFor(() => expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight))

    await userEvent.click(c.getByText('narrow'))

    await waitFor(() => expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight))
  },
}

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
