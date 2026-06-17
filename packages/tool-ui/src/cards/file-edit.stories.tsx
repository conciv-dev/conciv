import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {FileEditCard} from './file-edit.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof FileEditCard> = {title: 'tool-ui/FileEdit', component: FileEditCard}
export default meta
type Story = StoryObj<typeof FileEditCard>

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
    await expect(c.getByText(/color: blue;/)).toBeInTheDocument()
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
  },
}

export const Streaming: Story = {
  args: {
    part: callPart({name: 'Edit', state: 'input-streaming', input: undefined, arguments: '{"file_path":"src/a'}),
    result: undefined,
    ctx: noopCtx(),
  },
}
