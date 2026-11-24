import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor, within, userEvent} from 'storybook/test'
import type {JSX} from 'solid-js'
import type {ChatPart, ToolCallPart, ChatMessage} from '@conciv/protocol/chat-message-types'
import {Activity} from './activity.js'

const meta: Meta = {title: 'ui-kit-chat/styled/Activity'}
export default meta
type Story = StoryObj

function user(id: string, text: string): ChatMessage {
  return {id, role: 'user', parts: [{type: 'text', content: text}]}
}

function assistant(id: string, parts: ChatPart[]): ChatMessage {
  return {id, role: 'assistant', parts}
}

function call(id: string, name: string, state: ToolCallPart['state']): ChatPart {
  return {type: 'tool-call', id, name, arguments: '{}', state}
}

function result(toolCallId: string, state: 'complete' | 'error'): ChatPart {
  return {type: 'tool-result', toolCallId, content: 'ok', state}
}

const label = (part: ToolCallPart): string => part.name.replace(/^mcp__.+?__/, '').replaceAll('_', ' ')

function frame(children: JSX.Element): JSX.Element {
  return <div class="p-3 flex flex-col h-96 w-96 [background:var(--chat-bg)]">{children}</div>
}

const settledMessages: ChatMessage[] = [
  user('u1', 'please write a note'),
  assistant('a1', [
    {type: 'thinking', content: 'Sketch style, layered SVG paths.'},
    call('t1', 'mcp__tanstack__notes_write', 'complete'),
    result('t1', 'complete'),
    call('t2', 'mcp__tanstack__notes_save', 'complete'),
    {type: 'text', content: 'Note written and saved.'},
  ]),
  assistant('a2', [result('t2', 'complete')]),
]

export const SettledTurn: Story = {
  render: () =>
    frame(
      <Activity.Root messages={settledMessages} label={label}>
        <Activity.Timeline />
      </Activity.Root>,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('please write a note')).toBeVisible())
    await expect(c.getByText('Note written and saved.')).toBeVisible()
    const trigger = c.getByRole('button', {name: '3 steps'})
    await expect(trigger).toBeVisible()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByRole('button', {name: 'notes write'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'notes save'})).toBeVisible()
    await expect(c.getByRole('button', {name: 'Reasoning'})).toBeVisible()
    await expect(c.queryByRole('button', {name: '0 steps'})).toBeNull()
  },
}

const liveMessages: ChatMessage[] = [
  user('u1', 'please write a note'),
  assistant('a1', [
    call('t1', 'mcp__tanstack__notes_write', 'complete'),
    result('t1', 'complete'),
    call('t2', 'mcp__tanstack__notes_preview', 'input-complete'),
  ]),
]

export const LiveTurn: Story = {
  render: () =>
    frame(
      <Activity.Root messages={liveMessages} live label={label}>
        <Activity.Timeline />
      </Activity.Root>,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByRole('button', {name: 'notes write'})).toBeVisible())
    await waitFor(() => expect(c.getAllByRole('button', {name: 'notes preview'})).toHaveLength(2))
  },
}

function subCall(id: string, name: string, parent: string, state: ToolCallPart['state']): ChatPart {
  const part: ToolCallPart & {metadata?: {parentToolCallId?: string}} = {
    type: 'tool-call',
    id,
    name,
    arguments: '{}',
    state,
    metadata: {parentToolCallId: parent},
  }
  return part
}

const nestedMessages: ChatMessage[] = [
  user('u1', 'write and save via script'),
  assistant('a1', [
    call('p1', 'execute_typescript', 'complete'),
    subCall('c1', 'notes_write', 'p1', 'complete'),
    result('c1', 'complete'),
    subCall('c2', 'notes_save', 'p1', 'complete'),
    result('c2', 'complete'),
    result('p1', 'complete'),
    {type: 'text', content: 'Script ran.'},
  ]),
]

export const NestedSubCalls: Story = {
  render: () =>
    frame(
      <Activity.Root messages={nestedMessages} label={label}>
        <Activity.Timeline />
      </Activity.Root>,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const chain = await waitFor(() => c.getByRole('button', {name: '1 step'}))
    await userEvent.click(chain)
    const parent = await waitFor(() => c.getByRole('button', {name: 'execute typescript'}))
    await expect(c.queryByRole('button', {name: 'notes write'})).toBeNull()
    await userEvent.click(parent)
    const group = await waitFor(() => c.getByRole('button', {name: '2 tool calls'}))
    await userEvent.click(group)
    await waitFor(() => expect(c.getByRole('button', {name: 'notes write'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'notes save'})).toBeVisible()
  },
}

export const ErrorStep: Story = {
  render: () =>
    frame(
      <Activity.Root
        messages={[
          user('u1', 'run the tests'),
          assistant('a1', [
            call('t1', 'Bash', 'complete'),
            result('t1', 'error'),
            {type: 'text', content: 'Tests failed.'},
          ]),
        ]}
        label={label}
      >
        <Activity.Timeline />
      </Activity.Root>,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = await waitFor(() => c.getByRole('button', {name: '1 step'}))
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByRole('button', {name: 'Bash'})).toBeVisible())
  },
}
