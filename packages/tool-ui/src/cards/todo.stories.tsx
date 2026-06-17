import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {TodoCard} from './todo.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof TodoCard> = {title: 'tool-ui/Todo', component: TodoCard}
export default meta
type Story = StoryObj<typeof TodoCard>

export const Mixed: Story = {
  args: {
    part: callPart({
      name: 'TodoWrite',
      input: {
        todos: [
          {content: 'Scaffold package', status: 'completed'},
          {content: 'Write the cards', activeForm: 'Writing the cards', status: 'in_progress'},
          {content: 'Wire the widget', status: 'pending'},
        ],
      },
    }),
    result: resultPart('ok'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('1/3')).toBeInTheDocument()
    await expect(c.getByText('Scaffold package')).toBeInTheDocument()
    // The active item renders its activeForm.
    await expect(c.getByText('Writing the cards')).toBeInTheDocument()
  },
}
