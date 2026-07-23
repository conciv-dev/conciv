import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ToolFallback} from './tool-fallback.js'

const meta: Meta = {title: 'ui-kit-chat/styled/ToolFallback'}
export default meta
type Story = StoryObj

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'story', sendMessage: () => {}, respondApproval: () => {}}

function part(args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'x1', name: 'mcp__weather__forecast', arguments: JSON.stringify(args), state}
}
function result(text: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'x1', content: text, state}
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
      <ToolFallback part={part({city: 'Berlin'})} result={result('{"tempC": 18}')} ctx={ctx} durationMs={4200} />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('mcp__weather__forecast')).toBeVisible()
    await expect(c.getByText('4.2s')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('tempC'), {timeout: 5000})
    await waitFor(() => expect(c.getByText('Result:')).toBeVisible())
  },
}

export const Running: Story = {
  render: () =>
    frame(
      'chat-theme-conciv',
      <ToolFallback part={part({city: 'Berlin'}, 'input-complete')} result={undefined} ctx={ctx} />,
    ),
}

export const Errored: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <ToolFallback part={part({city: 'Atlantis'})} result={result('no such city', 'error')} ctx={ctx} />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('Error:')).toBeVisible())
    await waitFor(() => expect(c.getAllByText('no such city')[0]).toBeVisible())
  },
}

export const Approval: Story = {
  render: () => {
    const approvalPart: ToolCallPart = {
      ...part({city: 'Berlin'}, 'approval-requested'),
      approval: {id: 'ap1', needsApproval: true},
    }
    return frame('chat-theme-dark', <ToolFallback part={approvalPart} result={undefined} ctx={ctx} />)
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await expect(c.getByRole('button', {name: 'Allow'})).toBeVisible()
    await expect(c.getByRole('button', {name: 'Deny'})).toBeVisible()
  },
}
