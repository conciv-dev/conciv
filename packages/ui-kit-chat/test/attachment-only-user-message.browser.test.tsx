import 'virtual:uno.css'
import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {MultimodalContent} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

function imagePart() {
  return {type: 'image', source: {type: 'data', value: GIF, mimeType: 'image/gif'}} as const
}

function withText(): MultimodalContent {
  return {content: [{type: 'text', content: 'here it is'}, imagePart()]}
}

function ThreadHost(props: {content: () => MultimodalContent}): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: [], chunkDelay: 2})})
  return (
    <ChatProvider chat={chat}>
      <button type="button" onClick={() => void chat.sendMessage(props.content())}>
        send
      </button>
      <Thread>
        <Thread.Viewport>
          <Thread.Messages />
        </Thread.Viewport>
      </Thread>
    </ChatProvider>
  )
}

it('a user message that carries text still renders it', async () => {
  mountView(() => <ThreadHost content={withText} />)

  await page.getByRole('button', {name: 'send'}).click()

  await expect.element(page.getByText('here it is'), {timeout: 2000}).toBeVisible()
})
