import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect} from 'storybook/test'
import {CodeBlock, DiffBlock} from './code-block.js'

const meta: Meta = {title: 'ui-kit-chat/styled/CodeBlock'}
export default meta
type Story = StoryObj

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
  )
}

async function diffsText(canvasElement: HTMLElement): Promise<string> {
  return Array.from(canvasElement.querySelectorAll('diffs-container'))
    .map((host) => host.shadowRoot?.textContent ?? '')
    .join('\n')
}

const LONG_CONTENTS = Array.from({length: 80}, (_, index) => `line ${index + 1}: const value = ${index}`).join('\n')

export const CodeBlockXs: Story = {
  render: () =>
    frame(<CodeBlock size="xs" file={{name: 'script.js', lang: 'javascript', contents: 'const answer = 42'}} />),
  play: async ({canvasElement}) => {
    await expect(await diffsText(canvasElement)).toContain('const answer = 42')
  },
}

export const CodeBlockSm: Story = {
  render: () =>
    frame(<CodeBlock size="sm" file={{name: 'notes.txt', lang: 'text', contents: 'a larger result payload'}} />),
  play: async ({canvasElement}) => {
    await expect(await diffsText(canvasElement)).toContain('a larger result payload')
  },
}

export const CodeBlockLongContentScrolls: Story = {
  render: () =>
    frame(<CodeBlock size="xs" maxHeight="log" file={{name: 'output.log', lang: 'text', contents: LONG_CONTENTS}} />),
  play: async ({canvasElement}) => {
    const text = await diffsText(canvasElement)
    await expect(text).toContain('line 1: const value = 0')
    await expect(text).toContain('line 80: const value = 79')
  },
}

export const DiffBlockXs: Story = {
  render: () =>
    frame(
      <DiffBlock
        size="xs"
        file={{
          name: 'sum.ts',
          lang: 'typescript',
          before: 'export const sum = (a, b) => a + b',
          after: 'export const sum = (a: number, b: number) => a + b',
        }}
      />,
    ),
  play: async ({canvasElement}) => {
    const text = await diffsText(canvasElement)
    await expect(text).toContain('a: number')
  },
}

export const DiffBlockSm: Story = {
  render: () =>
    frame(<DiffBlock size="sm" file={{name: 'README.md', before: '# Title\nOld line', after: '# Title\nNew line'}} />),
  play: async ({canvasElement}) => {
    const text = await diffsText(canvasElement)
    await expect(text).toContain('New line')
  },
}
