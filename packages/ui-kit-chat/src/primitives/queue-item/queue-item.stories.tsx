import {onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, fn, within, userEvent, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import type {MultimodalContent} from '@tanstack/ai-client'
import {ChatProvider} from '../../store/chat-context.js'
import {createTextChunks, storyConnection} from '../../store/story-connection.js'
import {ComposerHandlersProvider} from '../composer/composer-handlers.js'
import {Composer} from '../composer/composer.js'
import {QueueItem} from './queue-item.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/QueueItem'}
export default meta
type Story = StoryObj

const selectedContent: MultimodalContent = {
  content: [
    {type: 'text', content: 'also add a visual test'},
    {type: 'image', source: {type: 'url', value: 'https://example.com/queue.png'}},
  ],
}
const attachmentOnlyContent: MultimodalContent = {
  content: [{type: 'image', source: {type: 'url', value: 'https://example.com/only.png'}}],
}

function Queue(props: {onSteer: () => Promise<void>}): JSX.Element {
  const chat = useChat({
    connection: storyConnection({chunks: createTextChunks('Working.'), chunkDelay: 2000}),
    queue: {whenBusy: 'queue', drain: 'fifo'},
  })
  onMount(() => {
    void chat.sendMessage('active request')
    void chat.sendMessage(selectedContent)
    void chat.sendMessage('and update the docs')
    void chat.sendMessage(attachmentOnlyContent)
  })
  const sentContent = () =>
    chat
      .messages()
      .filter((message) => message.role === 'user')
      .at(-1)?.parts ?? []
  return (
    <ChatProvider chat={chat}>
      <ComposerHandlersProvider value={{onSteer: props.onSteer}}>
        <div class="flex flex-col gap-1">
          <Composer.Queue>
            {() => (
              <div class="text-[0.75rem] text-pw-text-2 flex gap-2 items-center">
                <QueueItem.Text class="flex-1" />
                <QueueItem.Steer class="text-pw-text-3">Steer</QueueItem.Steer>
                <QueueItem.Remove class="text-pw-text-3">×</QueueItem.Remove>
              </div>
            )}
          </Composer.Queue>
          <output data-sent>{JSON.stringify(sentContent())}</output>
        </div>
      </ComposerHandlersProvider>
    </ChatProvider>
  )
}

const steerHook = fn(async () => {})

export const NativeQueueActions: Story = {
  render: () => <Queue onSteer={steerHook} />,
  play: async ({canvasElement}) => {
    steerHook.mockClear()
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('also add a visual test')).toBeVisible())
    await expect(c.getByText('1 attachment')).toBeVisible()
    await expect(c.getAllByRole('button', {name: 'Steer'}).length).toBe(3)
    const [steer] = c.getAllByRole('button', {name: 'Steer'})
    if (steer) await userEvent.click(steer)
    await waitFor(() => expect(steerHook).toHaveBeenCalledOnce())
    await waitFor(() => expect(c.queryByText('also add a visual test')).toBeNull())
    await expect(c.getByText('and update the docs')).toBeVisible()
    await expect(c.getByText('1 attachment')).toBeVisible()
    await waitFor(() => expect(c.getByRole('status')).toHaveTextContent('also add a visual test'))
    await expect(c.getByRole('status')).toHaveTextContent('https://example.com/queue.png')
  },
}
