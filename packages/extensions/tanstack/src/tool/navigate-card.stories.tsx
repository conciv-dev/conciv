import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/NavigateCard'}
export default meta
type Story = StoryObj

export const Done: Story = {
  render: () =>
    traceFrame('1 navigate', [
      traceRow(storyPart('tanstack_navigate', {to: '/form'}), storyResult({ok: true, to: '/form'})),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('nav')).toBeVisible()
    await waitFor(() => expect(canvas.getByText('→ /form')).toBeVisible())
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 navigate', [
      traceRow(storyPart('tanstack_navigate', {to: '/form'}), storyErrorResult('TanStack router not found on page')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('TanStack router not found on page')).toBeVisible())
  },
}
