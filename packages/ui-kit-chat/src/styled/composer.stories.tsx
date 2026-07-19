import {onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../store/chat-context.js'
import {createTextChunks, storyConnection} from '../store/story-connection.js'
import {Composer} from './composer.js'

const meta: Meta = {title: 'ui-kit-chat/styled/Composer'}
export default meta
type Story = StoryObj

function BusyComposer(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({chunks: createTextChunks('Working.'), chunkDelay: 2000}),
    queue: {whenBusy: 'queue', drain: 'fifo'},
  })
  onMount(() => void chat.sendMessage('active request'))
  return (
    <ChatProvider chat={chat}>
      <Composer inputLabel="Message" />
    </ChatProvider>
  )
}

export const BusyRemainsSendableAndRemovesQueued: Story = {
  render: () => <BusyComposer />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByRole('button', {name: 'Stop generating'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'Send message'})).toBeVisible()
    await userEvent.type(c.getByLabelText('Message'), 'queued follow-up')
    await userEvent.click(c.getByRole('button', {name: 'Send message'}))
    await waitFor(() => expect(c.getByText('queued follow-up')).toBeVisible())
    await userEvent.click(c.getByRole('button', {name: 'Remove from queue'}))
    await waitFor(() => expect(c.queryByText('queued follow-up')).toBeNull())
  },
}

export const SteerInterruptsWithSelectedContent: Story = {
  render: () => <BusyComposer />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByRole('button', {name: 'Stop generating'})).toBeVisible())
    const input = c.getByLabelText('Message')
    await userEvent.type(input, 'selected direction')
    await userEvent.click(c.getByRole('button', {name: 'Send message'}))
    await userEvent.type(input, 'remaining work')
    await userEvent.click(c.getByRole('button', {name: 'Send message'}))
    await waitFor(() => expect(c.getByText('selected direction')).toBeVisible())
    await userEvent.click(c.getAllByRole('button', {name: 'Steer'})[0]!)
    await waitFor(() => expect(c.queryByText('selected direction')).toBeNull())
    await expect(c.getByText('remaining work')).toBeVisible()
  },
}
