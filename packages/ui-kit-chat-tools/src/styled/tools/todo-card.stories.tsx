import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {TodoCard} from './todo-card.js'

const meta: Meta = {title: 'styled/tools/TodoCard'}
export default meta
type Story = StoryObj

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'story', sendMessage: () => {}}

const TODOS = [
  {content: 'Scaffold the package', status: 'completed'},
  {content: 'Port the primitives', activeForm: 'Porting the primitives', status: 'in_progress'},
  {content: 'Cut the widget over', status: 'pending'},
]

function part(state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 't1', name: 'TodoWrite', arguments: JSON.stringify({todos: TODOS}), state}
}

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Complete: Story = {
  render: () => frame('chat-theme-dark', <TodoCard part={part()} result={undefined} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Updated the to-do list')).toBeVisible()
    await expect(c.getByText('1/3')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('Porting the primitives')).toBeVisible())
    await expect(c.getByText('Cut the widget over')).toBeVisible()
  },
}

export const Conciv: Story = {
  render: () => frame('chat-theme-conciv', <TodoCard part={part()} result={undefined} ctx={ctx} />),
}
