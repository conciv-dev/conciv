import {existsSync} from 'node:fs'
import type {H3} from 'h3'
import type {HarnessAdapter} from '@aidx/protocol/harness-types'
import {DEFAULT_SESSION_ID} from '@aidx/protocol/chat-types'
import type {UiBus} from '../../runtime/ui-bus.js'
import {readSessions} from '../../store/session-store.js'
import {registerLaunchRoutes} from './launch.js'
import {makePermissionGate, registerPermissionRoutes} from './permission.js'
import {registerSessionRoutes, type SessionState, type SessionLookup} from './session.js'
import {registerTurnRoutes, type SpawnHarness} from './turn.js'

export type {SpawnHarness} from './turn.js'

export type ChatRouteOpts = {
  cwd: string
  stateRoot: string
  previewId: string // ties the persisted chat sessions to this preview (same preview → same chats)
  initialSessionId: string // the agent's session id, '' if none (adopted by the default session)
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  systemPromptFile?: string // when systemPrompt==='file'
  systemPromptText?: string // otherwise
  claudeHome?: string // override the harness transcript home (tests); default homedir()
  uiBus: UiBus
}

// Wire the chat HTTP surface — composition only; behaviour lives in permission/session/turn/launch.
export function registerChatRoutes(app: H3, opts: ChatRouteOpts): void {
  const uiBus = opts.uiBus
  const gate = makePermissionGate(uiBus)

  // One SessionState per OUR session id (the header id), created lazily. The default session adopts
  // the agent hand-off (initialSessionId); every session seeds its token from the persisted map; an
  // unmapped id naming an existing transcript adopts that transcript (discovered/external session).
  const sessions = new Map<string, SessionState>()
  const sessionFor: SessionLookup = (sessionId) => {
    let s = sessions.get(sessionId)
    if (!s) {
      const stored = readSessions(opts.stateRoot, opts.previewId)[sessionId] ?? ''
      let seed = sessionId === DEFAULT_SESSION_ID ? opts.initialSessionId || stored : stored
      if (!seed && opts.harness.history && existsSync(opts.harness.history.transcriptPath(opts.cwd, sessionId))) {
        seed = sessionId
      }
      s = {harnessSessionId: seed}
      sessions.set(sessionId, s)
    }
    return s
  }

  registerPermissionRoutes(app, gate, opts.harness.capabilities.permissionGate === 'hook')
  registerSessionRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.stateRoot,
    previewId: opts.previewId,
    initialSessionId: opts.initialSessionId,
    harness: opts.harness,
    claudeHome: opts.claudeHome,
    sessionFor,
  })
  registerLaunchRoutes(app, {cwd: opts.cwd, harness: opts.harness, sessionFor})
  registerTurnRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.stateRoot,
    previewId: opts.previewId,
    harness: opts.harness,
    spawnHarness: opts.spawnHarness,
    systemPromptFile: opts.systemPromptFile,
    systemPromptText: opts.systemPromptText,
    uiBus,
    sessionFor,
  })
}
