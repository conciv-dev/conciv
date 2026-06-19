import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
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
    // Output is virtual-rendered, so it appears after the virtualizer's first measure.
    await waitFor(() => expect(c.getByText(/142 modules/)).toBeInTheDocument())
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
    await waitFor(() => expect(c.getByText(/exit 1/)).toBeInTheDocument())
  },
}

// Interaction test: the header is the collapse trigger — toggling it minimizes/expands the body.
// Asserted the user-facing way: the header is an expandable button, and the body's visibility tracks it.
export const CollapseToggle: Story = {
  args: {part: bash(), result: resultPart('✓ built in 1.8s · 142 modules'), ctx: noopCtx()},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    // The header is an expandable toggle button (aria-expanded) — the canonical user-facing state.
    await expect(c.getByRole('button', {name: /Ran pnpm build/, expanded: true})).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', {name: /Ran pnpm build/}))
    await c.findByRole('button', {name: /Ran pnpm build/, expanded: false})
    await userEvent.click(c.getByRole('button', {name: /Ran pnpm build/}))
    await c.findByRole('button', {name: /Ran pnpm build/, expanded: true})
  },
}

// Interaction test: long output is virtual-scrolled at a capped height — only the visible window is
// in the DOM, and scrolling to the bottom reveals the last line (which was never rendered before).
export const LongOutput: Story = {
  args: {
    part: bash(),
    result: resultPart(Array.from({length: 1000}, (_, i) => `line ${i + 1}`).join('\n')),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    // The scroll region is capped, not a 1000-line dump.
    const viewport = canvasElement.querySelector<HTMLElement>('[data-scope="scroll-area"][data-part="viewport"]')
    if (!viewport) throw new Error('virtual-lines viewport not found')
    await waitFor(() => expect(viewport.clientHeight).toBeLessThanOrEqual(360))
    // Virtualized: the last line is not rendered until we scroll to it.
    await expect(c.queryByText('line 1000')).not.toBeInTheDocument()
    viewport.scrollTo({top: viewport.scrollHeight})
    await waitFor(() => expect(c.getByText('line 1000')).toBeInTheDocument())
    // Only Ark's custom scrollbar shows — the native one is hidden, so there are not two scrollbars.
    await expect(getComputedStyle(viewport).scrollbarWidth).toBe('none')
  },
}
