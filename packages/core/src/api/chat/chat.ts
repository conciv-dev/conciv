import type {H3} from 'h3'
import type {HarnessAdapter} from '@aidx/protocol/harness-types'
import type {UiBus} from '../../runtime/ui-bus.js'
import {readSession} from '../../store/session-store.js'
import {makePermissionGate, registerPermissionRoutes} from './permission.js'
import {registerSessionRoutes, type SessionState} from './session.js'
import {registerTurnRoutes, type SpawnHarness} from './turn.js'

export type {SpawnHarness} from './turn.js'

export type ChatRouteOpts = {
  cwd: string
  stateRoot: string
  previewId: string // ties the persisted chat session to this preview (same preview → same chat)
  initialSessionId: string // the agent's session id, '' if none
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  systemPromptFile?: string // when systemPrompt==='file'
  systemPromptText?: string // otherwise
  uiBus: UiBus // owned by makeApp; the lock guarantees one active turn → one active channel
}

// Wire the chat HTTP surface — composition only; behaviour lives in permission/session/turn.
export function registerChatRoutes(app: H3, opts: ChatRouteOpts): void {
  const uiBus = opts.uiBus
  const gate = makePermissionGate(uiBus)
  // The agent's session wins (hand-off from iterate); else resume the preview's persisted one.
  const state: SessionState = {sessionId: opts.initialSessionId || readSession(opts.stateRoot, opts.previewId) || ''}

  registerPermissionRoutes(app, gate, opts.harness.capabilities.permissionGate === 'hook')
  registerSessionRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.stateRoot,
    previewId: opts.previewId,
    initialSessionId: opts.initialSessionId,
    harness: opts.harness,
    state,
  })
  registerTurnRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.stateRoot,
    previewId: opts.previewId,
    harness: opts.harness,
    spawnHarness: opts.spawnHarness,
    systemPromptFile: opts.systemPromptFile,
    systemPromptText: opts.systemPromptText,
    uiBus,
    state,
  })
}
