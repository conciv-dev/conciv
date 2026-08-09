import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_TOOL_CTX} from '@conciv/ui-kit-chat'
import {EditInline, GrepInline, ReadInline, ToolCallInline} from './inline-tool.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/InlineTool'}
export default meta
type Story = StoryObj

function part(name: string, args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: name, name, arguments: JSON.stringify(args), state}
}
const done: ToolResultPart = {type: 'tool-result', toolCallId: 'x', content: 'ok', state: 'complete'}

function frame(theme: string, child: JSX.Element): JSX.Element {
  return (
    <div
      class={`${theme} p-4 flex flex-col gap-1 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}
    >
      {child}
    </div>
  )
}

export const Rows: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <>
        <ReadInline
          part={part('read', {file_path: 'packages/ui-kit-chat/src/styled/thread.tsx'})}
          result={done}
          ctx={INERT_TOOL_CTX}
        />
        <EditInline
          part={part('edit', {file_path: 'src/composer/model-selector.tsx'})}
          result={done}
          ctx={INERT_TOOL_CTX}
        />
        <GrepInline
          part={part('grep', {pattern: 'useChat'}, 'input-complete')}
          result={undefined}
          ctx={INERT_TOOL_CTX}
        />
        <ToolCallInline
          part={part('mcp_lookup', {query: 'tanstack ai client'})}
          result={{type: 'tool-result', toolCallId: 'q', content: 'err', state: 'error'}}
          ctx={INERT_TOOL_CTX}
        />
      </>,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('read')).toBeVisible()
    await expect(c.getByText('styled/thread.tsx')).toBeVisible()
    await expect(c.getByText('model-selector.tsx')).toBeVisible()
    await expect(c.getByText('useChat')).toBeVisible()
  },
}

export const Neutral: Story = {
  render: () =>
    frame('', <ReadInline part={part('read', {file_path: 'a/b/c/deep/file.ts'})} result={done} ctx={INERT_TOOL_CTX} />),
}
