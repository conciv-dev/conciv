import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {INERT_TOOL_CTX} from '../src/store/tool-context.js'
import type {ModelOption} from '../src/primitives/model-selector/model-selector.js'
import {render} from '@solidjs/testing-library'
import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect} from 'vitest'
import {createChat} from '@conciv/ai/client'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {ChatProvider, useThread} from '../src/store/chat-context.js'
import {storyConnection} from '@conciv/ai/testkit'
import {Thread} from '../src/styled/thread.js'

export function catalogOf(entries: Record<string, ToolViewMeta>): ToolCatalogView {
  return {loaded: () => true, meta: (name) => entries[name]}
}

export function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
  return {...INERT_TOOL_CTX, catalog}
}

export function cardPart(
  name: string,
  input: Record<string, unknown>,
  state: ToolCallPart['state'] = 'complete',
): ToolCallPart {
  return {type: 'tool-call', id: 'e1', name, arguments: JSON.stringify(input), input, state}
}

export function cardResult(content: string, state: ToolResultPart['state']): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'e1', content, state}
}

export const HARNESS_MODELS: readonly ModelOption[] = [
  {id: 'claude-opus-4-8', name: 'Claude Opus 4.8', description: 'Most capable'},
  {id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Balanced speed and depth'},
  {id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: 'Fastest'},
]

export function mountView(view: () => JSX.Element): HTMLElement {
  return render(view).container
}

const RUN_TIMEOUT_MS = 3000

export function streamingThread(chunks: ChatEvent[], chunkDelay: number): () => JSX.Element {
  return function StreamingThread(): JSX.Element {
    const chat = createChat({
      threadId: 'run-harness',
      connection: storyConnection({chunks, chunkDelay, runsUntilStopped: true}),
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
}

export function RunSettledIndicator(): JSX.Element {
  const thread = useThread()
  return (
    <>
      <span>{thread.isRunning ? 'run live' : 'run settled'}</span>
      <span>{thread.isEmpty ? 'run pending' : 'run started'}</span>
    </>
  )
}

export async function startRun(): Promise<void> {
  await page.getByRole('button', {name: 'ask'}).click()
  await expect.element(page.getByText('run started'), {timeout: RUN_TIMEOUT_MS}).toBeVisible()
}

export async function waitForRunSettled(): Promise<void> {
  await expect.element(page.getByText('run settled'), {timeout: RUN_TIMEOUT_MS}).toBeVisible()
}

export async function haltRun(): Promise<void> {
  await page.getByRole('button', {name: 'halt'}).click()
  await waitForRunSettled()
}
