import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/RouterStateCard'}
export default meta
type Story = StoryObj

const ROUTER_STATE = {
  location: {pathname: '/about', search: '', hash: ''},
  matches: [
    {routeId: '__root__', path: ''},
    {routeId: '/about', path: '/about'},
  ],
}

export const Done: Story = {
  render: () =>
    traceFrame('1 router state', [traceRow(storyPart('tanstack_router_state', {}), storyResult(ROUTER_STATE))]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('/about')[0]).toBeVisible()
    await expect(canvas.getByText('/about · 2 matches')).toBeVisible()
    await waitFor(() => expect(canvas.getByText('__root__')).toBeVisible())
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 router state', [
      traceRow(storyPart('tanstack_router_state', {}), storyErrorResult('TanStack router not found on page')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('TanStack router not found on page')).toBeVisible())
  },
}
