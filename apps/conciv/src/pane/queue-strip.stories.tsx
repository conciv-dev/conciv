import {onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {createChat} from '@conciv/ai/client'
import {ChatProvider} from '@conciv/ui-kit-chat'
import {createTextChunks, storyConnection} from '@conciv/ai/testkit'
import {QueueStrip} from './queue-strip.js'

const meta: Meta = {title: 'conciv/pane/QueueStrip'}
export default meta
type Story = StoryObj

function QueuedThread(props: {count: number}): JSX.Element {
  const chat = createChat({
    threadId: 'queue-strip',
    connection: storyConnection({chunks: createTextChunks('Working.'), chunkDelay: 4000}),
    queue: {whenBusy: 'queue', drain: 'fifo'},
  })
  onMount(() => {
    void chat.sendMessage('active request')
    for (let index = 0; index < props.count; index += 1) void chat.sendMessage(`queued instruction ${index + 1}`)
  })
  return (
    <ChatProvider chat={chat}>
      <QueueStrip queue={chat.queue()} />
    </ChatProvider>
  )
}

export const ThreeQueued: Story = {render: () => <QueuedThread count={3} />}
export const OverflowQueue: Story = {render: () => <QueuedThread count={5} />}
