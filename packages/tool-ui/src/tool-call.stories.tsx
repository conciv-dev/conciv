// The dispatch goes through the open registry now: a built-in name resolves to its card; a custom
// renderer registered via registerToolRenderer wins for its name. Storybook play-tests in a real
// browser, native assertions.
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {JSX} from 'solid-js'
import {ToolCallCard} from './tool-call.js'
import {registerToolRenderer} from './registry.js'
import {callPart, resultPart, noopCtx} from './fixtures.js'

const meta: Meta<typeof ToolCallCard> = {title: 'tool-ui/ToolCallCard', component: ToolCallCard}
export default meta
type Story = StoryObj<typeof ToolCallCard>

// A built-in tool name (Bash) resolves to the shell card through the registry.
export const Builtin: Story = {
  args: {
    part: callPart({name: 'Bash', arguments: JSON.stringify({command: 'echo hi'})}),
    result: resultPart('hi'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('echo hi')).toBeInTheDocument()
  },
}

function AcmeCard(): JSX.Element {
  return <div>Acme custom renderer</div>
}

// A custom renderer registered for a name wins over the generic fallback.
export const CustomRenderer: Story = {
  args: {
    part: callPart({name: 'acme_deploy', arguments: JSON.stringify({env: 'staging'})}),
    result: resultPart('{}'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    registerToolRenderer('acme_deploy', AcmeCard)
    const c = within(canvasElement)
    await expect(await c.findByText('Acme custom renderer')).toBeInTheDocument()
  },
}
