import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, within} from 'storybook/test'
import {ShellCard} from './shell.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof ShellCard> = {title: 'tool-ui/Shell', component: ShellCard}
export default meta
type Story = StoryObj<typeof ShellCard>

const bash = (over = {}) => callPart({name: 'Bash', input: {command: 'pnpm build'}, ...over})

export const Complete: Story = {
  args: {part: bash(), result: resultPart('✓ built in 1.8s · 142 modules'), ctx: noopCtx()},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Ran pnpm build')).toBeInTheDocument()
    await expect(c.getByText(/142 modules/)).toBeInTheDocument()
  },
}

export const Running: Story = {
  args: {
    part: bash({state: 'input-streaming', input: undefined, arguments: '{"command":"pnpm bu'}),
    result: undefined,
    ctx: noopCtx(),
  },
}

export const Errored: Story = {
  args: {
    part: bash(),
    result: resultPart('error: command failed\nexit 1', {state: 'error', error: 'exit 1'}),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText(/exit 1/)).toBeInTheDocument()
  },
}

// Interaction test: long output is capped and the remainder is revealed by the "show more" details.
export const LongOutput: Story = {
  args: {
    part: bash(),
    result: resultPart(Array.from({length: 120}, (_, i) => `line ${i + 1}`).join('\n')),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.queryByText('line 120')).not.toBeInTheDocument()
    const summary = c.getByText(/show \d+ more lines/)
    await userEvent.click(summary)
    await expect(c.getByText(/line 120/)).toBeInTheDocument()
  },
}
