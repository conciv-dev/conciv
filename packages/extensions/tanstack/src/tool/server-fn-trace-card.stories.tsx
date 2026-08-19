import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/ServerFnTraceCard'}
export default meta
type Story = StoryObj

const SERVER_FN_TRACES = {
  traces: [
    {id: 'a1', name: 'getGreeting_createServerFn_handler', durationMs: 4, status: 'ok'},
    {id: 'a2', name: 'saveThing_createServerFn_handler', durationMs: 120, status: 'error'},
  ],
  functions: [
    {id: 'a1', file: '/src/lib/server-fns.ts'},
    {id: 'a2', file: '/src/lib/mutations.ts'},
  ],
}

export const Done: Story = {
  render: () =>
    traceFrame('1 server fn trace', [
      traceRow(storyPart('tanstack_server_fn_trace', {}), storyResult(SERVER_FN_TRACES)),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('2 calls')[0]).toBeVisible()
    await waitFor(() => expect(canvas.getByText('getGreeting_createServerFn_handler')).toBeVisible())
    await expect(canvas.getByText('120ms')).toBeVisible()
    await expect(canvas.getByText('error')).toBeVisible()
  },
}

export const Clean: Story = {
  render: () =>
    traceFrame('1 server fn trace', [
      traceRow(storyPart('tanstack_server_fn_trace', {}), storyResult({traces: [], functions: []})),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('No server-fn calls')).toBeVisible())
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 server fn trace', [
      traceRow(storyPart('tanstack_server_fn_trace', {}), storyErrorResult('bundler bridge unavailable')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('bundler bridge unavailable')).toBeVisible())
  },
}
