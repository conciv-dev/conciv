import {rpcStream} from '@conciv/ai/client'
import {type ChatMessage} from '@conciv/protocol/chat-message-types'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {makeRunStream, type RunStream} from './run-stream.js'
import type {RpcClient} from './session.js'

export type TurnMessage = {role: 'user'; parts: ChatMessage['parts']}

export type ChatTurns = {
  turn: (input: {sessionId: string; runId: string; messageId?: string; message: TurnMessage}) => RunStream
  join: (runId: string) => RunStream
  closeAll: () => void
}

async function* streamed(opened: Promise<AsyncIterable<ChatEvent>>): AsyncGenerator<ChatEvent> {
  yield* await opened
}

export function makeChatTurns(rpc: RpcClient): ChatTurns {
  const open: AbortController[] = []
  const opened = (): AbortController => {
    const abort = new AbortController()
    open.push(abort)
    return abort
  }
  const turns = rpcStream((_messages, _data, signal, input) =>
    streamed(rpc.chat.send({sessionId: input.threadId, runId: input.runId, messages: input.messages}, {signal})),
  )
  return {
    turn: ({sessionId, runId, messageId, message}) =>
      makeRunStream(
        turns.connect([{id: messageId ?? `${runId}-user`, ...message}], {}, opened().signal, {
          threadId: sessionId,
          runId,
        }),
      ),
    join: (runId) => makeRunStream(streamed(rpc.chat.join({runId}, {signal: opened().signal}))),
    closeAll: () => {
      for (const abort of open.splice(0)) abort.abort()
    },
  }
}
