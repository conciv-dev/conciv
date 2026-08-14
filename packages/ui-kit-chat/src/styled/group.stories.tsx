import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import Wrench from 'lucide-solid/icons/wrench'
import {Group} from './group.js'

const meta: Meta = {title: 'ui-kit-chat/styled/Group'}
export default meta
type Story = StoryObj

function Card(props: {name: string}): JSX.Element {
  return <div class="text-[0.75rem] px-2 py-1 [color:var(--chat-text)]">{props.name}</div>
}

export const CollapsedThenExpand: Story = {
  render: () => (
    <div class="p-3 w-96 [background:var(--chat-bg)]">
      <Group.Root>
        <Group.Trigger icon={<Wrench size={14} />} label="tool call" count={3} />
        <Group.Content class="pt-2">
          <Card name="read package.json" />
          <Card name="grep TODO" />
          <Card name="write report.md" />
        </Group.Content>
      </Group.Root>
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)

    const trigger = await waitFor(() => canvas.getByText('3 tool calls'))
    await expect(trigger).toBeVisible()
    expect(canvas.queryByText('grep TODO')).toBeNull()
    await userEvent.click(trigger)
    await waitFor(() => expect(canvas.getByText('grep TODO')).toBeVisible())
  },
}

export const SingularLabelOpen: Story = {
  render: () => (
    <div class="p-3 w-96 [background:var(--chat-bg)]">
      <Group.Root defaultOpen>
        <Group.Trigger icon={<Wrench size={14} />} label="tool call" count={1} />
        <Group.Content class="pt-2">
          <Card name="read README" />
        </Group.Content>
      </Group.Root>
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)

    await waitFor(() => expect(canvas.getByText('1 tool call')).toBeVisible())
    await expect(canvas.getByText('read README')).toBeVisible()
  },
}

export const Streaming: Story = {
  render: () => (
    <div class="p-3 w-96 [background:var(--chat-bg)]">
      <Group.Root streaming autoOpen>
        <Group.Trigger icon={<Wrench size={14} />} label="Working…" />
        <Group.Content class="pt-2">
          <Card name="read package.json" />
        </Group.Content>
      </Group.Root>
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)

    await waitFor(() => expect(canvas.getByText('Working…')).toBeVisible())
    await expect(canvas.getByText('read package.json')).toBeVisible()
  },
}
