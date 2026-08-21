import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/BackCard'}
export default meta
type Story = StoryObj

export const Done: Story = {
  render: () => traceFrame('1 back', [traceRow(storyPart('tanstack_back', {}), storyResult({ok: true}))]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('back')).toBeVisible()
    await waitFor(() => expect(canvas.getByText('went back', {exact: true})).toBeVisible())
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 back', [
      traceRow(storyPart('tanstack_back', {}), storyErrorResult('TanStack router not found on page')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('TanStack router not found on page')).toBeVisible())
  },
}
