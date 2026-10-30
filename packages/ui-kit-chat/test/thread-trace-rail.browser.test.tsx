import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {createChat} from '@conciv/ai/client'
import type {ChatMessage} from '@conciv/ai'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ChatProvider} from '../src/store/chat-context.js'
import {ToolProvider} from '../src/store/tool-context.js'
import {storyConnection} from '@conciv/ai/testkit'
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

function tracedMessages(): ChatMessage[] {
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

function TracedThread(props: {messages: ChatMessage[]}): JSX.Element {
  const chat = createChat({threadId: 'thread-trace-rail', connection: storyConnection()})
  onMount(() => chat.setMessages(props.messages))
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

function traceRoot(): HTMLElement {
  const root = page.getByRole('button', {name: /trace/i}).element().closest('[data-part="root"]')
  if (!(root instanceof HTMLElement)) throw new Error('expected the trace collapsible root')
  return root
}

function traceArmsPath(): SVGPathElement {
  const path = traceRoot().querySelectorAll(':scope > svg > path')[1]
  if (!(path instanceof SVGPathElement)) throw new Error('expected the trace rail arms path')
  return path
}

it('ticks a rail arm onto the expanded rows of a thread trace', async () => {
  mountView(() => <TracedThread messages={tracedMessages()} />)

  await expect.element(page.getByText('Found it in watcher.ts.'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: /hide trace/i}), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('checking the event listeners first'), {timeout: 3000}).toBeVisible()

  await expect.element(page.elementLocator(traceArmsPath()), {timeout: 3000}).not.toHaveAttribute('d', '')
})
