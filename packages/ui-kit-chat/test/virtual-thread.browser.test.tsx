import 'virtual:uno.css'
import {onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/primitives/thread/thread.js'
import {Message} from '../src/primitives/message/message.js'
import {VIRTUALIZE_THRESHOLD} from '../src/primitives/thread/virtualize-threshold.js'
import {mountView} from './mount-view.js'

const ABOVE_THRESHOLD = VIRTUALIZE_THRESHOLD * 4
const JUST_BELOW_THRESHOLD = VIRTUALIZE_THRESHOLD - 1
const WELL_BELOW_THRESHOLD = VIRTUALIZE_THRESHOLD - 5

function lastAnswer(count: number): string {
  return `answer ${count % 2 === 0 ? count - 1 : count - 2}`
}

const windowErrors: string[] = []
window.addEventListener('error', (event) => {
  windowErrors.push(typeof event.message === 'string' ? event.message : String(event))
})

function seedMessages(count: number): UIMessage[] {
  const messages: UIMessage[] = []
  for (let index = 0; index < count; index++) {
    const id = `m${index}`
    messages.push(
      index % 2 === 0
        ? {id, role: 'user', parts: [{type: 'text', content: `question ${index}`}]}
        : {id, role: 'assistant', parts: [{type: 'text', content: `answer ${index}\n${'line of prose. '.repeat(6)}`}]},
    )
  }
  return messages
}

function UserMessage(): JSX.Element {
  return (
    <Message.Root class="text-white px-2 py-1 rounded bg-blue-600 self-end">
      <Message.Parts />
    </Message.Root>
  )
}

function AssistantMessage(): JSX.Element {
  return (
    <Message.Root class="self-start">
      <Message.Parts />
    </Message.Root>
  )
}

function mountThread(initial: UIMessage[]): {viewport: () => HTMLElement; chat: () => UseChatReturn} {
  let viewport: HTMLElement | undefined
  let chat: UseChatReturn | undefined
  function VirtualThread(): JSX.Element {
    const value = useChat({connection: storyConnection({chunks: []}), initialMessages: initial})
    onMount(() => {
      chat = value
    })
    return (
      <ChatProvider chat={value}>
        <Thread.Root class="flex flex-col h-80">
          <Thread.Viewport
            ref={(element) => {
              viewport = element
            }}
            class="p-2 flex flex-1 flex-col gap-2 min-h-0 overflow-y-auto"
          >
            <Thread.Messages components={{UserMessage, AssistantMessage}} />
            <div class="h-0 self-center bottom-2 sticky">
              <Thread.ScrollToBottom>Latest</Thread.ScrollToBottom>
            </div>
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    )
  }
  mountView(() => <VirtualThread />)
  return {
    viewport: () => {
      if (!viewport) throw new Error('viewport not mounted')
      return viewport
    },
    chat: () => {
      if (!chat) throw new Error('chat not mounted')
      return chat
    },
  }
}

function wheelUpTo(viewport: HTMLElement, scrollTop: number): void {
  viewport.dispatchEvent(new WheelEvent('wheel', {deltaY: -120, bubbles: true}))
  viewport.scrollTop = scrollTop
}

it('virtualizes above the threshold: early turns unmount, pinned to the latest turn', async () => {
  const thread = mountThread(seedMessages(ABOVE_THRESHOLD))

  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()
  await expect.element(page.elementLocator(thread.viewport())).toHaveAttribute('data-at-bottom')
  await expect.element(page.getByText('question 0')).not.toBeInTheDocument()
})

it('virtualizing above the threshold never trips a ResizeObserver notification loop', async () => {
  windowErrors.length = 0
  mountThread(seedMessages(ABOVE_THRESHOLD))

  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()

  const loopErrors = windowErrors.filter((message) => message.includes('ResizeObserver loop'))
  expect(loopErrors).toEqual([])
})

it('stays flat below the threshold: every turn stays mounted', async () => {
  mountThread(seedMessages(WELL_BELOW_THRESHOLD))

  await expect.element(page.getByText(lastAnswer(WELL_BELOW_THRESHOLD))).toBeVisible()
  await expect.element(page.getByText('question 0')).toBeInTheDocument()
})

it('escapes on wheel up and re-pins via the scroll-to-bottom button', async () => {
  const thread = mountThread(seedMessages(ABOVE_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()
  const latest = page.getByRole('button', {name: 'Scroll to bottom'})

  wheelUpTo(thread.viewport(), 0)
  await expect.element(page.elementLocator(thread.viewport())).toHaveAttribute('data-escaped')
  await expect.element(latest).not.toBeDisabled()
  await expect.element(page.getByText('question 0')).toBeVisible()

  await latest.click()
  await expect.element(latest).toBeDisabled()
  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()
})

it('crossing the threshold while following keeps the bottom pinned', async () => {
  const thread = mountThread(seedMessages(JUST_BELOW_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(JUST_BELOW_THRESHOLD))).toBeVisible()
  await expect.element(page.getByText('question 0')).toBeInTheDocument()

  thread.chat().setMessages(seedMessages(ABOVE_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()
  await expect.element(page.getByText('question 0')).not.toBeInTheDocument()
  await expect.element(page.elementLocator(thread.viewport())).toHaveAttribute('data-at-bottom')
})

it('history prepend keeps the reading position while scrolled up', async () => {
  const thread = mountThread(seedMessages(ABOVE_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()

  wheelUpTo(thread.viewport(), 0)
  await expect.element(page.elementLocator(thread.viewport())).toHaveAttribute('data-escaped')
  await expect.element(page.getByText('question 0')).toBeVisible()

  const older: UIMessage[] = Array.from({length: 10}, (_, index) => ({
    id: `old${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    parts: [{type: 'text', content: `older ${index}`}],
  }))
  thread.chat().setMessages([...older, ...seedMessages(ABOVE_THRESHOLD)])

  await expect.element(page.getByText('question 0')).toBeVisible()
  await expect.element(page.elementLocator(thread.viewport())).not.toHaveAttribute('data-at-bottom')
})
