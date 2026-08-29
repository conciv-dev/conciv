import type {ChatHydration} from '@conciv/contract'
import type {SessionId} from '@conciv/protocol/chat-types'
import {latestRunLifecycle} from './run-lifecycle.js'
import type {ChatDeps} from './runtime.js'

export async function hydrateSession(deps: ChatDeps, sessionId: SessionId): Promise<ChatHydration> {
  const [messages, active, lastRun] = await Promise.all([
    deps.snapshot(sessionId),
    deps.runs.findActiveRun(sessionId),
    latestRunLifecycle(deps, sessionId),
  ])
  return {messages, activeRun: active ? {runId: active.runId} : null, lastRun, interrupts: null}
}
