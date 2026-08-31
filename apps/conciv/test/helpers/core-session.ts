import {EventType, type StreamChunk} from '@tanstack/ai'
import {fetchServerSentEvents} from '@tanstack/ai-client'
import {CHAT_SSE_PATH} from '@conciv/protocol/chat-types'
import {makeRpcClient, type PersistedAttachment, type RpcClient} from '@conciv/contract'

export type SeededDraft = {text?: string; attachments?: PersistedAttachment[]}

export type TurnHandle = {awaitTurnEnd: () => Promise<void>; close: () => void}

export function coreRpc(base: string): RpcClient {
  return makeRpcClient(base)
}

export async function createSession(rpc: RpcClient): Promise<string> {
  const {sessionId} = await rpc.sessions.create()
  return sessionId
}

export async function seedDraft(rpc: RpcClient, sessionId: string, draft: SeededDraft): Promise<void> {
  const text = draft.text ?? ''
  await rpc.drafts.set({
    sessionId,
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
    attachments: draft.attachments ?? [],
  })
}

function isFinal(chunk: unknown): boolean {
  if (typeof chunk !== 'object' || chunk === null || !('type' in chunk)) return false
  return chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR
}

function isStart(chunk: unknown): boolean {
  if (typeof chunk !== 'object' || chunk === null || !('type' in chunk)) return false
  return chunk.type === EventType.RUN_STARTED
}

function turnStream(base: string, sessionId: string, text: string, signal: AbortSignal): AsyncIterable<StreamChunk> {
  return fetchServerSentEvents(`${base}${CHAT_SSE_PATH}`).connect(
    [{id: crypto.randomUUID(), role: 'user', parts: [{type: 'text', content: text}]}],
    {},
    signal,
    {threadId: sessionId, runId: crypto.randomUUID()},
  )
}

export async function runTurn(base: string, sessionId: string, text: string): Promise<void> {
  const abort = new AbortController()
  try {
    for await (const chunk of turnStream(base, sessionId, text, abort.signal)) {
      if (isFinal(chunk)) return
    }
  } finally {
    abort.abort()
  }
}

export function sendTurn(base: string, sessionId: string, text: string): Promise<TurnHandle> {
  const abort = new AbortController()
  const finished = {resolve: (): void => {}}
  const done = new Promise<void>((resolve) => {
    finished.resolve = resolve
  })
  const started = new Promise<void>((resolve) => {
    const drain = async (): Promise<void> => {
      for await (const chunk of turnStream(base, sessionId, text, abort.signal)) {
        if (isStart(chunk)) resolve()
        if (isFinal(chunk)) break
      }
    }
    void drain()
      .catch(() => {})
      .finally(() => {
        resolve()
        finished.resolve()
      })
  })
  return started.then(() => ({
    awaitTurnEnd: () => done,
    close: () => abort.abort(),
  }))
}
