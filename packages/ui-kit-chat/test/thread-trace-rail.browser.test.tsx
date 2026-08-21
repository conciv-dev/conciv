import 'virtual:uno.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ChatProvider} from '../src/store/chat-context.js'
import {ToolProvider} from '../src/store/tool-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'

function toolCtx(): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    catalog: {loaded: () => true, meta: () => undefined},
    addResult: () => {},
  }
}

function tracedMessages(): UIMessage[] {
  return [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'find the leak'}]},
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {type: 'thinking', content: 'checking the event listeners first'},
        {
          type: 'tool-call',
          id: 'call1',
          name: 'bash',
          arguments: '{"command":"grep -rn addEventListener src"}',
          input: {command: 'grep -rn addEventListener src'},
          state: 'complete',
          output: 'src/watcher.ts:12',
        },
        {type: 'text', content: 'Found it in watcher.ts.'},
      ],
    },
  ]
}

function TracedThread(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages(tracedMessages()))
  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={toolCtx()}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ToolProvider>
    </ChatProvider>
  )
}

function traceArmsPath(): SVGPathElement {
  const trigger = page.getByRole('button', {name: /trace/i}).element()
  const path = trigger.closest('[data-part="root"]')?.querySelectorAll(':scope > svg > path')[1]
  if (!(path instanceof SVGPathElement)) throw new Error('expected the trace rail arms path')
  return path
}

it('ticks a rail arm onto the expanded rows of a thread trace', async () => {
  mountView(() => <TracedThread />)

  await expect.element(page.getByText('Found it in watcher.ts.'), {timeout: 3000}).toBeVisible()
  await page.getByRole('button', {name: /trace/i}).click()
  await expect.element(page.getByText('checking the event listeners first'), {timeout: 3000}).toBeVisible()

  await expect.element(page.elementLocator(traceArmsPath()), {timeout: 3000}).not.toHaveAttribute('d', '')
})
