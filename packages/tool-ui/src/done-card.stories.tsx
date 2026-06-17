import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {DoneCard} from './done-card.js'

const meta: Meta<typeof DoneCard> = {title: 'tool-ui/DoneCard', component: DoneCard}
export default meta
type Story = StoryObj<typeof DoneCard>

export const Passed: Story = {
  args: {
    data: {
      message: 'Done — the tool cards are in place.',
      summary: 'Added the tool-ui cards and wired the dispatcher',
      filesChanged: ['packages/tool-ui/src/tool-call.tsx', 'packages/tool-ui/src/cards/shell.tsx'],
      pageActions: ['Clicked "Run tests"'],
      testsPassed: true,
    },
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Added the tool-ui cards and wired the dispatcher')).toBeInTheDocument()
    await expect(c.getByText('packages/tool-ui/src/cards/shell.tsx')).toBeInTheDocument()
    await expect(c.getByText('✓ tests passed')).toBeInTheDocument()
  },
}

export const Failed: Story = {
  args: {
    data: {
      message: 'I hit a failing test.',
      summary: 'Refactored the runner but one test fails',
      filesChanged: ['packages/core/src/runner.ts'],
      pageActions: [],
      testsPassed: false,
    },
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('✗ tests failed')).toBeInTheDocument()
  },
}
