import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {EditInline, GrepInline, ReadInline, ToolCallInline} from './inline-tool.js'

const meta: Meta = {title: 'styled/tools/InlineTool'}
export default meta
type Story = StoryObj

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'story', sendMessage: () => {}}

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
          ctx={ctx}
        />
        <EditInline part={part('edit', {file_path: 'src/composer/model-selector.tsx'})} result={done} ctx={ctx} />
        <GrepInline part={part('grep', {pattern: 'useChat'}, 'input-complete')} result={undefined} ctx={ctx} />
        <ToolCallInline
          part={part('mcp_lookup', {query: 'tanstack ai client'})}
          result={{type: 'tool-result', toolCallId: 'q', content: 'err', state: 'error'}}
          ctx={ctx}
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
    frame('', <ReadInline part={part('read', {file_path: 'a/b/c/deep/file.ts'})} result={done} ctx={ctx} />),
}
