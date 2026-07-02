import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor} from 'storybook/test'
import {SolidFileDiff} from './file-diff.js'

const meta: Meta<typeof SolidFileDiff> = {title: 'solid-diffs/FileDiff', component: SolidFileDiff}
export default meta
type Story = StoryObj<typeof SolidFileDiff>

async function shadowText(canvasElement: HTMLElement): Promise<string> {
  const host = canvasElement.querySelector('diffs-container')
  return host?.shadowRoot?.textContent ?? ''
}

export const TypeScript: Story = {
  args: {
    oldFile: {name: 'sum.ts', contents: 'export function sum(a: number, b: number) {\n  return a - b\n}\n'},
    newFile: {name: 'sum.ts', contents: 'export function sum(a: number, b: number) {\n  return a + b\n}\n'},
  },
  play: async ({canvasElement}) => {
    await waitFor(async () => {
      const text = await shadowText(canvasElement)
      expect(text).toContain('return a + b')
      expect(text).toContain('return a - b')
    })
  },
}

export const CssEdit: Story = {
  args: {
    oldFile: {name: 'styles.css', contents: '.a {\n  color: red;\n}\n'},
    newFile: {name: 'styles.css', contents: '.a {\n  color: blue;\n}\n'},
  },
  play: async ({canvasElement}) => {
    await waitFor(async () => {
      const text = await shadowText(canvasElement)
      expect(text).toContain('color: blue;')
    })
  },
}
