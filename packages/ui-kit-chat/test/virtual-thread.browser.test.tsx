import 'virtual:uno.css'
import {onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it, onTestFinished} from 'vitest'
import {keyBy, range, uniq} from 'es-toolkit'
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
const JUST_ABOVE_THRESHOLD = VIRTUALIZE_THRESHOLD + 2
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

function mountThread(initial: UIMessage[]): {
  host: HTMLElement
  viewport: () => HTMLElement
  chat: () => UseChatReturn
} {
  let viewport: HTMLElement | undefined
  let chat: UseChatReturn | undefined
  function VirtualThread(): JSX.Element {
    const value = useChat({connection: storyConnection({chunks: []}), initialMessages: initial})
    onMount(() => {
      chat = value
    })
    return (
      <ChatProvider chat={value}>
        <Thread.Root class="flex flex-col h-80 relative">
          <Thread.Viewport
            ref={(element) => {
              viewport = element
            }}
            class="p-2 flex flex-1 flex-col gap-2 min-h-0 overflow-y-auto"
            footer={
              <div class="flex pointer-events-none inset-inline-0 bottom-2 justify-center absolute">
                <Thread.ScrollToBottom class="pointer-events-auto">Latest</Thread.ScrollToBottom>
              </div>
            }
          >
            <Thread.Messages components={{UserMessage, AssistantMessage}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    )
  }
  const host = mountView(() => <VirtualThread />)
  return {
    host,
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

const PROBE_FRAMES = 60

const ON_SCREEN_SAMPLE_STEP_PX = 8

function messageIdOf(root: Element): string {
  return root.getAttribute('data-message-id') ?? ''
}

function rootsOnScreen(viewport: HTMLElement): Element[] {
  const box = viewport.getBoundingClientRect()
  const found = range(0, Math.floor(box.height / ON_SCREEN_SAMPLE_STEP_PX)).map((step) =>
    document
      .elementFromPoint(box.left + box.width / 2, box.top + 2 + step * ON_SCREEN_SAMPLE_STEP_PX)
      ?.closest('[data-message-id]'),
  )
  return uniq(found.filter((root): root is Element => root !== null && root !== undefined))
}

function rowUnderTopEdge(viewport: HTMLElement): string {
  const box = viewport.getBoundingClientRect()
  const found = document.elementFromPoint(box.left + box.width / 2, box.top + 1)
  return found?.closest('[data-index]')?.getAttribute('data-index') ?? 'none'
}

function heldEveryFrame(label: string): string {
  return `${label} held ${PROBE_FRAMES} of ${PROBE_FRAMES} frames`
}

function holdSteady(host: HTMLElement, label: string, read: () => string): void {
  const readout = document.createElement('p')
  readout.textContent = `${label} sampling`
  host.append(readout)
  const anchored = read()
  let seen = 0
  let held = 0
  const sample = (): void => {
    seen += 1
    if (read() === anchored) held += 1
    if (seen < PROBE_FRAMES) {
      requestAnimationFrame(sample)
      return
    }
    readout.textContent = `${label} held ${held} of ${PROBE_FRAMES} frames`
  }
  requestAnimationFrame(sample)
}

function appendTurnsEvery(chat: UseChatReturn, from: number, added: number, everyMs: number): () => void {
  let count = from
  const timer = setInterval(() => {
    if (count >= from + added) {
      clearInterval(timer)
      return
    }
    count += 2
    chat.setMessages(seedMessages(count))
  }, everyMs)
  return () => clearInterval(timer)
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

it('windows nothing below the threshold: every turn stays mounted', async () => {
  mountThread(seedMessages(WELL_BELOW_THRESHOLD))

  await expect.element(page.getByText(lastAnswer(WELL_BELOW_THRESHOLD))).toBeVisible()
  await expect.element(page.getByText('question 0')).toBeInTheDocument()
})

type EscapedThread = {thread: ReturnType<typeof mountThread>; latest: ReturnType<typeof page.getByRole>}

async function mountAndEscapeToTheTop(): Promise<EscapedThread> {
  const thread = mountThread(seedMessages(ABOVE_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()
  const latest = page.getByRole('button', {name: 'Scroll to bottom'})

  wheelUpTo(thread.viewport(), 0)
  await expect.element(latest).not.toBeDisabled()
  return {thread, latest}
}

it('escapes on wheel up and re-pins via the scroll-to-bottom button', async () => {
  const {thread, latest} = await mountAndEscapeToTheTop()
  await expect.element(page.elementLocator(thread.viewport())).not.toHaveAttribute('data-at-bottom')
  await expect.element(page.getByText('question 0')).toBeVisible()

  await latest.click()
  await expect.element(latest).toBeDisabled()
  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()
})

it('a wheel up taken right after the mount landing is never dragged back to the end', async () => {
  const thread = mountThread(seedMessages(ABOVE_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()

  wheelUpTo(thread.viewport(), 0)
  holdSteady(thread.host, 'mount landing offset', () => String(thread.viewport().scrollTop))

  await expect.element(page.getByText(heldEveryFrame('mount landing offset'))).toBeInTheDocument()
  await expect.element(page.getByText('question 0')).toBeVisible()
  await expect.element(page.elementLocator(thread.viewport())).not.toHaveAttribute('data-at-bottom')
})

it('a wheel up after the latest-turn gesture holds the reading row while turns keep arriving', async () => {
  const {thread, latest} = await mountAndEscapeToTheTop()

  const stopAppending = appendTurnsEvery(thread.chat(), ABOVE_THRESHOLD, 60, 30)
  onTestFinished(stopAppending)
  await latest.click()
  wheelUpTo(thread.viewport(), 0)
  holdSteady(thread.host, 'reading row', () => rowUnderTopEdge(thread.viewport()))

  await expect.element(page.getByText(heldEveryFrame('reading row'))).toBeInTheDocument()
  await expect.element(page.elementLocator(thread.viewport())).not.toHaveAttribute('data-at-bottom')
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

it('crossing the threshold keeps every on-screen turn root, and evicts only rows above the viewport', async () => {
  const thread = mountThread(seedMessages(JUST_BELOW_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(JUST_BELOW_THRESHOLD))).toBeVisible()
  await expect.element(page.getByText('question 0')).toBeInTheDocument()

  const onScreenBeforeCrossing = rootsOnScreen(thread.viewport())
  expect(onScreenBeforeCrossing.map(messageIdOf)).toContain(`m${JUST_BELOW_THRESHOLD - 1}`)

  thread.chat().setMessages(seedMessages(JUST_ABOVE_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(JUST_ABOVE_THRESHOLD))).toBeVisible()

  const rootsAfterCrossing = keyBy(Array.from(thread.viewport().querySelectorAll('[data-message-id]')), messageIdOf)
  const rebuilt = onScreenBeforeCrossing
    .filter((root) => {
      const after = rootsAfterCrossing[messageIdOf(root)]
      return after !== undefined && after !== root
    })
    .map(messageIdOf)
  expect(rebuilt).toEqual([])

  const evictedFromView = onScreenBeforeCrossing
    .filter((root) => rootsAfterCrossing[messageIdOf(root)] === undefined)
    .map(messageIdOf)
  expect(evictedFromView).toEqual([])

  thread.chat().setMessages(seedMessages(ABOVE_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()
  await expect.element(page.getByText('question 0')).not.toBeInTheDocument()
})

it('history prepend keeps the reading position while scrolled up', async () => {
  const thread = mountThread(seedMessages(ABOVE_THRESHOLD))
  await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD))).toBeVisible()

  wheelUpTo(thread.viewport(), 0)
  await expect.element(page.elementLocator(thread.viewport())).not.toHaveAttribute('data-at-bottom')
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

const TINY_THREAD = 3
const GROWN_THREAD = 13
const APPENDED_AFTER_PARKING = 6
function countScrollWrites(viewport: HTMLElement): {calls: () => number} {
  const native = viewport.scrollTo.bind(viewport)
  const seen = {count: 0}
  Object.defineProperty(viewport, 'scrollTo', {
    configurable: true,
    value: (options?: ScrollToOptions) => {
      seen.count += 1
      native(options)
    },
  })
  onTestFinished(() => {
    Reflect.deleteProperty(viewport, 'scrollTo')
  })
  return {calls: () => seen.count}
}

it('a reader parked at the top of a grown thread is left there when more turns arrive', async () => {
  const thread = mountThread(seedMessages(TINY_THREAD))
  await expect.element(page.getByText(lastAnswer(TINY_THREAD))).toBeVisible()

  thread.chat().setMessages(seedMessages(GROWN_THREAD))
  await expect.element(page.getByText(lastAnswer(GROWN_THREAD))).toBeVisible()

  wheelUpTo(thread.viewport(), 0)
  await expect.element(page.elementLocator(thread.viewport())).not.toHaveAttribute('data-at-bottom')
  await expect.element(page.getByText('question 0')).toBeVisible()

  thread.chat().setMessages(seedMessages(GROWN_THREAD + APPENDED_AFTER_PARKING))
  holdSteady(thread.host, 'parked at the top', () => String(thread.viewport().scrollTop))

  await expect.element(page.getByText(heldEveryFrame('parked at the top'))).toBeInTheDocument()
  await expect.element(page.getByText('question 0')).toBeVisible()
  expect(thread.viewport().scrollTop).toBe(0)
})

it('the latest-turn gesture writes the scroll position at most once', async () => {
  const {thread, latest} = await mountAndEscapeToTheTop()
  await expect.element(page.getByText('question 0')).toBeVisible()

  const writes = countScrollWrites(thread.viewport())
  await latest.click()
  await expect.element(latest).toBeDisabled()

  expect(writes.calls()).toBeLessThanOrEqual(1)
})
