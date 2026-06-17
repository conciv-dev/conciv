import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {FileReadCard} from './file-read.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof FileReadCard> = {title: 'tool-ui/FileRead', component: FileReadCard}
export default meta
type Story = StoryObj<typeof FileReadCard>

// claude's Read result prefixes each line with "<N>\t" (TAB); the card strips it before highlighting.
// The strip itself is unit-tested (stripReadLineNumbers) — stories assert the user-facing header.
const READ_RESULT = '1\texport function greet(name: string) {\n2\t  return `hi ${name}`\n3\t}'

export const Read: Story = {
  args: {
    part: callPart({name: 'Read', input: {file_path: 'src/greet.ts', offset: 10, limit: 40}}),
    result: resultPart(READ_RESULT),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Read src/greet.ts')).toBeVisible()
    await expect(c.getByText(':10-50')).toBeVisible()
  },
}

// A long file renders without error (its height is capped by CSS so it can't blow the thread).
export const LongRead: Story = {
  args: {
    part: callPart({name: 'Read', input: {file_path: 'src/big.ts'}}),
    result: resultPart(Array.from({length: 160}, (_, i) => `${i + 1}\tconst v${i} = ${i}`).join('\n')),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Read src/big.ts')).toBeVisible()
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
    await expect(c.getByText('Opened src/routes/index.tsx')).toBeVisible()
  },
}
