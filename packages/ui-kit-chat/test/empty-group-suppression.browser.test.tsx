import 'virtual:uno.css'
import {onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {MessagePart, UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {PAGE_SESSION_GROUP_KEY, type GroupEntry, type GroupRenderProps} from '../src/store/grouping.js'
import {pageSessionCallParts, type PageSessionConfig} from '../src/store/page-session.js'
import {createReasoningChunks, storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'
import {haltRun, RunSettledIndicator, startRun} from './run-harness.js'

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
  await expect.element(page.getByRole('button', {name: 'Chain of Thought'})).not.toBeInTheDocument()
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

it('keeps a chain group for a thinking part that has content', async () => {
  mountView(
    staticThread([
      {type: 'thinking', content: 'weighing it'},
      {type: 'text', content: 'All set.'},
    ]),
  )

  const trigger = page.getByRole('button', {name: 'Chain of Thought'})
  await expect.element(trigger, {timeout: 3000}).toHaveAttribute('aria-expanded', 'false')
  await expect.element(page.getByText('weighing it')).not.toBeInTheDocument()

  await trigger.click()
  const reasoning = page.getByRole('button', {name: 'Reasoning'})
  await expect.element(reasoning, {timeout: 3000}).toBeVisible()

  await reasoning.click()
  await expect.element(page.getByText('weighing it'), {timeout: 3000}).toBeVisible()
})

function StreamingEmptyThinkingThread(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({
      chunks: [...createReasoningChunks(' ', 'blank-thought')],
      chunkDelay: 1,
      runsUntilStopped: true,
    }),
  })
  return (
    <ChatProvider chat={chat}>
      <button type="button" onClick={() => void chat.sendMessage('think')}>
        ask
      </button>
      <button type="button" onClick={() => void chat.stop()}>
        halt
      </button>
      <RunSettledIndicator />
      <Thread>
        <Thread.Viewport>
          <Thread.Messages />
        </Thread.Viewport>
      </Thread>
    </ChatProvider>
  )
}

it('opens no streaming group for a blank thinking part mid-run', async () => {
  mountView(() => <StreamingEmptyThinkingThread />)

  await startRun()
  await expect.element(page.getByRole('button', {name: 'Working…'})).not.toBeInTheDocument()

  await haltRun()
  await expect.element(page.getByRole('button', {name: 'Chain of Thought'})).not.toBeInTheDocument()
})

function StreamingThinkingThread(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({
      chunks: [...createReasoningChunks('mapping the repo')],
      chunkDelay: 30,
      runsUntilStopped: true,
    }),
  })
  return (
    <ChatProvider chat={chat}>
      <button type="button" onClick={() => void chat.sendMessage('think')}>
        ask
      </button>
      <button type="button" onClick={() => void chat.stop()}>
        halt
      </button>
      <RunSettledIndicator />
      <Thread>
        <Thread.Viewport>
          <Thread.Messages />
        </Thread.Viewport>
      </Thread>
    </ChatProvider>
  )
}

it('shows the group with its first member and the working label while the run streams', async () => {
  mountView(() => <StreamingThinkingThread />)

  await startRun()
  await expect.element(page.getByRole('button', {name: 'Working…'}), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('mapping the repo'), {timeout: 3000}).toBeVisible()

  await haltRun()
  await expect.element(page.getByRole('button', {name: 'Chain of Thought'}), {timeout: 3000}).toBeVisible()
})
