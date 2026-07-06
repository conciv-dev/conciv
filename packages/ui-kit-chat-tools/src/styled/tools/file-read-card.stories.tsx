import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {FileReadCard} from './file-read-card.js'

const meta: Meta = {title: 'styled/tools/FileReadCard'}
export default meta
type Story = StoryObj

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'story', sendMessage: () => {}}

function part(name: string, args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'r1', name, arguments: JSON.stringify(args), state}
}
function result(text: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'r1', content: text, state}
}

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

const SOURCE = '1\texport function add(a, b) {\n2\t  return a + b\n3\t}\n'

export const Read: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <FileReadCard part={part('Read', {file_path: 'src/math.ts'})} result={result(SOURCE)} ctx={ctx} />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Read src/math.ts')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => {
      const container = canvasElement.querySelector('diffs-container')
      expect(container?.shadowRoot?.textContent ?? '').toContain('return a + b')
    })
  },
}

export const WithRange: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <FileReadCard
        part={part('Read', {file_path: 'src/big.ts', offset: 40, limit: 20})}
        result={result(SOURCE)}
        ctx={ctx}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText(':40-60')).toBeVisible()
  },
}

export const Opened: Story = {
  render: () =>
    frame(
      'chat-theme-conciv',
      <FileReadCard part={part('conciv_open', {file: 'src/app.tsx', line: 12})} result={undefined} ctx={ctx} />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Opened src/app.tsx')).toBeVisible()
  },
}

export const Running: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <FileReadCard part={part('Read', {file_path: 'src/slow.ts'}, 'input-complete')} result={undefined} ctx={ctx} />,
    ),
}
