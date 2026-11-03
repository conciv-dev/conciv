import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {SessionStatus} from '@conciv/ui-kit-chat'
import type {JSX} from 'solid-js'
import MessageSquare from 'lucide-solid/icons/message-square'
import {RouterProvider, createMemoryHistory, createRootRoute, createRouter} from '@tanstack/solid-router'
import {StatusBar, type StatusBarView} from './status-bar.js'

const meta: Meta<typeof StatusBar> = {title: 'conciv/pane/StatusBar', component: StatusBar}
export default meta
type Story = StoryObj<typeof StatusBar>

const views: StatusBarView[] = [
  {id: 'chat', label: 'Chat'},
  {id: 'activity', label: 'Activity', icon: MessageSquare},
]

function routed(view: () => JSX.Element): JSX.Element {
  const router = createRouter({
    routeTree: createRootRoute({component: view}),
    history: createMemoryHistory({initialEntries: ['/']}),
  })
  return <RouterProvider router={router} />
}

function statusStory(status: SessionStatus, diff = {files: 3, adds: 42, dels: 11}, elapsedLabel = '02:14'): Story {
  return {
    render: () =>
      routed(() => (
        <StatusBar
          status={status}
          elapsedLabel={elapsedLabel}
          diff={diff}
          views={views}
          activeView="chat"
          onSelectView={() => {}}
          disabled={false}
        />
      )),
  }
}

export const Running: Story = statusStory({kind: 'running', label: 'RUNNING'})
export const RunningQueued: Story = statusStory({kind: 'running', label: 'RUNNING 1/3'})
export const Waiting: Story = statusStory({kind: 'waiting', label: 'WAITING'})
export const Failed: Story = statusStory({kind: 'failed', label: 'FAILED'})
export const Done: Story = statusStory({kind: 'done', label: 'DONE'}, {files: 0, adds: 0, dels: 0}, '05:41')
