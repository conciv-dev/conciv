import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {BashCard} from './bash-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/BashCard'}
export default meta
type Story = StoryObj

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'story', sendMessage: () => {}}

function part(args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'b1', name: 'bash', arguments: JSON.stringify(args), state}
}
function result(payload: object, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'b1', content: JSON.stringify(payload), state}
}

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

async function codeText(root: HTMLElement): Promise<string> {
  return Array.from(root.querySelectorAll('diffs-container'))
    .map((host) => host.shadowRoot?.textContent ?? '')
    .join('\n')
}

export const Complete: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <BashCard
        part={part({command: 'pnpm test', description: 'Run the unit tests'})}
        result={result({stdout: '✓ 42 passed\n✓ all green', exitCode: 0})}
        ctx={ctx}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('bash')).toBeVisible()
    await expect(c.getByText('Run the unit tests')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('42 passed'), {timeout: 5000})
    await waitFor(() => expect(c.getByText('$ pnpm test')).toBeVisible())
  },
}

export const Error: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <BashCard
        part={part({command: 'pnpm build'})}
        result={result({stdout: '', stderr: 'error TS2345: type mismatch', exitCode: 1})}
        ctx={ctx}
      />,
    ),
}

export const Running: Story = {
  render: () =>
    frame(
      'chat-theme-conciv',
      <BashCard part={part({command: 'sleep 5'}, 'input-complete')} result={undefined} ctx={ctx} />,
    ),
}
