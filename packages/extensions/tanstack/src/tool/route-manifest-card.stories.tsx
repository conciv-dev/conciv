import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/RouteManifestCard'}
export default meta
type Story = StoryObj

const ROUTE_MANIFEST = [
  {path: '/', kind: 'layout', dynamic: false, file: '/app/src/routes/__root'},
  {path: '/', kind: 'page', dynamic: false, file: '/app/src/routes/index'},
  {path: '/posts/$postId', kind: 'page', dynamic: true, file: '/app/src/routes/posts.$postId'},
]

export const Done: Story = {
  render: () =>
    traceFrame('1 route manifest', [traceRow(storyPart('tanstack_route_manifest', {}), storyResult(ROUTE_MANIFEST))]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('manifest')).toBeVisible()
    await expect(canvas.getAllByText('3 routes')[0]).toBeVisible()
    await waitFor(() => expect(canvas.getByText('/posts/$postId')).toBeVisible())
    await expect(canvas.getByText('dynamic')).toBeVisible()
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 route manifest', [
      traceRow(storyPart('tanstack_route_manifest', {}), storyErrorResult('routeTree.gen not found')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('routeTree.gen not found')).toBeVisible())
  },
}
