import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {DoneCard as DoneData} from '@conciv/protocol/done-types'
import {DoneCard} from './done-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/DoneCard'}
export default meta
type Story = StoryObj

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

const data: DoneData = {
  message: 'Done.',
  summary: 'Folded the tool vocabulary into ui-kit-chat',
  filesChanged: ['styled/tools/todo-card.tsx', 'styled/tools/file-read-card.tsx'],
  pageActions: [],
  testsPassed: true,
}

export const Passed: Story = {
  render: () => frame('chat-theme-dark', <DoneCard data={data} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText(data.summary)).toBeVisible()
    await expect(c.getByText('tests passed')).toBeVisible()
  },
}

export const Failed: Story = {
  render: () =>
    frame('chat-theme-conciv', <DoneCard data={{...data, testsPassed: false, pageActions: ['Clicked Submit']}} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('tests failed')).toBeVisible()
    await expect(c.getByText('Clicked Submit')).toBeVisible()
  },
}
