import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {TruncatedText} from './truncated-text.js'

const meta: Meta = {title: 'ui-kit-system/TruncatedText'}
export default meta
type Story = StoryObj

const ROW = 'flex items-center gap-2.5 min-w-0 w-72 px-2.5 py-1.5 rounded-chat-surface-sm bg-chat-sunken'
const LABEL = 'flex-none text-chat-microlabel text-[length:var(--chat-text-micro)] uppercase tracking-[0.13em]'
const TARGET = 'flex-1 min-w-0 text-[length:var(--chat-text-sm)] text-chat-text'

const CLIPPED = 'I accept the terms and conditions. Required. Validation runs on submit and again on blur.'
const FITTING = 'Sign in'

export const Rows: Story = {
  render: () => (
    <div class="flex flex-col gap-2">
      <div class={ROW}>
        <span class={LABEL}>check</span>
        <TruncatedText class={TARGET} text={CLIPPED} />
      </div>
      <div class={ROW}>
        <span class={LABEL}>click</span>
        <TruncatedText class={TARGET} text={FITTING} />
      </div>
    </div>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const clipped = c.getByText(CLIPPED)
    await userEvent.hover(clipped)
    await expect(await c.findByRole('tooltip')).toHaveTextContent(CLIPPED)
    await userEvent.unhover(clipped)
    await waitFor(() => expect(c.queryByRole('tooltip')).toBeNull())
    await userEvent.hover(clipped)
    await expect(await c.findByRole('tooltip')).toHaveTextContent(CLIPPED)
  },
}
