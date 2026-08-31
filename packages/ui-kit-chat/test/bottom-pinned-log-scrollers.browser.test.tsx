import 'virtual:uno.css'
import {createSignal, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import type {UIMessage} from '@tanstack/ai-client'
import {Activity} from '../src/styled/activity.js'
import {mountView} from './mount-view.js'

const FULLY_IN_VIEWPORT = {ratio: 0.99}
const LINE_COUNT = 60

function turns(count: number): UIMessage[] {
  return Array.from({length: count}, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    parts: [{type: 'text', content: `timeline entry ${index}`}],
  }))
}

it('keeps the newest activity turn showing as the timeline grows', async () => {
  const [messages, setMessages] = createSignal(turns(3))
  function View(): JSX.Element {
    return (
      <div class="flex flex-col h-96 w-96">
        <Activity.Root messages={messages()}>
          <Activity.Timeline aria-label="Activity" />
        </Activity.Root>
      </div>
    )
  }
  mountView(() => <View />)

  await expect.element(page.getByText('timeline entry 0')).toBeInViewport(FULLY_IN_VIEWPORT)

  setMessages(turns(LINE_COUNT))

  await expect.element(page.getByText(`timeline entry ${LINE_COUNT - 1}`)).toBeInViewport(FULLY_IN_VIEWPORT)
  await expect.element(page.getByText('timeline entry 0')).not.toBeInViewport()
})
