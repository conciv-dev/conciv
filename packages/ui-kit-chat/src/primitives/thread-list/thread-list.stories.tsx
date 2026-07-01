import {createSignal, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ChatSessionMeta} from '@conciv/protocol/chat-types'
import {ThreadList, ThreadListItem} from './thread-list.js'
import {ThreadListProvider} from './thread-list-context.js'

const meta: Meta = {title: 'primitives/ThreadList'}
export default meta
type Story = StoryObj

function session(id: string, title: string): ChatSessionMeta {
  return {id, title, updatedAt: 0, messageCount: 3, running: false, origin: 'conciv', usage: null}
}

function Row(): JSX.Element {
  return (
    <ThreadListItem.Root class="px-2 py-1 rounded-pw-sm flex gap-2 items-center data-[active]:bg-pw-fill-strong">
      <ThreadListItem.Trigger class="text-[0.8125rem] text-pw-text-2 text-left flex-1">
        <ThreadListItem.Title />
      </ThreadListItem.Trigger>
      <ThreadListItem.Archive class="text-[0.6875rem] text-pw-text-3">Archive</ThreadListItem.Archive>
      <ThreadListItem.Delete class="text-[0.6875rem] text-pw-text-3">Delete</ThreadListItem.Delete>
    </ThreadListItem.Root>
  )
}

export const SelectAndCreate: Story = {
  render: () => {
    const [sessions] = createSignal<ChatSessionMeta[]>([session('s1', 'Fix the bug'), session('s2', 'Refactor auth')])
    const [activeId, setActiveId] = createSignal<string | null>('s1')
    const [log, setLog] = createSignal('')
    return (
      <ThreadListProvider
        value={{
          sessions,
          activeId,
          select: (id) => setActiveId(id),
          create: () => setLog('created'),
          archive: (id) => setLog(`archived ${id}`),
        }}
      >
        <ThreadList.Root class="flex flex-col gap-1 w-60">
          <ThreadList.New class="text-[0.75rem] text-pw-accent-link px-2 text-left">+ New chat</ThreadList.New>
          <ThreadList.Items components={{ThreadListItem: Row}} />
          <div>Active: {activeId()}</div>
          <div>Log: {log()}</div>
        </ThreadList.Root>
      </ThreadListProvider>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Fix the bug')).toBeVisible()
    await expect(c.getByText('Active: s1')).toBeVisible()
    await userEvent.click(c.getByText('Refactor auth'))
    await waitFor(() => expect(c.getByText('Active: s2')).toBeVisible())
    await userEvent.click(c.getByRole('button', {name: 'New chat'}))
    await waitFor(() => expect(c.getByText('Log: created')).toBeVisible())
    // Delete is gated off (no remove handler) → not rendered.
    await expect(c.queryByRole('button', {name: 'Delete'})).toBeNull()
    await expect(c.getAllByRole('button', {name: 'Archive'}).length).toBe(2)
  },
}
