import {webSocket} from '@tanstack/ai-client'
import type {UIMessage} from '@tanstack/ai'
import {CHAT_WS_PATH} from '@conciv/protocol/chat-types'
import {makeRunStream, type RunStream} from './run-stream.js'

export type TurnMessage = {role: 'user'; parts: UIMessage['parts']}

export type ChatSockets = {
  turn: (input: {
    wsBase: string
    sessionId: string
    runId: string
    messageId?: string
    message: TurnMessage
  }) => RunStream
  join: (input: {wsBase: string; runId: string}) => RunStream
  closeAll: () => void
}

function connectionFor(wsBase: string): ReturnType<typeof webSocket> {
  return webSocket(`${wsBase}${CHAT_WS_PATH}`)
}

export function makeChatSockets(): ChatSockets {
  const open: AbortController[] = []
  const track = (abort: AbortController): void => {
    open.push(abort)
  }
  return {
    turn: ({wsBase, sessionId, runId, messageId, message}) => {
      const connection = connectionFor(wsBase)
      const abort = new AbortController()
      track(abort)
      const chunks = connection.subscribe(abort.signal)
      void connection
        .send([{id: messageId ?? `${runId}-user`, ...message}], {}, abort.signal, {threadId: sessionId, runId})
        .catch(() => {})
      return makeRunStream(chunks)
    },
    join: ({wsBase, runId}) => {
      const abort = new AbortController()
      track(abort)
      return makeRunStream(connectionFor(wsBase).joinRun(runId, abort.signal))
    },
    closeAll: () => {
      for (const abort of open.splice(0)) abort.abort()
    },
  }
}
