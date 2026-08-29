import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {onMount, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'

const TURN_COUNT = 60
const LAST_TURN = TURN_COUNT - 1
const CODE_BODY = ['```ts', 'export function widen(value: number): number {', '  return value * 2', '}', '```'].join(
  '\n',
)

function answerBody(index: number): string {
  if (index % 5 === 0) return `answer ${index}\n\n${CODE_BODY}\n\ntail marker ${index}`
  if (index % 3 === 0) return `answer ${index}\n${'a long paragraph of prose that wraps across lines. '.repeat(8)}`
  return `answer ${index}\ntail marker ${index}`
}

function seed(count: number): UIMessage[] {
  return Array.from({length: count}, (_, index): UIMessage[] => [
    {id: `u${index}`, role: 'user', parts: [{type: 'text', content: `question ${index}`}]},
    {id: `a${index}`, role: 'assistant', parts: [{type: 'text', content: answerBody(index)}]},
  ]).flat()
}

type MountedThread = {
  container: HTMLElement
  unmount: () => void
  viewport: () => HTMLElement
  chat: () => UseChatReturn
}

function mountThread(initial: UIMessage[]): MountedThread {
  let chat: UseChatReturn | undefined
  function View(): JSX.Element {
    const value = useChat({connection: storyConnection({chunks: []}), initialMessages: initial})
    onMount(() => {
      chat = value
    })
    return (
      <ChatProvider chat={value}>
        <div style={{height: '420px', width: '560px'}}>
          <Thread>
            <Thread.Viewport>
              <Thread.Messages />
            </Thread.Viewport>
          </Thread>
        </div>
      </ChatProvider>
    )
  }
  const result = render(() => <View />)
  const viewport = () => {
    const found = result.container.querySelector('[data-thread-viewport]')
    if (!(found instanceof HTMLElement)) throw new Error('expected the thread viewport')
    return found
  }
  return {
    container: result.container,
    unmount: result.unmount,
    viewport,
    chat: () => {
      if (!chat) throw new Error('chat not mounted')
      return chat
    },
  }
}

function distanceFromEnd(viewport: HTMLElement): number {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
}

function virtualSpacer(viewport: HTMLElement): HTMLElement {
  const spacer = viewport.firstElementChild
  if (!(spacer instanceof HTMLElement)) throw new Error('expected the virtual spacer')
  return spacer
}

function turnElement(viewport: HTMLElement, id: string): HTMLElement {
  const found = viewport.querySelector(`[data-message-id="${id}"]`)
  if (!(found instanceof HTMLElement)) throw new Error(`expected the turn ${id} to be mounted`)
  return found
}

type SettledThread = {
  thread: MountedThread
  viewport: HTMLElement
}

async function mountSettledThread(): Promise<SettledThread> {
  const thread = mountThread(seed(TURN_COUNT))
  await expect.element(page.getByText(`tail marker ${LAST_TURN}`).first()).toBeVisible()
  await expect.element(page.elementLocator(thread.viewport())).toHaveAttribute('data-at-bottom', '')
  return {thread, viewport: thread.viewport()}
}

it('lands at the exact bottom of a long mixed-height thread on every mount', async () => {
  const misses: string[] = []
  for (let round = 0; round < 10; round++) {
    const settled = await mountSettledThread()
    const gap = distanceFromEnd(settled.viewport)
    const last = turnElement(settled.viewport, `a${LAST_TURN}`).getBoundingClientRect()
    const frame = settled.viewport.getBoundingClientRect()
    if (gap > 2) misses.push(`round ${round}: ${gap}px from the end`)
    if (last.bottom > frame.bottom + 2) misses.push(`round ${round}: last turn ${last.bottom - frame.bottom}px below`)
    if (last.bottom <= frame.top) misses.push(`round ${round}: last turn above the viewport`)
    settled.thread.unmount()
  }
  expect(misses).toEqual([])
})

it('holds the reading position when turns are appended while scrolled up', async () => {
  const settled = await mountSettledThread()

  await userEvent.wheel(settled.viewport, {delta: {y: -800}})
  await expect.element(page.elementLocator(settled.viewport)).not.toHaveAttribute('data-at-bottom')
  await expect.element(page.getByText('Latest')).toBeVisible()

  const spacer = virtualSpacer(settled.viewport)
  const sizedBefore = spacer.getAttribute('style') ?? ''
  const before = settled.viewport.scrollTop
  settled.thread.chat().setMessages([...seed(TURN_COUNT), ...seed(TURN_COUNT + 3).slice(TURN_COUNT * 2)])
  await expect.element(page.elementLocator(spacer)).not.toHaveAttribute('style', sizedBefore)

  expect(Math.abs(settled.viewport.scrollTop - before)).toBeLessThanOrEqual(1)
  await expect.element(page.getByText('Latest')).toBeVisible()
})

it('returns to the bottom and re-follows when Latest is pressed', async () => {
  const settled = await mountSettledThread()

  await userEvent.wheel(settled.viewport, {delta: {y: -800}})
  await expect.element(page.elementLocator(settled.viewport)).not.toHaveAttribute('data-at-bottom')

  await page.getByText('Latest').click()
  await expect.element(page.elementLocator(settled.viewport)).toHaveAttribute('data-at-bottom', '')
  await expect.element(page.getByText(`tail marker ${LAST_TURN}`).first()).toBeVisible()

  expect(distanceFromEnd(settled.viewport)).toBeLessThanOrEqual(2)
})

it('stays pinned to the end when turns are appended while following', async () => {
  const settled = await mountSettledThread()

  settled.thread.chat().setMessages([...seed(TURN_COUNT), ...seed(TURN_COUNT + 3).slice(TURN_COUNT * 2)])
  await expect.element(page.getByText(`tail marker ${TURN_COUNT + 2}`).first()).toBeVisible()

  expect(distanceFromEnd(settled.viewport)).toBeLessThanOrEqual(2)
})
