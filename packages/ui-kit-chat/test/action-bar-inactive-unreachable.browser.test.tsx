import 'virtual:uno.css'
import type {JSX} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import {EventType} from '@tanstack/ai'
import type {ConnectConnectionAdapter} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'

function twoDistinctRepliesConnection(): ConnectConnectionAdapter {
  let call = 0
  return {
    async *connect(_messages, _data, _abortSignal, runContext) {
      call += 1
      const messageId = `reply-${call}`
      const threadId = runContext?.threadId ?? 'story-thread'
      const runId = runContext?.runId ?? `story-run-${call}`
      yield {type: EventType.RUN_STARTED, threadId, runId}
      yield {type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
      yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'reply'}
      yield {type: EventType.TEXT_MESSAGE_END, messageId}
      yield {type: EventType.RUN_FINISHED, threadId, runId}
    },
  }
}

function ComposedThread(): JSX.Element {
  const chat = useChat({connection: twoDistinctRepliesConnection()})
  return (
    <ChatProvider chat={chat}>
      <button type="button" onClick={() => void chat.sendMessage('one')}>
        ask-one
      </button>
      <button type="button" onClick={() => void chat.sendMessage('two')}>
        ask-two
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

async function mountWithTwoAssistantReplies(): Promise<void> {
  mountView(() => <ComposedThread />)
  await page.getByRole('button', {name: 'ask-one'}).click()
  await expect.element(page.getByText('reply'), {timeout: 2000}).toBeVisible()
  await page.getByRole('button', {name: 'ask-two'}).click()
  await expect.element(page.getByText('reply').nth(1), {timeout: 2000}).toBeVisible()
}

it('keeps an autohidden, not-last action bar unreachable by Tab until it becomes active', async () => {
  await mountWithTwoAssistantReplies()

  await expect.element(page.getByRole('button', {name: 'ask-two'})).toHaveFocus()

  await userEvent.tab()

  await expect.element(page.getByRole('button', {name: 'Copy'}).last()).toHaveFocus()
})

it('restores reachability once the hidden bar becomes active on hover', async () => {
  await mountWithTwoAssistantReplies()

  const firstReplyText = page.getByText('reply').first()
  await firstReplyText.hover({force: true})

  await expect.element(page.getByRole('button', {name: 'Copy'}).first()).toBeVisible()

  await userEvent.tab()

  await expect.element(page.getByRole('button', {name: 'Copy'}).first()).toHaveFocus()
})
