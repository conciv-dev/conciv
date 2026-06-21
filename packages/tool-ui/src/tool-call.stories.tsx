// Dispatch is by name over the tools array the host passes: a built-in name resolves to its card; an
// extension entry (same shape) resolves to its own renderer and wins over a built-in of the same name.
// Storybook play-tests in a real browser, native assertions. No registry, no globals.
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {z} from 'zod'
import {defineTool, type ToolDefinition} from '@mandarax/extensions'
import {ToolCallCard} from './tool-call.js'
import {builtinTools} from './index.js'
import {callPart, resultPart, noopCtx} from './fixtures.js'

const meta: Meta<typeof ToolCallCard> = {title: 'tool-ui/ToolCallCard', component: ToolCallCard}
export default meta
type Story = StoryObj<typeof ToolCallCard>

// A built-in tool name (Bash) resolves to the shell card from the built-in array.
export const Builtin: Story = {
  args: {
    part: callPart({name: 'Bash', arguments: JSON.stringify({command: 'echo hi'})}),
    result: resultPart('hi'),
    ctx: noopCtx(),
    tools: () => builtinTools,
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('echo hi')).toBeInTheDocument()
  },
}

const acmeTool = defineTool({
  name: 'acme_deploy',
  label: 'Acme',
  description: '',
  parameters: z.object({env: z.string().optional()}),
  renderResult: () => <div>Acme custom renderer</div>,
})

// An extension tool (same ToolDefinition shape) resolves to its own renderer by name.
export const ExtensionTool: Story = {
  args: {
    part: callPart({name: 'acme_deploy', arguments: JSON.stringify({env: 'staging'})}),
    result: resultPart('{}'),
    ctx: noopCtx(),
    tools: (): ToolDefinition[] => [acmeTool, ...builtinTools],
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Acme custom renderer')).toBeInTheDocument()
  },
}
