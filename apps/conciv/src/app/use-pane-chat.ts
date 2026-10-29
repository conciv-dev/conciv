import {createMemo, type Accessor} from 'solid-js'
import {useChatSession, type ChatSession} from '@conciv/client'
import {useChatDeps, useConnectionGeneration, useSettings} from './context.js'

export function usePaneChat(sessionId: Accessor<string>): Accessor<ChatSession> {
  const {rpc, apiBase} = useChatDeps()
  const settings = useSettings()
  const generation = useConnectionGeneration()
  const chatKey = createMemo(() => ({sessionId: sessionId(), generation: generation()}))
  const chat = createMemo(() =>
    useChatSession({
      rpc,
      apiBase: apiBase(),
      sessionId: chatKey().sessionId,
      connection: {transport: settings.transport},
    }),
  )
  return chat
}
