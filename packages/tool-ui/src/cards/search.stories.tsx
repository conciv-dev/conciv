import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {SearchCard} from './search.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof SearchCard> = {title: 'tool-ui/Search', component: SearchCard}
export default meta
type Story = StoryObj<typeof SearchCard>

export const Grep: Story = {
  args: {
    part: callPart({name: 'Grep', input: {pattern: 'useChat', path: 'src'}}),
    result: resultPart('src/a.tsx:1\nsrc/b.tsx:4\nsrc/c.tsx:9'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Searched useChat')).toBeInTheDocument()
    await expect(c.getByText('3 matches')).toBeInTheDocument()
  },
}

export const OneMatch: Story = {
  args: {
    part: callPart({name: 'Grep', input: {pattern: 'main'}}),
    result: resultPart('src/index.ts:1'),
    ctx: noopCtx(),
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('1 match')).toBeInTheDocument()
  },
}

export const Glob: Story = {
  args: {part: callPart({name: 'Glob', input: {pattern: '**/*.css'}}), result: resultPart(''), ctx: noopCtx()},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Globbed **/*.css')).toBeInTheDocument()
    await expect(c.getByText('0 matches')).toBeInTheDocument()
  },
}
