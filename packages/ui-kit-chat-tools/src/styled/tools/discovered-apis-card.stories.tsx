import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {DiscoveredApisCard} from './discovered-apis-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/DiscoveredApisCard'}
export default meta
type Story = StoryObj

function part(state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'd1',
    name: 'catalog',
    arguments: JSON.stringify({}),
    state,
  }
}

function result(payload: object): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'd1', content: JSON.stringify(payload), state: 'complete'}
}

const listResult = result({
  tools: [
    {
      call: 'external_canvas_draw',
      name: 'canvas_draw',
      summary: 'Draw elements onto the agent draft.',
      category: 'canvas',
      mutating: true,
      reachable: true,
    },
    {
      call: 'external_canvas_read',
      name: 'canvas_read',
      summary: 'Read the current canvas.',
      category: 'canvas',
      mutating: false,
      reachable: true,
    },
  ],
})

const emptyListResult = result({tools: []})

const detailResult = result({
  call: 'external_canvas_draw',
  name: 'canvas_draw',
  description: 'Draw elements onto the agent draft.',
  category: 'canvas',
  mutating: true,
  reachable: true,
  input: {elements: 'Skeleton[]'},
  output: {ids: 'string[]'},
  errors: [],
  typeStub: 'declare function external_canvas_draw(input: {elements: Skeleton[]}): Promise<{ids: string[]}>',
})

function frame(child: JSX.Element): JSX.Element {
  return <div class="p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
}

export const List: Story = {
  render: () =>
    frame(<DiscoveredApisCard part={part()} result={listResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Discovered 2 capabilities')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: /Discovered/}))
    await waitFor(() => expect(c.getAllByText('canvas_draw').length).toBeGreaterThan(0))
    await expect(c.getByLabelText('complete')).toBeInTheDocument()
  },
}

export const Detail: Story = {
  render: () =>
    frame(<DiscoveredApisCard part={part()} result={detailResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Inspected canvas_draw')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: /Inspected/}))
    await waitFor(() => expect(c.getAllByText('Draw elements onto the agent draft.').length).toBeGreaterThan(0))
    await expect(c.getAllByText(/Promise/).length).toBeGreaterThan(0)
    await expect(c.getByLabelText('complete')).toBeInTheDocument()
  },
}

export const Empty: Story = {
  render: () =>
    frame(
      <DiscoveredApisCard part={part()} result={emptyListResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Discovered 0 capabilities')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: /Discovered/}))
    await waitFor(() => expect(c.getByText('no APIs returned')).toBeVisible())
  },
}

export const Unrecognized: Story = {
  render: () =>
    frame(
      <DiscoveredApisCard
        part={part()}
        result={result({unexpected: true})}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Capability catalog')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: /Capability catalog/}))
    await waitFor(() => expect(c.getByText('no APIs returned')).toBeVisible())
  },
}

export const Terminal: Story = {
  render: () =>
    frame(<DiscoveredApisCard part={part()} result={listResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
}
