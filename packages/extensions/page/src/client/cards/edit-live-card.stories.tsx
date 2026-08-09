import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER,
  ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE,
  INERT_TOOL_CTX,
} from '@conciv/ui-kit-chat'
import {EditLiveCard} from './edit-live-card.js'

const meta: Meta = {title: 'extension-page/client/cards/EditLiveCard'}
export default meta
type Story = StoryObj

const settextMeta: ToolViewMeta = {
  summary: 'replace the text content of an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Setting text', done: 'Set the text'},
  mutating: true,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, ref: {type: 'string'}, name: {type: 'string'}, text: {type: 'string'}},
    required: ['text'],
  },
  outputSchema: {type: 'object', properties: {ok: {type: 'boolean'}}},
}

const evalMeta: ToolViewMeta = {
  summary: 'run javascript in the page and return its result',
  category: 'edit-live',
  icon: 'script',
  label: {running: 'Running a script', done: 'Ran a script'},
  mutating: true,
  mirrors: false,
  inputSchema: {type: 'object', properties: {code: {type: 'string'}}, required: ['code']},
  outputSchema: {type: 'object', properties: {result: {}}},
}

function catalogOf(entries: Record<string, ToolViewMeta>): ToolCatalogView {
  return {loaded: () => true, meta: (name) => entries[name]}
}

function ctxFor(entries: Record<string, ToolViewMeta>): ToolViewCtx {
  return {...INERT_TOOL_CTX, catalog: catalogOf(entries)}
}

function part(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'e1', name, arguments: JSON.stringify(input), input, state}
}

function result(content: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'e1', content, state}
}

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
  )
}

export const TextChangeWithDiff: Story = {
  render: () =>
    frame(
      <EditLiveCard
        part={part('page.settext', {selector: '#cta', text: 'Order placed'})}
        result={result('{"ok":true}')}
        ctx={ctxFor({'page.settext': settextMeta})}
        capture={{
          before: ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE,
          after: ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER,
          css: ELEMENT_CAPTURE_FIXTURE_CSS,
        }}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Set the text')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await expect(canvas.getByRole('tab', {name: 'Before'})).toBeVisible()
    await expect(canvas.getByRole('tab', {name: 'After'})).toBeVisible()
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll('diffs-container'))
          .map((host) => host.shadowRoot?.textContent ?? '')
          .join('\n'),
      ).toContain('Order placed'),
    )
  },
}

export const EvalCodeBlock: Story = {
  render: () =>
    frame(
      <EditLiveCard
        part={part('page.eval', {code: 'return document.title'})}
        result={result('{"result":"Storefront"}')}
        ctx={ctxFor({'page.eval': evalMeta})}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ran a script')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll('diffs-container'))
          .map((host) => host.shadowRoot?.textContent ?? '')
          .join('\n'),
      ).toContain('document.title'),
    )
  },
}
