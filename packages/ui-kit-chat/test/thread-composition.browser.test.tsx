import 'virtual:uno.css'
import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../src/store/chat-context.js'
import {createTextChunks, storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {cleanupViews, mountView} from './mount-view.js'

afterEach(() => {
  cleanupViews()
})

function ComposedThread(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({chunks: [...createTextChunks('On it.')], chunkDelay: 2}),
  })
  return (
    <ChatProvider chat={chat}>
      <button type="button" onClick={() => void chat.sendMessage('hello there')}>
        ask
      </button>
      <Thread>
        <Thread.Viewport>
          <Thread.Welcome>
            <span>Ask anything to begin.</span>
          </Thread.Welcome>
          <Thread.Messages />
          <span>footer line</span>
        </Thread.Viewport>
        <Thread.Composer>
          <span>composer region</span>
        </Thread.Composer>
      </Thread>
    </ChatProvider>
  )
}

it('shows welcome only while the thread is empty and keeps the composed regions', async () => {
  mountView(() => <ComposedThread />)

  await expect.element(page.getByText('Ask anything to begin.'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByText('composer region')).toBeVisible()
  await expect.element(page.getByText('footer line')).toBeVisible()

  await page.getByRole('button', {name: 'ask'}).click()

  await expect.element(page.getByText('hello there'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByText('On it.'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByText('Ask anything to begin.')).not.toBeInTheDocument()
  await expect.element(page.getByText('composer region')).toBeVisible()
})
