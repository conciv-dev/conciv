import type {ChatEvent} from '@conciv/ai'
import type {SessionId} from '@conciv/protocol/chat-types'
import {makeTurn, type UserContent} from '@conciv/chat/run'
import type {ChatDeps} from '@conciv/chat/runtime'
import type {StreamDurability} from '@conciv/ai/server'

export type DetachedTurn = {
  runId: string
  chunks: () => readonly ChatEvent[]
  drained: Promise<readonly ChatEvent[]>
  stop: () => void
}

async function drain(
  stream: AsyncIterable<ChatEvent>,
  log: StreamDurability,
  into: ChatEvent[],
): Promise<readonly ChatEvent[]> {
  try {
    for await (const chunk of stream) {
      into.push(chunk)
      await log.append([chunk])
    }
  } finally {
    await log.close()
  }
  return into
}

export async function startTurn(
  deps: ChatDeps,
  sessionId: SessionId,
  runId: string,
  content: UserContent,
): Promise<DetachedTurn> {
  const abort = new AbortController()
  const stream = await makeTurn(deps)(sessionId, runId, content, {signal: abort.signal})
  const collected: ChatEvent[] = []
  const drained = drain(stream, deps.durability(runId), collected)
  return {
    runId,
    chunks: () => collected,
    drained: drained.catch(() => collected),
    stop: () => abort.abort(),
  }
}

export async function runTurnToCompletion(
  deps: ChatDeps,
  sessionId: SessionId,
  runId: string,
  content: UserContent,
): Promise<readonly ChatEvent[]> {
  return (await startTurn(deps, sessionId, runId, content)).drained
}
