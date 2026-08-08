import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {INERT_TOOL_CTX} from '../../store/tool-context.js'
import {MetaToolCard} from './meta-tool-card.js'

const meta: Meta = {title: 'ui-kit-chat/styled/MetaToolCard'}
export default meta
type Story = StoryObj

const textMeta: ToolViewMeta = {
  summary: 'read the visible text of an element',
  hint: 'prefer this over dom when you only need the words',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading the text', done: 'Read the text'},
  positional: 'selector',
  mutating: false,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, trim: {type: 'boolean'}},
    required: ['selector'],
  },
  outputSchema: {type: 'string'},
}

const fillMeta: ToolViewMeta = {
  summary: 'type a value into a form field',
  category: 'act',
  icon: 'keyboard',
  label: {running: 'Filling the field', done: 'Filled the field'},
  positional: 'selector',
  mutating: true,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, value: {type: 'string'}},
    required: ['selector', 'value'],
  },
  outputSchema: {type: 'object', properties: {ok: {type: 'boolean'}}},
  errors: [{code: 'NO_MATCH', message: 'nothing on the page matches that selector'}],
}

const highlightMeta: ToolViewMeta = {
  summary: 'paint a highlight over an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Highlighting the element', done: 'Highlighted the element'},
  positional: 'selector',
  mutating: true,
  mirrors: true,
  inputSchema: {type: 'object', properties: {selector: {type: 'string'}}, required: ['selector']},
  outputSchema: {type: 'object', properties: {ok: {type: 'boolean'}}},
}

const catalog = (entries: Record<string, ToolViewMeta>): ToolCatalogView => ({
  loaded: () => true,
  meta: (name) => entries[name],
})

function ctxFor(entries: Record<string, ToolViewMeta>): ToolViewCtx {
  return {...INERT_TOOL_CTX, catalog: catalog(entries), respondApproval: () => {}}
}

function part(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'm1', name, arguments: JSON.stringify(input), input, state}
}

function result(content: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'm1', content, state}
}

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
  )
}

export const ReadTool: Story = {
  render: () =>
    frame(
      <MetaToolCard
        part={part('page.text', {selector: '#headline', trim: true})}
        result={result('Ship it on Friday')}
        ctx={ctxFor({'page.text': textMeta})}
        durationMs={120}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the text #headline')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('read the visible text of an element')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('prefer this over dom when you only need the words')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('trim')).toBeVisible())
  },
}

export const MutatingTool: Story = {
  render: () =>
    frame(
      <MetaToolCard
        part={part('page.fill', {selector: '#email', value: 'ada@example.com'})}
        result={result('{"ok":true}')}
        ctx={ctxFor({'page.fill': fillMeta})}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Filled the field #email')).toBeVisible()
    await expect(canvas.getByText('writes')).toBeVisible()
  },
}

export const MirroringTool: Story = {
  render: () =>
    frame(
      <MetaToolCard
        part={part('page.highlight', {selector: '.cta'})}
        result={result('{"ok":true}')}
        ctx={ctxFor({'page.highlight': highlightMeta})}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('shown on your page')).toBeVisible())
  },
}

export const DeclaredError: Story = {
  render: () =>
    frame(
      <MetaToolCard
        part={part('page.fill', {selector: '#ghost', value: 'nobody'})}
        result={result('NO_MATCH: page.fill failed', 'error')}
        ctx={ctxFor({'page.fill': fillMeta})}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('nothing on the page matches that selector')).toBeVisible())
    await expect(canvas.queryByText('NO_MATCH: page.fill failed')).toBeNull()
  },
}

export const PositionalHeadline: Story = {
  render: () =>
    frame(
      <MetaToolCard
        part={part('page.text', {selector: 'main > h1', trim: false}, 'input-complete')}
        result={undefined}
        ctx={ctxFor({'page.text': textMeta})}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Reading the text main > h1')).toBeVisible()
  },
}
