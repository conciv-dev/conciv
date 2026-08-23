import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
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

function runningStepMessages(): UIMessage[] {
  return [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'ship it'}]},
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          id: 'call1',
          name: 'bash',
          arguments: '{"command":"pnpm lint"}',
          input: {command: 'pnpm lint'},
          state: 'complete',
          output: 'no problems',
        },
        {
          type: 'tool-call',
          id: 'call2',
          name: 'bash',
          arguments: '{"command":"pnpm test"}',
          input: {command: 'pnpm test'},
          state: 'input-complete',
        },
        {type: 'text', content: 'Running the suite.'},
      ],
    },
  ]
}

function TracedThread(props: {messages: UIMessage[]}): JSX.Element {
  const chat = useChat({connection: storyConnection()})
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

function traceRunSvg(): SVGSVGElement {
  const svg = traceRoot().querySelectorAll(':scope > svg')[1]
  if (!(svg instanceof SVGSVGElement)) throw new Error('expected the trace run segment svg')
  return svg
}

function traceRowAnchor(index: number): number {
  const root = traceRoot()
  const gutter = Number.parseFloat(getComputedStyle(root).getPropertyValue('--chat-trace-gutter'))
  const row = root.querySelector('ul')?.querySelectorAll(':scope > li')[index]
  if (!(row instanceof HTMLElement)) throw new Error(`expected trace row ${index}`)
  return row.getBoundingClientRect().top - root.getBoundingClientRect().top + gutter / 2
}

function segmentEdge(name: string): number {
  return Number.parseFloat(getComputedStyle(traceRunSvg()).getPropertyValue(name))
}

it('ticks a rail arm onto the expanded rows of a thread trace', async () => {
  mountView(() => <TracedThread messages={tracedMessages()} />)

  await expect.element(page.getByText('Found it in watcher.ts.'), {timeout: 3000}).toBeVisible()
  await page.getByRole('button', {name: /trace/i}).click()
  await expect.element(page.getByText('checking the event listeners first'), {timeout: 3000}).toBeVisible()

  await expect.element(page.elementLocator(traceArmsPath()), {timeout: 3000}).not.toHaveAttribute('d', '')
})

it('lights the inbound connector of the running step, not of the last part of the turn', async () => {
  mountView(() => <TracedThread messages={runningStepMessages()} />)

  await expect.element(page.getByText('Running the suite.'), {timeout: 3000}).toBeVisible()
  await page.getByRole('button', {name: /trace/i}).click()
  await expect.element(page.getByText('pnpm test', {exact: true}), {timeout: 3000}).toBeVisible()

  await expect.element(page.elementLocator(traceRunSvg()), {timeout: 3000}).toHaveStyle({opacity: '1'})

  expect(Math.abs(segmentEdge('--rail-top') - traceRowAnchor(0))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(segmentEdge('--rail-bottom') - traceRowAnchor(1))).toBeLessThanOrEqual(0.5)
})
