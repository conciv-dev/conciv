import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/LoaderDataCard'}
export default meta
type Story = StoryObj

const LOADER_DATA = {
  routeId: '/posts',
  data: {
    posts: [
      {id: '1', title: 'Ship the trace redesign'},
      {id: '2', title: 'Write the session log spec'},
    ],
    user: {name: 'Omri', role: 'admin'},
  },
}

export const Done: Story = {
  render: () =>
    traceFrame('1 loader data', [
      traceRow(storyPart('tanstack_loader_data', {routeId: '/posts'}), storyResult(LOADER_DATA)),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('2 keys · /posts')).toBeVisible()
    await waitFor(() => expect(canvas.getByText('posts')).toBeVisible())
    await expect(canvas.getByText('user')).toBeVisible()
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 loader data', [
      traceRow(storyPart('tanstack_loader_data', {}), storyErrorResult('TanStack router not found on page')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('TanStack router not found on page')).toBeVisible())
  },
}
