import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {ClipboardCopyButton} from './clipboard-copy-button.js'

const meta: Meta = {title: 'ui-kit-system/ClipboardCopyButton'}
export default meta
type Story = StoryObj

const COMMAND = 'npx @conciv/try --token 4f2c9a'

const accept = (): Promise<void> => Promise.resolve()
const refuse = (): Promise<void> => Promise.reject(new Error('the document is not focused'))

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="p-4 rounded-[var(--chat-radius-md)] flex gap-3 [background:var(--chat-panel)] [border:1px_solid_var(--chat-line)] items-center">
      <span class="text-[length:var(--chat-text-xs)] text-chat-text-2 [font-family:var(--chat-mono)]">{COMMAND}</span>
      {child}
    </div>
  )
}

export const Idle: Story = {
  render: () => frame(<ClipboardCopyButton text={COMMAND} writeText={accept} />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', {name: 'Copy'})).toBeVisible()
  },
}

export const Copied: Story = {
  render: () => frame(<ClipboardCopyButton text={COMMAND} resetMs={60_000} writeText={accept} />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: 'Copy'}))
    await waitFor(() => expect(canvas.getByRole('button', {name: 'Copied'})).toBeVisible())
    await expect(canvas.getByRole('status')).toHaveTextContent('Copied to clipboard')
  },
}

export const CopyFailed: Story = {
  render: () => frame(<ClipboardCopyButton text={COMMAND} resetMs={60_000} writeText={refuse} />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: 'Copy'}))
    await waitFor(() => expect(canvas.getByRole('button', {name: 'Copy failed'})).toBeVisible())
    await expect(canvas.getByRole('status')).toHaveTextContent('Could not copy to clipboard')
  },
}
