import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {ToolCallPart} from '@tanstack/ai-client'
import {CardShell} from './card-shell.js'

const meta: Meta = {title: 'ui-kit-chat/styled/CardShell'}
export default meta
type Story = StoryObj

const PART: ToolCallPart = {type: 'tool-call', id: 't1', name: 'demo_tool', arguments: '{}', state: 'input-complete'}

const LONG_TITLE =
  'Read the deeply nested router state for every matched route segment across the whole application shell'
const LONG_SUBTITLE =
  '/dashboard/workspace/settings/billing/invoices/2026/august · 214 matches across 38 files in the workspace'

function frame(child: JSX.Element): JSX.Element {
  return <div class="p-4 w-[26rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
}

export const LongTitleNoSubtitle: Story = {
  render: () => frame(<CardShell meta={undefined} title={LONG_TITLE} part={PART} result={undefined} />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(LONG_TITLE)).toBeVisible()
  },
}

export const LongTitleWithSubtitle: Story = {
  render: () =>
    frame(
      <CardShell meta={undefined} title={LONG_TITLE} subtitle="/about · 2 matches" part={PART} result={undefined} />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(LONG_TITLE)).toBeVisible()
    await expect(canvas.getByText('/about · 2 matches')).toBeVisible()
  },
}

export const ShortTitleLongSubtitle: Story = {
  render: () =>
    frame(<CardShell meta={undefined} title="Read" subtitle={LONG_SUBTITLE} part={PART} result={undefined} />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read')).toBeVisible()
    await expect(canvas.getByText(LONG_SUBTITLE)).toBeVisible()
  },
}
