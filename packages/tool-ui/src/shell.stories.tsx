import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {Wrench} from 'lucide-solid'
import type {ToolCallPart} from '@tanstack/ai-client'
import {ToolCard} from './shell.js'

const part: ToolCallPart = {
  type: 'tool-call',
  id: 't1',
  name: 'mandarax_page',
  arguments: '{}',
  state: 'complete',
  output: {ok: true},
}

// No `component` in meta: ToolCard's part/Icon props defeat storybook's argType docgen (throws on
// extract); the story renders via `render:` so the component reference isn't needed here.
const meta: Meta = {title: 'tool-ui/ToolCard'}
export default meta
type Story = StoryObj

// The header is the collapse trigger: clicking it hides the body, clicking again restores it.
export const Collapses: Story = {
  render: () => (
    <ToolCard accent="page" Icon={Wrench} title="route" part={part} result={undefined}>
      <p>the tool body that collapses</p>
    </ToolCard>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const body = c.getByText('the tool body that collapses')
    const header = c.getByRole('button', {name: 'route'})

    // waitFor: the collapse/expand is a 200ms height animation, so visibility settles after it ends.
    await expect(body).toBeVisible()
    await userEvent.click(header)
    await waitFor(() => expect(body).not.toBeVisible())
    await userEvent.click(header)
    await waitFor(() => expect(body).toBeVisible())
  },
}
