import {EventType} from '@tanstack/ai'
import {makeRpcClient, type PersistedAttachment, type RpcClient} from '@conciv/contract'

export type SeededDraft = {text?: string; attachments?: PersistedAttachment[]}

export type TranscriptStream = {awaitTurnEnd: () => Promise<void>; close: () => void}

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

export async function openTranscriptStream(rpc: RpcClient, sessionId: string): Promise<TranscriptStream> {
  const controller = new AbortController()
  const subscription = await rpc.chat.subscribe({sessionId}, {signal: controller.signal})
  const chunks = subscription[Symbol.asyncIterator]()
  return {
    awaitTurnEnd: async () => {
      for (;;) {
        const next = await chunks.next()
        if (next.done === true) return
        if (isFinal(next.value)) return
      }
    },
    close: () => controller.abort(),
  }
}

export async function sendTurn(rpc: RpcClient, sessionId: string, text: string): Promise<void> {
  await rpc.chat.send({sessionId, runId: crypto.randomUUID(), text})
}

export async function runTurn(rpc: RpcClient, sessionId: string, text: string): Promise<void> {
  const stream = await openTranscriptStream(rpc, sessionId)
  try {
    await sendTurn(rpc, sessionId, text)
    await stream.awaitTurnEnd()
  } finally {
    stream.close()
  }
}
