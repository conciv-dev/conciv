import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor, within} from 'storybook/test'
import {FileReadCard} from './file-read.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof FileReadCard> = {title: 'tool-ui/FileRead', component: FileReadCard}
export default meta
type Story = StoryObj<typeof FileReadCard>

// The Read contents render via @pierre/diffs into the <diffs-container> shadow root.
function codeText(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('diffs-container')?.shadowRoot?.textContent ?? ''
}

// claude's Read result prefixes each line with "   N→"; the card strips it before highlighting.
const READ_RESULT = '     1→export function greet(name: string) {\n     2→  return `hi ${name}`\n     3→}'

export const Read: Story = {
  args: {
    part: callPart({name: 'Read', input: {file_path: 'src/greet.ts', offset: 10, limit: 40}}),
    result: resultPart(READ_RESULT),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Read src/greet.ts')).toBeInTheDocument()
    await expect(c.getByText(':10-50')).toBeInTheDocument()
    await waitFor(() => {
      const text = codeText(canvasElement)
      expect(text).toContain('export function greet')
      // The line-number prefix is stripped from the highlighted source.
      expect(text).not.toContain('1→')
    })
  },
}

export const Opened: Story = {
  args: {
    part: callPart({name: 'aidx_open', input: {file: 'src/routes/index.tsx', line: 12}}),
    result: resultPart('{"ok":true}'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Opened src/routes/index.tsx')).toBeInTheDocument()
    // aidx_open just opens the editor — no embedded code view.
    await expect(canvasElement.querySelector('diffs-container')).toBeNull()
  },
}
