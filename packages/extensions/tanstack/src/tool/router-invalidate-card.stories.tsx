import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/RouterInvalidateCard'}
export default meta
type Story = StoryObj

export const Done: Story = {
  render: () =>
    traceFrame('1 router invalidate', [traceRow(storyPart('tanstack_invalidate', {}), storyResult({ok: true}))]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('invalidated', {exact: true})).toBeVisible())
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 router invalidate', [
      traceRow(storyPart('tanstack_invalidate', {}), storyErrorResult('TanStack router invalidate is not available')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('TanStack router invalidate is not available')).toBeVisible())
  },
}
