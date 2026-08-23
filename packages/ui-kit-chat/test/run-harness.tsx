import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {StreamChunk} from '@tanstack/ai'
import {ChatProvider, useThread} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'

const RUN_TIMEOUT_MS = 3000

export function streamingThread(chunks: StreamChunk[], chunkDelay: number): () => JSX.Element {
  return function StreamingThread(): JSX.Element {
    const chat = useChat({connection: storyConnection({chunks, chunkDelay, runsUntilStopped: true})})
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
