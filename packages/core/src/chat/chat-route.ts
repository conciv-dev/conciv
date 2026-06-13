import type {H3} from 'h3'
import type {HarnessAdapter} from '@devgent/protocol/harness-types'
import {makeUiBus, type UiBus} from './ui-bus.js'
import {readSession} from './session-store.js'
import {makePermissionGate, registerPermissionRoutes} from './permission-gate.js'
import {registerSessionRoutes, type SessionState} from './session-route.js'
import {registerTurnRoutes, type SpawnHarness} from './turn.js'

export type {SpawnHarness} from './turn.js'

export type ChatRouteOpts = {
  cwd: string
  lockDir: string
  previewId: string // ties the persisted chat session to this preview (same preview → same chat)
  initialSessionId: string // the agent's session id, '' if none
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  // The system prompt the engine prepared: a file path when capabilities.systemPrompt==='file',
  // otherwise the raw text (the adapter decides how to apply it).
  systemPromptFile?: string
  systemPromptText?: string
  uiBus?: UiBus // shared so sibling routes (e.g. test) can inject onto the live turn
}

// Wire the chat HTTP surface onto an h3 app. This function ONLY composes — the behaviour lives
// in permission-gate / session-route / turn. The route set is harness-agnostic: the permission
// gate is active only for permissionGate==='hook' harnesses, history only for transcript ones.
export function registerChatRoutes(app: H3, opts: ChatRouteOpts): void {
  const uiBus = opts.uiBus ?? makeUiBus()
  const gate = makePermissionGate(uiBus)
  // Resolve which session this preview continues: the agent's session wins (a hand-off from
  // `iterate`); otherwise resume the preview's own persisted chat session.
  const state: SessionState = {sessionId: opts.initialSessionId || readSession(opts.lockDir, opts.previewId) || ''}

  registerPermissionRoutes(app, gate, opts.harness.capabilities.permissionGate === 'hook')
  registerSessionRoutes(app, {
    cwd: opts.cwd,
    lockDir: opts.lockDir,
    initialSessionId: opts.initialSessionId,
    harness: opts.harness,
    state,
  })
  registerTurnRoutes(app, {
    cwd: opts.cwd,
    lockDir: opts.lockDir,
    previewId: opts.previewId,
    harness: opts.harness,
    spawnHarness: opts.spawnHarness,
    systemPromptFile: opts.systemPromptFile,
    systemPromptText: opts.systemPromptText,
    uiBus,
    state,
  })
}
