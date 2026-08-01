import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {LoadedToolsCard} from './loaded-tools-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/LoadedToolsCard'}
export default meta
type Story = StoryObj

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'story', sendMessage: () => {}}

function part(state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'l1',
    name: '__lazy__tool__discovery__',
    arguments: JSON.stringify({query: 'sleep'}),
    state,
  }
}

function result(payload: object): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'l1', content: JSON.stringify(payload), state: 'complete'}
}

const twoResult = result({
  tools: [
    {
      name: 'sleep',
      description: 'Pause the run for a while.',
      inputSchema: {type: 'object', properties: {seconds: {type: 'number'}}, required: ['seconds']},
    },
    {
      name: 'ping_host',
      description: 'Ping a host and report latency.',
      inputSchema: {type: 'object', properties: {host: {type: 'string'}, count: {type: 'number'}}, required: ['host']},
    },
  ],
})

const oneResult = result({
  tools: [
    {
      name: 'sleep',
      description: 'Pause the run for a while.',
      inputSchema: {type: 'object', properties: {seconds: {type: 'number'}}, required: ['seconds']},
    },
  ],
})

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Loaded: Story = {
  render: () => frame('chat-theme-dark', <LoadedToolsCard part={part()} result={twoResult} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Loaded 2 tools')).toBeVisible()
    await expect(c.getByText('sleep, ping_host')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: /Loaded 2 tools/}))
    await waitFor(() => expect(c.getByRole('button', {name: 'sleep'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'ping_host'})).toBeVisible()
    await userEvent.hover(c.getByRole('button', {name: 'sleep'}))
    await waitFor(() => expect(c.getByText('Pause the run for a while.')).toBeVisible())
    await expect(c.getByText('seconds: number')).toBeVisible()
    await expect(c.getByLabelText('complete')).toBeInTheDocument()
  },
}

export const LoadedOne: Story = {
  render: () => frame('chat-theme-dark', <LoadedToolsCard part={part()} result={oneResult} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Loaded 1 tool')).toBeVisible()
    await expect(c.getAllByText('sleep').length).toBeGreaterThan(0)
  },
}

export const Empty: Story = {
  render: () => frame('chat-theme-dark', <LoadedToolsCard part={part()} result={result({tools: []})} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Loaded 0 tools')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: /Loaded 0 tools/}))
    await waitFor(() => expect(c.getByText('no tools loaded')).toBeVisible())
  },
}

export const Conciv: Story = {
  render: () => frame('chat-theme-conciv', <LoadedToolsCard part={part()} result={twoResult} ctx={ctx} />),
}
