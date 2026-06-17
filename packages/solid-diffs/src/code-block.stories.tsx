import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor} from 'storybook/test'
import {SolidCodeBlock} from './code-block.js'

const meta: Meta<typeof SolidCodeBlock> = {title: 'solid-diffs/CodeBlock', component: SolidCodeBlock}
export default meta
type Story = StoryObj<typeof SolidCodeBlock>

async function shadowText(canvasElement: HTMLElement): Promise<string> {
  const host = canvasElement.querySelector('diffs-container')
  return host?.shadowRoot?.textContent ?? ''
}

export const TypeScript: Story = {
  args: {
    file: {name: 'greet.ts', contents: 'export function greet(name: string) {\n  return `hello ${name}`\n}\n'},
  },
  play: async ({canvasElement}) => {
    await waitFor(async () => {
      const text = await shadowText(canvasElement)
      expect(text).toContain('export function greet')
      expect(text).toContain('hello ${name}')
    })
  },
}
