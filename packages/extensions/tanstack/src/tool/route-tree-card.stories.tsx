import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/RouteTreeCard'}
export default meta
type Story = StoryObj

const ROUTE_TREE = {
  id: '__root__',
  hasLoader: false,
  children: [
    {id: '/', hasLoader: false, children: []},
    {
      id: '/posts',
      hasLoader: true,
      children: [{id: '/posts/$postId', hasLoader: true, children: []}],
    },
  ],
}

export const Done: Story = {
  render: () => traceFrame('1 route tree', [traceRow(storyPart('tanstack_route_tree', {}), storyResult(ROUTE_TREE))]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('4 routes')[0]).toBeVisible()
    await waitFor(() => expect(canvas.getByText('/posts/$postId')).toBeVisible())
    await expect(canvas.getAllByText('loader')[0]).toBeVisible()
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 route tree', [
      traceRow(storyPart('tanstack_route_tree', {}), storyErrorResult('TanStack router not found on page')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('TanStack router not found on page')).toBeVisible())
  },
}
