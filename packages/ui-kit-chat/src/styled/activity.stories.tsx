import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor, within, userEvent} from 'storybook/test'
import type {JSX} from 'solid-js'
import type {MessagePart, ToolCallPart, UIMessage} from '@tanstack/ai-client'
import {Activity} from './activity.js'

const meta: Meta = {title: 'styled/Activity'}
export default meta
type Story = StoryObj

function user(id: string, text: string): UIMessage {
  return {id, role: 'user', parts: [{type: 'text', content: text}]}
}

function assistant(id: string, parts: MessagePart[]): UIMessage {
  return {id, role: 'assistant', parts}
}

function call(id: string, name: string, state: ToolCallPart['state']): MessagePart {
  return {type: 'tool-call', id, name, arguments: '{}', state}
}

function result(toolCallId: string, state: 'complete' | 'error'): MessagePart {
  return {type: 'tool-result', toolCallId, content: 'ok', state}
}

const label = (part: ToolCallPart): string => part.name.replace(/^mcp__.+?__/, '').replaceAll('_', ' ')

function frame(children: JSX.Element): JSX.Element {
  return <div class="p-3 w-96 h-96 flex flex-col [background:var(--chat-bg)]">{children}</div>
}

const settledMessages: UIMessage[] = [
  user('u1', 'please draw an eagle'),
  assistant('a1', [
    {type: 'thinking', content: 'Sketch style, layered SVG paths.'},
    call('t1', 'mcp__tanstack__canvas_svg', 'complete'),
    result('t1', 'complete'),
    call('t2', 'mcp__tanstack__canvas_commit', 'complete'),
    result('t2', 'complete'),
    {type: 'text', content: 'Eagle drawn, committed to canvas.'},
  ]),
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
    await waitFor(() => expect(c.getByText('please draw an eagle')).toBeVisible())
    await expect(c.getByText('Eagle drawn, committed to canvas.')).toBeVisible()
    const trigger = c.getByRole('button', {name: '3 steps'})
    await expect(trigger).toBeVisible()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByRole('button', {name: 'canvas svg'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'canvas commit'})).toBeVisible()
    await expect(c.getByRole('button', {name: 'Reasoning'})).toBeVisible()
  },
}

const liveMessages: UIMessage[] = [
  user('u1', 'please draw an eagle'),
  assistant('a1', [
    call('t1', 'mcp__tanstack__canvas_svg', 'complete'),
    result('t1', 'complete'),
    call('t2', 'mcp__tanstack__canvas_preview', 'input-complete'),
  ]),
]

export const LiveTurn: Story = {
  render: () =>
    frame(
      <Activity.Root messages={liveMessages} live label={label}>
        <Activity.Timeline />
        <Activity.Now />
      </Activity.Root>,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByRole('button', {name: 'canvas svg'})).toBeVisible())
    const now = await waitFor(() => c.getByRole('status'))
    await expect(within(now).getByText('canvas preview')).toBeVisible()
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
