import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {storyErrorResult, storyPart, storyResult} from './story.fixtures.js'
import {traceFrame, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/BuildErrorsCard'}
export default meta
type Story = StoryObj

const BUILD_ERRORS = [
  {message: "Expected ';' but found '='", source: {file: '/app/src/routes/about.tsx', line: 12, column: 8}},
  {message: "Cannot find module './missing'", source: {file: '/app/src/routes/index.tsx', line: 3, column: 1}},
]

export const Done: Story = {
  render: () =>
    traceFrame('1 build errors', [traceRow(storyPart('tanstack_build_errors', {}), storyResult(BUILD_ERRORS))]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('2 errors')[0]).toBeVisible()
    await waitFor(() => expect(canvas.getByText('/app/src/routes/about.tsx:12')).toBeVisible())
    await expect(canvas.getAllByText("Expected ';' but found '='")[0]).toBeVisible()
  },
}

export const Clean: Story = {
  render: () => traceFrame('1 build errors', [traceRow(storyPart('tanstack_build_errors', {}), storyResult([]))]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('No build errors')).toBeVisible())
  },
}

export const ErrorState: Story = {
  render: () =>
    traceFrame('1 build errors', [
      traceRow(storyPart('tanstack_build_errors', {}), storyErrorResult('bundler bridge unavailable')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('bundler bridge unavailable')).toBeVisible())
  },
}
