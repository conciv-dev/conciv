import 'virtual:uno.css'
import {onMount, type JSX} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {MessagePart, UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {PAGE_SESSION_GROUP_KEY, type GroupEntry, type GroupRenderProps} from '../src/store/grouping.js'
import {pageSessionCallParts, type PageSessionConfig} from '../src/store/page-session.js'
import {
  createReasoningChunks,
  createTextChunks,
  createToolCallChunks,
  storyConnection,
} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'
import {haltRun, startRun, streamingThread} from './run-harness.js'

function StubSessionCard(props: GroupRenderProps): JSX.Element {
  const parts = () => pageSessionCallParts(props.parts(), props.node.indices)
  return <span>{`session acts ${parts().length}`}</span>
}

const PAGE_SESSION_ENTRY: GroupEntry = {key: PAGE_SESSION_GROUP_KEY, render: StubSessionCard}

const PAGE_SESSION: PageSessionConfig = {
  entry: PAGE_SESSION_ENTRY,
  actNames: new Set(['page.fill']),
  toolPrefix: 'page.',
}

function dataPart(): MessagePart {
  return {type: 'structured-output', status: 'complete', raw: '{"done":true}'}
}

function staticThread(parts: MessagePart[], pageSession?: PageSessionConfig): () => JSX.Element {
  const messages: UIMessage[] = [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'go'}]},
    {id: 'a1', role: 'assistant', parts},
  ]
  return function StaticThread(): JSX.Element {
    const chat = useChat({connection: storyConnection()})
    onMount(() => chat.setMessages(messages))
    return (
      <ChatProvider chat={chat}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages pageSession={pageSession} />
          </Thread.Viewport>
        </Thread>
      </ChatProvider>
    )
  }
}

async function expectReplyWithoutChain(): Promise<void> {
  await expect.element(page.getByText('All set.'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: /trace/i})).not.toBeInTheDocument()
}

it('renders no group wrapper for a run of unrenderable data parts without a page session', async () => {
  mountView(staticThread([dataPart(), dataPart(), {type: 'text', content: 'All set.'}]))

  await expectReplyWithoutChain()
})

it('renders no group wrapper for a run of unrenderable data parts with a page session configured', async () => {
  mountView(staticThread([dataPart(), dataPart(), {type: 'text', content: 'All set.'}], PAGE_SESSION))

  await expectReplyWithoutChain()
  await expect.element(page.getByText(/session acts/)).not.toBeInTheDocument()
})

it('renders no reasoning group for a thinking part with only whitespace content', async () => {
  mountView(
    staticThread([
      {type: 'thinking', content: '   '},
      {type: 'text', content: 'All set.'},
    ]),
  )

  await expectReplyWithoutChain()
})

it('keeps a chain group for a thinking part once the segment also ran a tool', async () => {
  mountView(
    staticThread([
      {type: 'thinking', content: 'weighing it'},
      {type: 'tool-call', id: 'c1', name: 'Bash', arguments: '{"command":"ls"}', state: 'complete'},
      {type: 'text', content: 'All set.'},
    ]),
  )

  const trigger = page.getByRole('button', {name: /trace/i})
  await expect.element(trigger, {timeout: 3000}).toHaveAttribute('data-state', 'closed')
  await userEvent.click(trigger)
  await expect.element(trigger).toHaveAttribute('data-state', 'open')
  await expect.element(page.getByText('weighing it'), {timeout: 3000}).toBeVisible()
})

const BLANK_THINKING_CHUNKS = [
  ...createReasoningChunks(' ', 'blank-thought'),
  ...createTextChunks('blank run reply', 'blank-reply'),
]

it('opens no streaming group for a blank thinking part mid-run', async () => {
  mountView(streamingThread(BLANK_THINKING_CHUNKS, 1))

  await startRun()
  await expect.element(page.getByText('blank run reply'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: /trace/i})).not.toBeInTheDocument()

  await haltRun()
  await expect.element(page.getByRole('button', {name: /trace/i})).not.toBeInTheDocument()
})

const THINKING_THEN_TOOL_CHUNKS = [
  ...createReasoningChunks('mapping the repo'),
  ...createToolCallChunks('Bash', {command: 'ls'}),
]

it('shows the group with its first member expanded while the run streams', async () => {
  mountView(streamingThread(THINKING_THEN_TOOL_CHUNKS, 30))

  await startRun()
  const trigger = page.getByRole('button', {name: /trace/i})
  await expect.element(trigger, {timeout: 3000}).toHaveAttribute('data-state', 'open')
  await expect.element(page.getByText('mapping the repo'), {timeout: 3000}).toBeVisible()

  await haltRun()
  await expect.element(trigger, {timeout: 3000}).toBeVisible()
})
