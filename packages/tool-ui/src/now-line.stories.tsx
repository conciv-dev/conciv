import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, fn, userEvent, within} from 'storybook/test'
import {NowLine} from './now-line.js'

const meta: Meta<typeof NowLine> = {title: 'tool-ui/NowLine', component: NowLine}
export default meta
type Story = StoryObj<typeof NowLine>

// Interaction test: the stop button invokes onStop.
export const Running: Story = {
  args: {title: 'Editing styles.css', onStop: fn()},
  play: async ({canvasElement, args}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Editing styles.css')).toBeInTheDocument()
    await userEvent.click(c.getByLabelText('Stop'))
    await expect(args.onStop).toHaveBeenCalledOnce()
  },
}
