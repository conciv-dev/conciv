import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {TodoCard} from './todo-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/TodoCard'}
export default meta
type Story = StoryObj

const TODOS = [
  {content: 'Scaffold the package', status: 'completed'},
  {content: 'Port the primitives', activeForm: 'Porting the primitives', status: 'in_progress'},
  {content: 'Cut the widget over', status: 'pending'},
]

function part(state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 't1', name: 'TodoWrite', arguments: JSON.stringify({todos: TODOS}), state}
}

function frame(child: JSX.Element): JSX.Element {
  return <div class="p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
}

export const Complete: Story = {
  render: () => frame(<TodoCard part={part()} result={undefined} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Updated the to-do list')).toBeVisible()
    await expect(c.getByText('1/3')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('Porting the primitives')).toBeVisible())
    await expect(c.getByText('Cut the widget over')).toBeVisible()
  },
}

export const Terminal: Story = {
  render: () => frame(<TodoCard part={part()} result={undefined} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
}
