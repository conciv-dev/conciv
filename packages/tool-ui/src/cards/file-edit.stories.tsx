import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor, within} from 'storybook/test'
import {FileEditCard} from './file-edit.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof FileEditCard> = {title: 'tool-ui/FileEdit', component: FileEditCard}
export default meta
type Story = StoryObj<typeof FileEditCard>

// The diff body renders via @pierre/diffs into a <diffs-container> open shadow root.
function diffText(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('diffs-container')?.shadowRoot?.textContent ?? ''
}

export const Edit: Story = {
  args: {
    part: callPart({
      name: 'Edit',
      input: {file_path: 'src/styles.css', old_string: '.a {\n  color: red;\n}', new_string: '.a {\n  color: blue;\n}'},
    }),
    result: resultPart('ok'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Edited styles.css')).toBeInTheDocument()
    await expect(c.getByText('+3 −3')).toBeInTheDocument()
    await waitFor(() => {
      const text = diffText(canvasElement)
      expect(text).toContain('color: blue;')
      expect(text).toContain('color: red;')
    })
  },
}

export const Write: Story = {
  args: {
    part: callPart({name: 'Write', input: {file_path: 'src/new.ts', content: 'export const x = 1\n'}}),
    result: resultPart('ok'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Wrote new.ts')).toBeInTheDocument()
    await waitFor(() => expect(diffText(canvasElement)).toContain('export const x = 1'))
  },
}

export const Streaming: Story = {
  args: {
    part: callPart({name: 'Edit', state: 'input-streaming', input: undefined, arguments: '{"file_path":"src/a'}),
    result: undefined,
    ctx: noopCtx(),
  },
}
