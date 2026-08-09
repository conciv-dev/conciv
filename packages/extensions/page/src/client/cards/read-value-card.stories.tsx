import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {INERT_TOOL_CTX} from '@conciv/ui-kit-chat'
import {ReadValueCard} from './read-value-card.js'

const meta: Meta = {title: 'extension-page/client/cards/ReadValueCard'}
export default meta
type Story = StoryObj

const textMeta: ToolViewMeta = {
  summary: 'read the visible text of an element',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading text', done: 'Read the text'},
  mutating: false,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, ref: {type: 'string'}, name: {type: 'string'}},
    required: [],
  },
  outputSchema: {type: 'object', properties: {text: {type: 'string'}}},
}

function catalogOf(entries: Record<string, ToolViewMeta>): ToolCatalogView {
  return {loaded: () => true, meta: (name) => entries[name]}
}

function ctxFor(entries: Record<string, ToolViewMeta>): ToolViewCtx {
  return {...INERT_TOOL_CTX, catalog: catalogOf(entries)}
}

function part(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'r1', name, arguments: JSON.stringify(input), input, state}
}

function result(content: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'r1', content, state}
}

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
  )
}

export const ElementAndValue: Story = {
  render: () =>
    frame(
      <ReadValueCard
        part={part('page.text', {selector: '#headline'})}
        result={result('{"text":"Ship it on Friday"}')}
        ctx={ctxFor({'page.text': textMeta})}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the text')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('#headline')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('Ship it on Friday')).toBeVisible())
  },
}
