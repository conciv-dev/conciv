import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {FileReadCard} from './file-read.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof FileReadCard> = {title: 'tool-ui/FileRead', component: FileReadCard}
export default meta
type Story = StoryObj<typeof FileReadCard>

export const Read: Story = {
  args: {
    part: callPart({name: 'Read', input: {file_path: 'src/app.tsx', offset: 10, limit: 40}}),
    result: resultPart('...file contents...'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Read src/app.tsx')).toBeInTheDocument()
    await expect(c.getByText(':10-50')).toBeInTheDocument()
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
  },
}
