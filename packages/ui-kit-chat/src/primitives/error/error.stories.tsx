import {onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createChat, type Chat} from '@conciv/client/chat'
import {ChatProvider} from '../../store/chat-context.js'
import {storyConnection} from '@internal/test-utils'
import {Error} from './error.js'
import {storyErrors} from '@conciv/errors'

const meta: Meta = {title: 'ui-kit-chat/primitives/Error'}
export default meta
type Story = StoryObj

function ErrorApp(props: {expose: (chat: Chat) => void}): JSX.Element {
  const chat = createChat({
    threadId: 'error',
    connection: storyConnection({
      shouldError: true,
      error: storyErrors.SAMPLE_FAILURE({message: 'Stream failed: 500'}),
    }),
  })
  onMount(() => props.expose(chat))
  return (
    <ChatProvider chat={chat}>
      <Error.Root class="text-[0.75rem] text-chat-danger flex gap-2 items-center">
        <Error.Message />
      </Error.Root>
    </ChatProvider>
  )
}

export const ShowsRunError: Story = {
  render: () => {
    let chat: Chat | undefined
    return (
      <div>
        <button type="button" onClick={() => void chat?.sendMessage('go')}>
          run
        </button>
        <ErrorApp
          expose={(value) => {
            chat = value
          }}
        />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('run'))
    await waitFor(() => expect(c.getByText(/Stream failed: 500/)).toBeVisible(), {timeout: 4000})
  },
}
