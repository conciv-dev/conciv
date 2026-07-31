import {createSignal, onCleanup, type Accessor} from 'solid-js'
import {getExtensionApi, makeExtRpcClient} from '@conciv/extension'
import type {SessionSnapshot, SessionUpdate, TranscriptFailureReason} from '@conciv/session-observer/types'
import type {UIMessage} from '@conciv/protocol/chat-types'
import type {TerminalRouter} from '../server.js'
import {TERMINAL_NAME} from '../shared/protocol.js'
import type {TerminalStore} from './terminal-store.js'

declare module '@conciv/extension' {
  interface Register {
    terminal: {context: {store: TerminalStore}}
  }
}

export const useTerminalContext = getExtensionApi(TERMINAL_NAME).useContext

export type ObservedTranscript =
  | {status: 'connecting'}
  | {status: 'open'; messages: UIMessage[]}
  | {status: 'failed'; reason: TranscriptFailureReason}

export type TerminalObservation = {
  snapshot: Accessor<SessionSnapshot | null>
  transcript: Accessor<ObservedTranscript>
}

type Shared = {observation: TerminalObservation; release: () => void}

const connections = new Map<string, {shared: Shared; users: number}>()

async function pump(
  client: ReturnType<typeof makeExtRpcClient<TerminalRouter>>,
  sessionId: string,
  signal: AbortSignal,
  apply: (update: SessionUpdate) => void,
): Promise<void> {
  const stream = await client.observe({sessionId}, {signal, context: {retry: Number.POSITIVE_INFINITY}})
  for await (const update of stream) apply(update)
}

function openConnection(apiBase: string, sessionId: string): Shared {
  const [snapshot, setSnapshot] = createSignal<SessionSnapshot | null>(null)
  const [transcript, setTranscript] = createSignal<ObservedTranscript>({status: 'connecting'})
  const controller = new AbortController()
  const client = makeExtRpcClient<TerminalRouter>(apiBase, 'terminal', {
    onRetry: () => {
      setTranscript((current) => (current.status === 'open' ? current : {status: 'connecting'}))
    },
  })
  const apply = (update: SessionUpdate): void => {
    if (update.kind === 'presence') {
      setSnapshot(update.snapshot)
      if (update.snapshot.health.ok) return
      setTranscript({status: 'failed', reason: update.snapshot.health.reason})
      return
    }
    if (update.kind === 'transcript-error') {
      setTranscript({status: 'failed', reason: update.reason})
      return
    }
    setTranscript({status: 'open', messages: update.messages})
  }
  void pump(client, sessionId, controller.signal, apply).catch(() => {
    if (!controller.signal.aborted) setTranscript({status: 'failed', reason: 'unreadable'})
  })
  return {observation: {snapshot, transcript}, release: () => controller.abort()}
}

export function observeTerminal(apiBase: string, sessionId: string | null): TerminalObservation {
  if (sessionId === null) {
    const [snapshot] = createSignal<SessionSnapshot | null>(null)
    const [transcript] = createSignal<ObservedTranscript>({status: 'failed', reason: 'missing'})
    return {snapshot, transcript}
  }
  const key = `${apiBase}::${sessionId}`
  const entry = connections.get(key) ?? {shared: openConnection(apiBase, sessionId), users: 0}
  entry.users += 1
  connections.set(key, entry)
  onCleanup(() => {
    entry.users -= 1
    if (entry.users > 0) return
    if (connections.get(key) !== entry) return
    connections.delete(key)
    entry.shared.release()
  })
  return entry.shared.observation
}
