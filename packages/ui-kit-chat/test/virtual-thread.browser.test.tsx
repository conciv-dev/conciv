import 'virtual:uno.css'
import {onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {beforeEach} from 'vitest'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/primitives/thread/thread.js'
import {Message} from '../src/primitives/message/message.js'
import {virtualizeThreshold} from '../src/primitives/thread/virtualize-threshold.js'
import {mountView} from './mount-view.js'

beforeEach(() => {
  virtualizeThreshold.value = 50
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

function VirtualThread(props: {initial: UIMessage[]; expose?: (chat: UseChatReturn) => void}): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: []}), initialMessages: props.initial})
  onMount(() => props.expose?.(chat))
  return (
    <ChatProvider chat={chat}>
      <Thread.Root class="flex flex-col h-80">
        <Thread.Viewport class="p-2 flex flex-1 flex-col gap-2 min-h-0 overflow-y-auto">
          <Thread.Messages components={{UserMessage, AssistantMessage}} />
          <div class="h-0 self-center bottom-2 sticky">
            <Thread.ScrollToBottom>Latest</Thread.ScrollToBottom>
          </div>
        </Thread.Viewport>
      </Thread.Root>
    </ChatProvider>
  )
}

function viewportElement(container: HTMLElement): HTMLElement {
  const viewport = container.querySelector('[data-thread-viewport]')
  if (!(viewport instanceof HTMLElement)) throw new Error('viewport not mounted')
  return viewport
}

it('virtualizes above the threshold: subset mounted, pinned to the latest turn', async () => {
  const container = mountView(() => <VirtualThread initial={seedMessages(60)} />)

  await expect.element(page.getByText('answer 59')).toBeVisible()
  const viewport = viewportElement(container)
  expect(viewport.hasAttribute('data-at-bottom')).toBe(true)
  expect(viewport.querySelector('[data-index]')).not.toBeNull()
  expect(container.querySelector('[data-message-id="m0"]')).toBeNull()
  expect(viewport.querySelectorAll('[data-index]').length).toBeLessThan(40)
})

it('stays flat below the threshold', async () => {
  const container = mountView(() => <VirtualThread initial={seedMessages(20)} />)

  await expect.element(page.getByText('answer 19')).toBeVisible()
  const viewport = viewportElement(container)
  expect(viewport.querySelector('[data-index]')).toBeNull()
  expect(container.querySelector('[data-message-id="m0"]')).not.toBeNull()
})

it('escapes on wheel up and re-pins via the scroll-to-bottom button', async () => {
  const container = mountView(() => <VirtualThread initial={seedMessages(60)} />)
  await expect.element(page.getByText('answer 59')).toBeVisible()
  const viewport = viewportElement(container)
  const viewportLocator = page.elementLocator(viewport)
  const latest = page.getByRole('button', {name: 'Scroll to bottom'})

  viewport.dispatchEvent(new WheelEvent('wheel', {deltaY: -120, bubbles: true}))
  viewport.scrollTop = 0
  await expect.element(viewportLocator).toHaveAttribute('data-escaped')
  await expect.element(latest).not.toBeDisabled()

  await latest.click()
  await expect.element(latest).toBeDisabled()
  await expect.element(page.getByText('answer 59')).toBeVisible()
})

it('crossing the threshold while following keeps the bottom pinned', async () => {
  let chat: UseChatReturn | undefined
  const container = mountView(() => (
    <VirtualThread
      initial={seedMessages(49)}
      expose={(value) => {
        chat = value
      }}
    />
  ))
  await expect.element(page.getByText('answer 47')).toBeVisible()
  const viewport = viewportElement(container)
  expect(viewport.querySelector('[data-index]')).toBeNull()

  chat?.setMessages(seedMessages(60))
  await expect.element(page.getByText('answer 59')).toBeVisible()
  expect(viewport.querySelector('[data-index]')).not.toBeNull()
  expect(viewport.hasAttribute('data-at-bottom')).toBe(true)
})

it('history prepend keeps the virtual list coherent while scrolled up', async () => {
  let chat: UseChatReturn | undefined
  const container = mountView(() => (
    <VirtualThread
      initial={seedMessages(60)}
      expose={(value) => {
        chat = value
      }}
    />
  ))
  await expect.element(page.getByText('answer 59')).toBeVisible()
  const viewport = viewportElement(container)

  viewport.dispatchEvent(new WheelEvent('wheel', {deltaY: -120, bubbles: true}))
  viewport.scrollTop = 0
  await expect.element(page.elementLocator(viewport)).toHaveAttribute('data-escaped')
  await expect.element(page.getByText('question 0')).toBeVisible()

  const older: UIMessage[] = Array.from({length: 10}, (_, index) => ({
    id: `old${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    parts: [{type: 'text', content: `older ${index}`}],
  }))
  chat?.setMessages([...older, ...seedMessages(60)])

  await expect.element(page.getByText('question 0')).toBeVisible()
  expect(viewport.hasAttribute('data-at-bottom')).toBe(false)
})
