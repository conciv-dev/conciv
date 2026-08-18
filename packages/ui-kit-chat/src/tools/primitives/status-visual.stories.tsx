import {For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {StatusVisual} from './status-visual.js'
import type {ToolStatus} from './tool-status.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/StatusVisual'}
export default meta
type Story = StoryObj

const STATUSES: Array<ToolStatus> = ['running', 'complete', 'error', 'approval']
const LABELS: Record<ToolStatus, string> = {
  running: 'running',
  complete: 'complete',
  error: 'error',
  approval: 'needs approval',
}

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-terminal p-4 flex flex-col gap-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">
      {child}
    </div>
  )
}

function row(form: 'dot' | 'icon'): JSX.Element {
  return (
    <div class="flex gap-4 items-center">
      <For each={STATUSES}>{(status) => <StatusVisual status={status} form={form} />}</For>
    </div>
  )
}

export const DotForm: Story = {
  render: () => frame(row('dot')),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    for (const status of STATUSES) {
      await expect(canvas.getByRole('img', {name: LABELS[status]})).toBeVisible()
    }
  },
}

export const IconForm: Story = {
  render: () => frame(row('icon')),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    for (const status of STATUSES) {
      await expect(canvas.getByRole('img', {name: LABELS[status]})).toBeVisible()
    }
  },
}

export const BothForms: Story = {
  render: () =>
    frame(
      <>
        {row('dot')}
        {row('icon')}
      </>,
    ),
}
