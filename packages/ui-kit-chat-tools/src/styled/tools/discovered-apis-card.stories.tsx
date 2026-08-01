import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {DiscoveredApisCard} from './discovered-apis-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/DiscoveredApisCard'}
export default meta
type Story = StoryObj

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'story', sendMessage: () => {}}

function part(state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'd1',
    name: 'discover_tools',
    arguments: JSON.stringify({names: ['external_canvas_draw']}),
    state,
  }
}

function result(payload: object): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'd1', content: JSON.stringify(payload), state: 'complete'}
}

const okResult = result({
  tools: [
    {
      name: 'external_canvas_draw',
      description: 'Draw elements onto the agent draft.',
      typeStub: 'declare function external_canvas_draw(input: {elements: Skeleton[]}): Promise<{ids: string[]}>',
    },
  ],
})

const manyResult = result({
  tools: [
    {
      name: 'external_canvas_draw',
      description: 'Draw elements onto the agent draft.',
      typeStub: 'declare function external_canvas_draw(): void',
    },
    {
      name: 'external_canvas_read',
      description: 'Read the current canvas.',
      typeStub: 'declare function external_canvas_read(): void',
    },
  ],
})

const errorsResult = result({
  tools: [
    {
      name: 'external_canvas_draw',
      description: 'Draw elements onto the agent draft.',
      typeStub: 'declare function external_canvas_draw(input: {elements: Skeleton[]}): Promise<{ids: string[]}>',
    },
  ],
  errors: ["Unknown tool: 'canvas_zap'"],
})

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Discovered: Story = {
  render: () => frame('chat-theme-dark', <DiscoveredApisCard part={part()} result={okResult} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Discovered 1 API')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: /Discovered/}))
    await waitFor(() => expect(c.getAllByText('external_canvas_draw').length).toBeGreaterThan(0))
    await expect(c.getAllByText('Draw elements onto the agent draft.').length).toBeGreaterThan(0)
    await waitFor(() => expect(c.getAllByText('Promise').length).toBeGreaterThan(0))
    await expect(c.getByLabelText('complete')).toBeInTheDocument()
  },
}

export const DiscoveredMany: Story = {
  render: () => frame('chat-theme-dark', <DiscoveredApisCard part={part()} result={manyResult} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Discovered 2 APIs')).toBeVisible()
  },
}

export const WithErrors: Story = {
  render: () => frame('chat-theme-dark', <DiscoveredApisCard part={part()} result={errorsResult} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', {name: /Discovered/}))
    await waitFor(() => expect(c.getAllByText(/canvas_zap/).length).toBeGreaterThan(0))
    await expect(c.getAllByText('external_canvas_draw').length).toBeGreaterThan(0)
    await expect(c.getByLabelText('complete')).toBeInTheDocument()
    await expect(c.queryByLabelText('error')).toBeNull()
  },
}

export const Empty: Story = {
  render: () => frame('chat-theme-dark', <DiscoveredApisCard part={part()} result={result({tools: []})} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Discovered 0 APIs')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: /Discovered/}))
    await waitFor(() => expect(c.getByText('no APIs returned')).toBeVisible())
  },
}

export const Conciv: Story = {
  render: () => frame('chat-theme-conciv', <DiscoveredApisCard part={part()} result={errorsResult} ctx={ctx} />),
}
