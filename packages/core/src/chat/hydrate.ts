import type {ChatHydration} from '@conciv/contract'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {ChatDeps} from './runtime.js'

export async function hydrateSession(deps: ChatDeps, sessionId: SessionId): Promise<ChatHydration> {
  const [messages, active] = await Promise.all([deps.snapshot(sessionId), deps.runs.findActiveRun(sessionId)])
  return {messages, activeRun: active ? {runId: active.runId} : null, interrupts: null}
}
