import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/QueryCacheCard'}
export default meta
type Story = StoryObj

const QUERY_CACHE = {
  queries: [
    {
      key: '["posts","list"]',
      state: 'fresh',
      status: 'success',
      observers: 2,
      updatedAt: Date.now() - 45_000,
      value: {items: 2},
      error: null,
    },
    {
      key: '["user","me"]',
      state: 'stale',
      status: 'success',
      observers: 1,
      updatedAt: Date.now() - 20 * 60_000,
      value: {name: 'Omri'},
      error: null,
    },
  ],
  mutations: [],
}

export const Done: Story = {
  render: () =>
    traceFrame('1 query cache', [traceRow(storyPart('tanstack_query_cache', {}), storyResult(QUERY_CACHE))]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('2 queries')[0]).toBeVisible()
    await waitFor(() => expect(canvas.getByText('["posts","list"]')).toBeVisible())
    await expect(canvas.getByText('fresh')).toBeVisible()
    await expect(canvas.getByText('stale')).toBeVisible()
  },
}

export const Empty: Story = {
  render: () =>
    traceFrame('1 query cache', [
      traceRow(storyPart('tanstack_query_cache', {}), storyResult({queries: [], mutations: []})),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('no cached queries')).toBeVisible())
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 query cache', [
      traceRow(storyPart('tanstack_query_cache', {}), storyErrorResult('TanStack QueryClient not found on page')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('TanStack QueryClient not found on page')).toBeVisible())
  },
}
