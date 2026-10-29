import 'virtual:uno.css'
import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {ToolCardEntry, ToolCardProps, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ChatProvider} from '../src/store/chat-context.js'
import {ToolProvider} from '../src/store/tool-context.js'
import {createReasoningChunks, createToolCallChunks, storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'
import {RunSettledIndicator, startRun, waitForRunSettled} from './run-harness.js'

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

const entries: ToolCardEntry[] = [
  {names: ['confirm_ui'], render: ConfirmCard, hasEmbeddedBody: () => true, display: 'standalone'},
]

function StandaloneThread(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({
      chunks: [
        ...createReasoningChunks('deciding what to confirm'),
        ...createToolCallChunks('Bash', {command: 'ls'}, {result: 'ok'}),
        ...createToolCallChunks('confirm_ui', {question: 'proceed?'}, {result: 'confirmed'}),
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

it('renders a standalone tool card outside the trace, whose trace stays open once the session settles', async () => {
  mountView(() => <StandaloneThread />)

  await startRun()
  await waitForRunSettled()

  const trigger = page.getByRole('button', {name: /trace/i})
  await expect.element(trigger, {timeout: 3000}).toHaveAttribute('data-state', 'open')

  await expect.element(page.getByText('Confirm this action for confirm_ui'), {timeout: 3000}).toBeVisible()

  expect(trigger.all()).toHaveLength(1)
})
