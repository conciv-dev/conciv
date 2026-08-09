import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ELEMENT_CAPTURE_FIXTURE_CSS, ELEMENT_CAPTURE_FIXTURE_FULL, INERT_TOOL_CTX} from '@conciv/ui-kit-chat'
import {ActCard} from './act-card.js'

const meta: Meta = {title: 'extension-page/client/cards/ActCard'}
export default meta
type Story = StoryObj

const fillMeta: ToolViewMeta = {
  summary: 'type a value into a form field',
  category: 'act',
  icon: 'keyboard',
  label: {running: 'Typing', done: 'Typed'},
  mutating: true,
  mirrors: true,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, ref: {type: 'string'}, name: {type: 'string'}, value: {type: 'string'}},
    required: ['value'],
  },
  outputSchema: {type: 'object', properties: {ok: {type: 'boolean'}, value: {type: 'string'}}},
}

function catalogOf(entries: Record<string, ToolViewMeta>): ToolCatalogView {
  return {loaded: () => true, meta: (name) => entries[name]}
}

function ctxFor(entries: Record<string, ToolViewMeta>): ToolViewCtx {
  return {...INERT_TOOL_CTX, catalog: catalogOf(entries)}
}

function part(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'a1', name, arguments: JSON.stringify(input), input, state}
}

function result(content: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'a1', content, state}
}

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
  )
}

export const FilledField: Story = {
  render: () =>
    frame(
      <ActCard
        part={part('page.fill', {selector: '#email', value: 'ada@example.com'})}
        result={result('{"ok":true,"value":"ada@example.com"}')}
        ctx={ctxFor({'page.fill': fillMeta})}
        capture={{after: ELEMENT_CAPTURE_FIXTURE_FULL, css: ELEMENT_CAPTURE_FIXTURE_CSS}}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Typed')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('ada@example.com')).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Email'})).toBeVisible())
  },
}
