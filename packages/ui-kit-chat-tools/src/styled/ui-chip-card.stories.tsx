import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {UiCard} from './ui-chip-card.js'

const meta: Meta = {title: 'tools/UiCard'}
export default meta
type Story = StoryObj

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'story', sendMessage: () => {}}

function part(args: Record<string, unknown>): ToolCallPart {
  return {type: 'tool-call', id: 'u1', name: 'conciv_ui', arguments: JSON.stringify(args), state: 'complete'}
}
function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Form: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <UiCard part={part({kind: 'form', question: 'Pick a primary color'})} result={undefined} ctx={ctx} />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Rendered a form')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('Pick a primary color')).toBeVisible())
  },
}

export const Choices: Story = {
  render: () => frame('chat-theme-conciv', <UiCard part={part({kind: 'choices'})} result={undefined} ctx={ctx} />),
}
