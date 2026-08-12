import 'virtual:uno.css'
import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ChatProvider, useThread} from '../src/store/chat-context.js'
import {ToolProvider} from '../src/store/tool-context.js'
import {
  createApprovalChunk,
  createReasoningChunks,
  createToolCallChunks,
  storyConnection,
} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'

const bashMeta: ToolViewMeta = {
  summary: 'run a shell command',
  mutating: true,
  mirrors: false,
  approval: 'ask',
}

function approvalToolCtx(): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    catalog: {loaded: () => true, meta: (name) => (name === 'bash' ? bashMeta : undefined)},
    addResult: () => {},
    respondApproval: () => {},
  }
}

function RunSettledIndicator(): JSX.Element {
  const thread = useThread()
  return <span>{thread.isRunning ? 'run live' : 'run settled'}</span>
}

function ApprovalThread(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({
      chunks: [
        ...createReasoningChunks('deciding what to run'),
        ...createToolCallChunks('bash', {command: 'rm -rf tmp'}),
        createApprovalChunk('bash', {command: 'rm -rf tmp'}),
      ],
      chunkDelay: 30,
    }),
  })
  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={approvalToolCtx()}>
        <button type="button" onClick={() => void chat.sendMessage('run it')}>
          ask
        </button>
        <RunSettledIndicator />
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ToolProvider>
    </ChatProvider>
  )
}

it('keeps the chain open once the run settles so a pending approval on the newest tool call stays visible', async () => {
  mountView(() => <ApprovalThread />)

  await page.getByRole('button', {name: 'ask'}).click()

  await expect.element(page.getByText('run settled'), {timeout: 3000}).toBeVisible()

  await expect
    .element(page.getByRole('button', {name: 'Chain of Thought'}), {timeout: 3000})
    .toHaveAttribute('aria-expanded', 'true')
  await expect.element(page.getByText('Run this action?'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Allow'}), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Deny'})).toBeVisible()

  await page.getByRole('button', {name: 'Chain of Thought'}).click()

  await expect
    .element(page.getByRole('button', {name: 'Chain of Thought'}), {timeout: 3000})
    .toHaveAttribute('aria-expanded', 'false')
  await expect.element(page.getByText('Run this action?'), {timeout: 3000}).not.toBeVisible()
})
