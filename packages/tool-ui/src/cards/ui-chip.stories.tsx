import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {UiCard} from './ui-chip.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof UiCard> = {title: 'tool-ui/UiChip', component: UiCard}
export default meta
type Story = StoryObj<typeof UiCard>

export const Form: Story = {
  args: {
    part: callPart({name: 'mandarax_ui', input: {kind: 'form', title: 'Add a project'}}),
    result: resultPart('{"injected":true}'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Rendered a form')).toBeInTheDocument()
  },
}

export const Confirm: Story = {
  args: {
    part: callPart({name: 'mandarax_ui', input: {kind: 'confirm', question: 'Delete the file?'}}),
    result: resultPart('{"injected":true}'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Rendered a confirmation')).toBeInTheDocument()
    await expect(c.getByText('Delete the file?')).toBeInTheDocument()
  },
}
