import {randomUUID} from 'node:crypto'
import type {H3} from 'h3'
import type {HarnessAdapter} from '@mandarax/protocol/harness-types'
import type {SessionRecord} from '@mandarax/protocol/chat-types'
import type {UiBus} from '../../runtime/ui-bus.js'
import {createFsSessionStore} from '../../store/session-store.js'
import {registerLaunchRoutes} from './launch.js'
import {makePermissionGate, registerPermissionRoutes} from './permission.js'
import {readLocks} from '../../store/lock.js'
import {registerSessionRoutes, sweepEmptyChatRecords, type ResolveDeps} from './session.js'
import {registerTurnRoutes, type SpawnHarness} from './turn.js'

export type {SpawnHarness} from './turn.js'

export type ChatRouteOpts = {
  cwd: string
  stateRoot: string
  previewId: string // ties the persisted chat sessions to this preview (same preview → same chats)
  initialSessionId: string // the agent's handed-off harness id, '' if none
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  systemPromptFile?: string // when systemPrompt==='file'
  systemPromptText?: string // otherwise
  claudeHome?: string // override the harness transcript home (tests); default homedir()
  uiBus: UiBus
}

// Ensure a record exists for an agent hand-off: mandarax was launched with MANDARAX_SESSION_ID = a harness
// id it didn't mint, so we wrap that id in an 'agent'-origin record (find-or-create, idempotent by
// the harness id). The agent-origin twin of resolveSession's external-adopt branch.
export async function ensureAgentRecord(deps: ResolveDeps, harnessId: string): Promise<SessionRecord> {
  const existing = await deps.store.findByHarnessId(harnessId)
  if (existing) return existing
  const mint = deps.mintId ?? (() => `mandarax_${randomUUID()}`)
  return deps.store.create({
    id: mint(),
    harnessSessionId: harnessId,
    harnessKind: deps.harnessKind,
    origin: 'agent',
    title: null,
    model: null,
    usage: null,
    cwd: deps.cwd,
  })
}

// Wire the chat HTTP surface — composition only; behaviour lives in permission/session/turn/launch.
export function registerChatRoutes(app: H3, opts: ChatRouteOpts): void {
  const uiBus = opts.uiBus
  const gate = makePermissionGate(uiBus)
  const store = createFsSessionStore({stateRoot: opts.stateRoot, previewId: opts.previewId})

  // Agent hand-off: ensure the handed-off harness id has a wrapping record before its first turn.
  // Best-effort at boot; the first resolve/turn re-creates it if this write loses a teardown race.
  if (opts.initialSessionId) {
    void ensureAgentRecord({store, harnessKind: opts.harness.id, cwd: opts.cwd}, opts.initialSessionId).catch(() => {})
  }

  // Best-effort boot cleanup of legacy ghost records (empty chat sessions from the old eager resolve).
  void sweepEmptyChatRecords(store, new Set(readLocks(opts.stateRoot).map((l) => l.key))).catch(() => {})

  registerPermissionRoutes(app, gate, opts.harness.capabilities.permissionGate === 'hook')
  registerSessionRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.stateRoot,
    store,
    harness: opts.harness,
    claudeHome: opts.claudeHome,
  })
  registerLaunchRoutes(app, {cwd: opts.cwd, harness: opts.harness, store})
  registerTurnRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.stateRoot,
    harness: opts.harness,
    spawnHarness: opts.spawnHarness,
    harnessEnv: opts.harnessEnv,
    gate,
    systemPromptFile: opts.systemPromptFile,
    systemPromptText: opts.systemPromptText,
    uiBus,
    store,
  })
}
