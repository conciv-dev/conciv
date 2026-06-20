// Dispatch is by name over the tools array the host passes: a built-in name resolves to its card; an
// extension entry (same shape) resolves to its own renderer and wins over a built-in of the same name.
// Storybook play-tests in a real browser, native assertions. No registry, no globals.
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {JSX} from 'solid-js'
import {ToolCallCard} from './tool-call.js'
import {builtinToolCards} from './index.js'
import type {ToolCardEntry} from './types.js'
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
    tools: () => builtinToolCards,
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('echo hi')).toBeInTheDocument()
  },
}

function AcmeCard(): JSX.Element {
  return <div>Acme custom renderer</div>
}

// An extension tool entry (same {names, render} shape) resolves to its own renderer by name.
export const ExtensionTool: Story = {
  args: {
    part: callPart({name: 'acme_deploy', arguments: JSON.stringify({env: 'staging'})}),
    result: resultPart('{}'),
    ctx: noopCtx(),
    tools: (): ToolCardEntry[] => [{names: ['acme_deploy'], render: AcmeCard}, ...builtinToolCards],
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Acme custom renderer')).toBeInTheDocument()
  },
}
