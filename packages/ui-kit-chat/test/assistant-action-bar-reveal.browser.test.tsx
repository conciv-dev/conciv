import 'virtual:uno.css'
import type {JSX} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../src/store/chat-context.js'
import {createTextChunks, storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'

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
          <Thread.Messages />
        </Thread.Viewport>
        <Thread.Composer>
          <span>composer region</span>
        </Thread.Composer>
      </Thread>
    </ChatProvider>
  )
}

async function mountWithAssistantReply(): Promise<void> {
  mountView(() => <ComposedThread />)
  await page.getByRole('button', {name: 'ask'}).click()
  await expect.element(page.getByText('On it.'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Copy'})).toBeVisible()
}

it('keeps the assistant action bar reachable by Tab without hovering the turn first', async () => {
  await mountWithAssistantReply()

  await userEvent.tab()

  await expect.element(page.getByRole('button', {name: 'Copy'})).toHaveFocus()
})

it('activates the copy action from the keyboard when the turn was never hovered', async () => {
  await mountWithAssistantReply()

  await userEvent.tab()
  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByRole('button', {name: 'Copy'})).toHaveAttribute('data-copied')
})
