import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ToolGroup} from './tool-group.js'

const meta: Meta = {title: 'ui-kit-chat/styled/ToolGroup'}
export default meta
type Story = StoryObj

function Card(props: {name: string}): JSX.Element {
  return <div class="text-[0.75rem] px-2 py-1 [color:var(--chat-text)]">{props.name}</div>
}

export const CollapsedThenExpand: Story = {
  render: () => (
    <div class="p-3 w-96 [background:var(--chat-bg)]">
      <ToolGroup count={3}>
        <Card name="read package.json" />
        <Card name="grep TODO" />
        <Card name="write report.md" />
      </ToolGroup>
    </div>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    const trigger = await waitFor(() => c.getByText('3 tool calls'))
    await expect(trigger).toBeVisible()
    await expect(c.getByText('grep TODO')).not.toBeVisible()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByText('grep TODO')).toBeVisible())
  },
}

export const SingularLabel: Story = {
  render: () => (
    <div class="p-3 w-96 [background:var(--chat-bg)]">
      <ToolGroup count={1} defaultOpen>
        <Card name="read README" />
      </ToolGroup>
    </div>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByText('1 tool call')).toBeVisible())
    await expect(c.getByText('read README')).toBeVisible()
  },
}
