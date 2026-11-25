import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@conciv/types/chat-message-types'
import type {ToolViewCtx} from '@conciv/types/tool-view-types'
import {INERT_TOOL_CTX, Trace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {concivToolCards} from '../conciv-cards.js'

const meta: Meta = {title: 'tools/cards/InlineCards'}
export default meta
type Story = StoryObj

function call(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: name, name, arguments: JSON.stringify(input), input, state}
}

function result(content: unknown, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {
    type: 'tool-result',
    toolCallId: 'g1',
    content: typeof content === 'string' ? content : JSON.stringify(content),
    state,
  }
}

function row(
  part: ToolCallPart,
  toolResult: ToolResultPart | undefined,
  key: string,
  ctx: ToolViewCtx = INERT_TOOL_CTX,
): TraceItem {
  return {
    key,
    render: (branch) => (
      <ToolTraceRow part={part} result={toolResult} ctx={ctx} tools={() => concivToolCards} ring={branch.ring} />
    ),
  }
}

function gallery(summary: string, items: TraceItem[]): JSX.Element {
  return (
    <div class="p-4 max-w-[28rem] w-full [background:var(--chat-panel)] [font-family:var(--chat-font)]">
      <Trace summary={summary} compactLine={summary} items={items} defaultOpen />
    </div>
  )
}

export const OpenComplete: Story = {
  render: () =>
    gallery('1 open', [
      row(
        call('open', {file: 'packages/ui-kit-chat/src/styled/thread.tsx', line: 42}),
        result({ok: true, file: 'x', line: 42}),
        'open',
      ),
    ]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('…/styled/thread.tsx:42')).toBeVisible()
    await expect(c.getByText('open')).toBeVisible()
  },
}

export const OpenPending: Story = {
  render: () =>
    gallery('1 open', [
      row(call('open', {file: 'src/composer/model-selector.tsx'}, 'input-complete'), undefined, 'open'),
    ]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('…/composer/model-selector.tsx')).toBeVisible()
  },
}

export const OpenFailed: Story = {
  render: () =>
    gallery('1 failed', [row(call('open', {file: 'missing/file.ts'}), result('file not found', 'error'), 'open')]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('missing/file.ts')).toBeVisible()
    await expect(c.getByText('Could not open the file.')).toBeVisible()
  },
}
