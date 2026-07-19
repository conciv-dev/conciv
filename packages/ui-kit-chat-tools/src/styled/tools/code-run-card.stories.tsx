import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {CodeRunCard} from './code-run-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/CodeRunCard'}
export default meta
type Story = StoryObj

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'story', sendMessage: () => {}}

const CODE = `const drawn = await external_canvas_draw({elements})\nconsole.log('committed', drawn.ids)\nreturn drawn.ids`

function part(state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'c1',
    name: 'execute_typescript',
    arguments: JSON.stringify({typescriptCode: CODE}),
    state,
  }
}

function result(payload: object): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'c1', content: JSON.stringify(payload), state: 'complete'}
}

const okResult = result({success: true, result: ['el_9f2'], logs: ['committed ["el_9f2"]']})
const failResult = result({
  success: false,
  error: {message: "Unexpected token '.'", name: 'SyntaxError', line: 2},
})

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Running: Story = {
  render: () => frame('chat-theme-dark', <CodeRunCard part={part('input-complete')} result={undefined} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('run code')).toBeVisible()
    await waitFor(() => expect(c.getAllByText('external_canvas_draw').length).toBeGreaterThan(0))
    await expect(c.getAllByText('drawn').length).toBeGreaterThan(0)
    await expect(c.queryByText('console')).toBeNull()
    await expect(c.queryByText(/SyntaxError/)).toBeNull()
  },
}

export const Success: Story = {
  render: () => frame('chat-theme-dark', <CodeRunCard part={part()} result={okResult} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('committed ["el_9f2"]')).toBeVisible())
    await expect(c.getByText('["el_9f2"]')).toBeVisible()
    await expect(c.queryByText(/SyntaxError/)).toBeNull()
  },
}

export const Failure: Story = {
  render: () => frame('chat-theme-dark', <CodeRunCard part={part()} result={failResult} ctx={ctx} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText(/SyntaxError/)).toBeVisible())
    await expect(c.getByText(/line 2/)).toBeVisible()
    await expect(c.queryByText('["el_9f2"]')).toBeNull()
    await expect(c.queryByText('console')).toBeNull()
  },
}

export const Conciv: Story = {
  render: () => frame('chat-theme-conciv', <CodeRunCard part={part()} result={okResult} ctx={ctx} />),
}
