import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Toast, createToaster} from './toast.js'
import {Button} from './button.js'

const meta: Meta = {title: 'ui-kit/Toast'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const toaster = createToaster({placement: 'bottom-end', overlap: true, gap: 12})
    return (
      <div>
        <Button
          onClick={() =>
            toaster.create({title: 'Session compacted', description: 'Older turns were summarized.', type: 'info'})
          }
        >
          Notify
        </Button>
        <Toast.Toaster toaster={toaster} />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('Notify'))
    await waitFor(() => expect(c.getByText('Session compacted')).toBeVisible())
    await userEvent.click(c.getByLabelText('Dismiss notification'))
    await waitFor(() => expect(c.queryByText('Session compacted')).toBeNull())
  },
}
