import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, fn} from 'storybook/test'
import {ActionRow, ActionButton} from './action-row.js'

const meta: Meta = {title: 'ui-kit-chat/styled/tools/ActionRow'}
export default meta
type Story = StoryObj

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-terminal p-4 w-[30rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">
      {child}
    </div>
  )
}

export const AllowDeny: Story = {
  render: () => {
    const onAllow = fn()
    const onDeny = fn()
    return frame(
      <ActionRow>
        <ActionButton intent="deny" onClick={onDeny}>
          Deny
        </ActionButton>
        <ActionButton intent="allow" onClick={onAllow}>
          Allow
        </ActionButton>
      </ActionRow>,
    )
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', {name: 'Deny'})).toBeVisible()
    await expect(canvas.getByRole('button', {name: 'Allow'})).toBeVisible()
    await userEvent.click(canvas.getByRole('button', {name: 'Allow'}))
  },
}

export const Neutral: Story = {
  render: () =>
    frame(
      <ActionRow>
        <ActionButton>Retry</ActionButton>
        <ActionButton>Open in editor</ActionButton>
      </ActionRow>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', {name: 'Retry'})).toBeVisible()
    await expect(canvas.getByRole('button', {name: 'Open in editor'})).toBeVisible()
  },
}

export const Disabled: Story = {
  render: () =>
    frame(
      <ActionRow>
        <ActionButton intent="deny" disabled>
          Deny
        </ActionButton>
        <ActionButton intent="allow" disabled>
          Allow
        </ActionButton>
      </ActionRow>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', {name: 'Deny'})).toBeDisabled()
    await expect(canvas.getByRole('button', {name: 'Allow'})).toBeDisabled()
  },
}
