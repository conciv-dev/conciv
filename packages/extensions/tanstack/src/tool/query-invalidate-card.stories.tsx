import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/QueryInvalidateCard'}
export default meta
type Story = StoryObj

export const Done: Story = {
  render: () =>
    traceFrame('1 query invalidate', [
      traceRow(storyPart('tanstack_query_invalidate', {key: '["posts","list"]'}), storyResult({ok: true})),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('invalidated ["posts","list"]')).toBeVisible())
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 query invalidate', [
      traceRow(
        storyPart('tanstack_query_invalidate', {key: '["posts","list"]'}),
        storyErrorResult('TanStack QueryClient not found on page'),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('TanStack QueryClient not found on page')).toBeVisible())
  },
}
