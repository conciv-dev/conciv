import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor, within} from 'storybook/test'
import {NowLine} from './now-line.js'

const meta: Meta = {title: 'ui-kit-chat/styled/NowLine'}
export default meta
type Story = StoryObj

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[24rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Running: Story = {
  render: () => frame('chat-theme-dark', <NowLine title="Running pnpm test" onStop={() => {}} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('Running pnpm test')).toBeVisible())
    await waitFor(() => expect(c.getByRole('button', {name: 'Stop'})).toBeVisible())
  },
}

export const NoStop: Story = {
  render: () => frame('chat-theme-conciv', <NowLine title="Reading widget-shell.tsx" />),
}
