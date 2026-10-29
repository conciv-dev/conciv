import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {onMount, type JSX} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {VIRTUALIZE_THRESHOLD} from '../src/primitives/thread/virtualize-threshold.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'

const exchangeCount = VIRTUALIZE_THRESHOLD
const lastExchange = exchangeCount - 1

function longThread(): UIMessage[] {
  return Array.from({length: exchangeCount}, (_, index): UIMessage[] => [
    {id: `u${index}`, role: 'user', parts: [{type: 'text', content: `question number ${index}`}]},
    {id: `a${index}`, role: 'assistant', parts: [{type: 'text', content: `answer number ${index}\n`.repeat(6)}]},
  ]).flat()
}

function TallThread(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages(longThread()))
  return (
    <ChatProvider chat={chat}>
      <div style={{height: '360px', width: '520px'}}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </div>
    </ChatProvider>
  )
}

function viewportEl(container: HTMLElement): HTMLElement {
  const viewport = container.querySelector('[data-thread-viewport]')
  if (!(viewport instanceof HTMLElement)) throw new Error('expected the thread viewport')
  return viewport
}

function chipWrapper(container: HTMLElement): HTMLElement {
  const wrapper = viewportEl(container).nextElementSibling
  if (!(wrapper instanceof HTMLElement)) throw new Error('expected the latest chip wrapper')
  return wrapper
}

it('shows the Latest chip as an overlay outside the scroll content of a virtualized thread', async () => {
  const container = mountView(() => <TallThread />)
  await expect.element(page.getByText(`answer number ${lastExchange}`).first()).toBeVisible()
  await expect.element(page.getByText('question number 0')).not.toBeInTheDocument()

  const viewport = viewportEl(container)
  await expect.element(page.elementLocator(viewport)).toHaveAttribute('data-at-bottom', '')
  expect(chipWrapper(container).inert).toBe(true)

  await userEvent.wheel(viewport, {delta: {y: -600}})
  await expect.element(page.elementLocator(viewport)).not.toHaveAttribute('data-at-bottom')
  await expect.element(page.getByText('Latest')).toBeVisible()
  expect(chipWrapper(container).inert).toBe(false)
  expect(viewport.contains(chipWrapper(container))).toBe(false)

  await page.getByText('Latest').click()
  await expect.element(page.elementLocator(viewport)).toHaveAttribute('data-at-bottom', '')
  await expect.element(page.getByText(`answer number ${lastExchange}`).first()).toBeVisible()
  expect(chipWrapper(container).inert).toBe(true)
})
