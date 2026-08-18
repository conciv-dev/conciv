import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {SessionStatus} from '@conciv/ui-kit-chat'
import MessageSquare from 'lucide-solid/icons/message-square'
import {StatusBar, type StatusBarView} from './status-bar.js'

const meta: Meta<typeof StatusBar> = {title: 'conciv/pane/StatusBar', component: StatusBar}
export default meta
type Story = StoryObj<typeof StatusBar>

const views: StatusBarView[] = [
  {id: 'chat', label: 'Chat'},
  {id: 'activity', label: 'Activity', icon: MessageSquare},
]

function statusStory(status: SessionStatus, diff = {files: 3, adds: 42, dels: 11}, elapsedLabel = '02:14'): Story {
  return {
    render: () => (
      <StatusBar
        status={status}
        elapsedLabel={elapsedLabel}
        diff={diff}
        views={views}
        activeView="chat"
        onSelectView={() => {}}
        disabled={false}
      />
    ),
  }
}

export const Running: Story = statusStory({kind: 'running', label: 'RUNNING'})
export const RunningQueued: Story = statusStory({kind: 'running', label: 'RUNNING 1/3'})
export const Waiting: Story = statusStory({kind: 'waiting', label: 'WAITING'})
export const Failed: Story = statusStory({kind: 'failed', label: 'FAILED'})
export const Done: Story = statusStory({kind: 'done', label: 'DONE'}, {files: 0, adds: 0, dels: 0}, '05:41')
