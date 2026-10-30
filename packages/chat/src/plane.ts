import {defineLocalSandbox} from '@conciv/ai/server'
import type {ChatEvent, ChatMessage} from '@conciv/ai'
import type {ChatHydration} from '@conciv/contract'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {PendingApproval} from './ask.js'
import {chatDeliveryRoutes} from './delivery.js'
import {approvalRequestedChunk, asksFor, makeAskGate, type PermissionGate} from './gate.js'
import {hydrateSession} from './hydrate.js'
import {makeCompactor, resolveSystemText, type SystemPromptSources} from './run.js'
import type {ChatDeps} from './runtime.js'
import {sessionEvents} from './session-events.js'
import type {UpgradeWebSocket} from './socket-upgrade.js'
import {stopSession} from './stop.js'
import {syncedSnapshot} from './transcript-import.js'

export type ChatPlaneDeps = Omit<ChatDeps, 'sandbox' | 'snapshot' | 'systemText'> & {
  systemPrompt: SystemPromptSources
}

export type ChatPlane = {
  deps: ChatDeps
  routes: (upgrade: UpgradeWebSocket) => ReturnType<typeof chatDeliveryRoutes>
  compact: (sessionId: SessionId) => Promise<void>
  history: (sessionId: SessionId) => Promise<ChatMessage[]>
  hydrate: (sessionId: SessionId) => Promise<ChatHydration>
  stop: (sessionId: SessionId) => Promise<{ok: true}>
  events: (sessionId: SessionId, signal: AbortSignal) => AsyncGenerator<ChatEvent>
  askGate: (sessionId: SessionId, timeoutMs?: number) => PermissionGate
  approvalReplay: (sessionId: SessionId) => ChatEvent[]
}

function replayedApproval(sessionId: SessionId, approval: PendingApproval): ChatEvent {
  return approvalRequestedChunk({
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    input: approval.input,
    approvalId: approval.approvalId,
    threadId: sessionId,
    ...(approval.runId === null ? {} : {runId: approval.runId}),
  })
}

export function createChatPlane(input: ChatPlaneDeps): ChatPlane {
  const {systemPrompt, ...rest} = input
  const deps: ChatDeps = {
    ...rest,
    systemText: resolveSystemText(systemPrompt, input.harness.capabilities.systemPrompt),
    sandbox: defineLocalSandbox({id: 'conciv', dir: input.cwd}),
    snapshot: (sessionId) => syncedSnapshot(deps, sessionId),
  }
  const compactor = makeCompactor(deps)
  return {
    deps,
    routes: (upgrade) => chatDeliveryRoutes(deps, upgrade),
    compact: (sessionId) => compactor.run(sessionId),
    history: (sessionId) => syncedSnapshot(deps, sessionId),
    hydrate: (sessionId) => hydrateSession(deps, sessionId),
    stop: (sessionId) => stopSession(deps, sessionId),
    events: (sessionId, signal) => sessionEvents(deps, sessionId, signal),
    askGate: (sessionId, timeoutMs) =>
      makeAskGate({
        asks: asksFor(deps.asks, sessionId),
        emit: (chunk) => deps.stream.publish(sessionId, chunk),
        ...(timeoutMs === undefined ? {} : {timeoutMs}),
      }),
    approvalReplay: (sessionId) =>
      deps.asks.pendingApprovals(sessionId).map((approval) => replayedApproval(sessionId, approval)),
  }
}
