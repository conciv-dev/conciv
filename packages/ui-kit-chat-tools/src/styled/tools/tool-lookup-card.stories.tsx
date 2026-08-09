import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {ToolLookupCard} from './tool-lookup-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/ToolLookupCard'}
export default meta
type Story = StoryObj

function part(args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 't1', name: 'ToolSearch', arguments: JSON.stringify(args), state}
}
function result(payload: object, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 't1', content: JSON.stringify(payload), state}
}

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Complete: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <ToolLookupCard
        part={part({query: 'select:mcp__tanstack__conciv_page', max_results: 5})}
        result={result({tools: 1})}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Loaded tools')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('select:mcp__tanstack__conciv_page')).toBeVisible())
  },
}
