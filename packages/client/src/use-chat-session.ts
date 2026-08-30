import {useChat, type QueuedMessage} from '@tanstack/ai-solid'
import {createMemo, createSignal, type Accessor} from 'solid-js'
import type {RpcClient} from '@conciv/contract'
import {isRunPhaseTerminal, type RunClockSource} from '@conciv/protocol/run-types'
import {chatConnection, type ChatConnectionOptions} from './chat-connection.js'

export type UseChatSessionOptions = {
  rpc: RpcClient
  apiBase: string
  sessionId: string
  connection?: ChatConnectionOptions
  onError?: (error: Error) => void
}

export type ChatSession = ReturnType<typeof useChat> & {
  refresh: () => Promise<void>
  interruptAndFlush: () => void
  stopping: Accessor<boolean>
  runSource: Accessor<RunClockSource | null>
  runError: Accessor<string | null>
  sessionRunning: Accessor<boolean>
  hydrated: Accessor<boolean>
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function isTextContent(content: QueuedMessage['content']): content is string {
  return typeof content === 'string'
}

function joinedQueueText(queued: QueuedMessage[]): string | null {
  if (!queued.every((item) => isTextContent(item.content))) return null
  return queued.map((item) => item.content).join('\n')
}

export function useChatSession(options: UseChatSessionOptions): ChatSession {
  const [runSource, setRunSource] = createSignal<RunClockSource | null>(null)
  const [hydrated, setHydrated] = createSignal(false)
  const connection = chatConnection(options.rpc, options.apiBase, options.sessionId, {
    ...options.connection,
    onLifecycle: (lifecycle) => {
      options.connection?.onLifecycle?.(lifecycle)
      setRunSource({lifecycle, receivedAt: Date.now()})
    },
    onHydrated: () => {
      options.connection?.onHydrated?.()
      setHydrated(true)
    },
  })
  const chat = useChat({
    threadId: options.sessionId,
    connection,
    persistence: true,
    live: true,
    queue: 'queue',
    onError: options.onError,
  })
  const stopping = createMemo(() => runSource()?.lifecycle.phase === 'stopping')
  const runError = createMemo(() => {
    const source = runSource()
    return source && source.lifecycle.phase === 'failed' ? source.lifecycle.error : null
  })
  const sessionRunning = createMemo(() => {
    const source = runSource()
    return source !== null && !isRunPhaseTerminal(source.lifecycle.phase)
  })
  const stop = () => {
    chat.stop()
    void options.rpc.chat.stop({sessionId: options.sessionId}).catch((error) => options.onError?.(asError(error)))
  }
  const sendQueuedSequentially = async (queued: QueuedMessage[]): Promise<void> => {
    for (const item of queued) await chat.sendMessage(item.content)
  }
  const interruptAndFlush = () => {
    const queued = chat.queue()
    if (queued.length === 0) {
      stop()
      return
    }
    stop()
    const joined = joinedQueueText(queued)
    if (joined !== null) {
      void chat.sendMessage(joined)
      return
    }
    void sendQueuedSequentially(queued)
  }
  const refresh = async (): Promise<void> => {
    const hydration = await connection.refresh()
    chat.setMessages(hydration.messages)
  }
  return {
    ...chat,
    stop,
    refresh,
    interruptAndFlush,
    stopping,
    runSource,
    runError,
    sessionRunning,
    hydrated,
  }
}
