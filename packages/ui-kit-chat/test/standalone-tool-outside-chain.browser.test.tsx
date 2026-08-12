import 'virtual:uno.css'
import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {ToolCardEntry, ToolCardProps, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ChatProvider, useThread} from '../src/store/chat-context.js'
import {ToolProvider} from '../src/store/tool-context.js'
import {createReasoningChunks, createToolCallChunks, storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'

function confirmToolCtx(): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    catalog: {loaded: () => true, meta: () => undefined},
    addResult: () => {},
  }
}

function ConfirmCard(props: ToolCardProps): JSX.Element {
  return <p>Confirm this action for {props.part.name}</p>
}

const entries: ToolCardEntry[] = [{names: ['confirm_ui'], render: ConfirmCard, display: 'standalone'}]

function RunSettledIndicator(): JSX.Element {
  const thread = useThread()
  return <span>{thread.isRunning ? 'run live' : 'run settled'}</span>
}

function StandaloneThread(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({
      chunks: [
        ...createReasoningChunks('deciding what to confirm'),
        ...createToolCallChunks('confirm_ui', {question: 'proceed?'}),
      ],
      chunkDelay: 30,
    }),
  })
  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={confirmToolCtx()}>
        <button type="button" onClick={() => void chat.sendMessage('ask me')}>
          ask
        </button>
        <RunSettledIndicator />
        <Thread>
          <Thread.Viewport>
            <Thread.Messages tools={entries} />
          </Thread.Viewport>
        </Thread>
      </ToolProvider>
    </ChatProvider>
  )
}

it('renders a standalone tool card outside the chain even once the chain collapses on settle', async () => {
  mountView(() => <StandaloneThread />)

  await page.getByRole('button', {name: 'ask'}).click()

  await expect.element(page.getByText('run live'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('run settled'), {timeout: 3000}).toBeVisible()

  await expect
    .element(page.getByRole('button', {name: 'Chain of Thought'}), {timeout: 3000})
    .toHaveAttribute('aria-expanded', 'false')

  await expect.element(page.getByText('Confirm this action for confirm_ui'), {timeout: 3000}).toBeVisible()
})
