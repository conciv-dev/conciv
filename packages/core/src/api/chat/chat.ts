import {randomUUID} from 'node:crypto'
import type {H3} from 'h3'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import type {UiBus} from '../../runtime/ui-bus.js'
import type {SessionStore} from '../../store/session-store.js'
import {registerLaunchRoutes} from './launch.js'
import {makePermissionGate, registerPermissionRoutes} from './permission.js'
import {readLocks} from '../../store/lock.js'
import {registerSessionRoutes, sweepEmptyChatRecords, type ResolveDeps} from './session.js'
import {registerTurnRoutes, type SpawnHarness} from './turn.js'

export type {SpawnHarness} from './turn.js'

export type ChatRouteOpts = {
  cwd: string
  stateRoot: string
  initialSessionId: string
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  systemPromptFile?: string
  systemPromptText?: string
  claudeHome?: string
  uiBus: UiBus
  riskyTools?: ReadonlySet<string>
  store: SessionStore
  onTurnStart?: (sessionId: string) => void
}

export async function ensureAgentRecord(deps: ResolveDeps, harnessId: string): Promise<SessionRecord> {
  const existing = await deps.store.findByHarnessId(harnessId)
  if (existing) return existing
  const mint = deps.mintId ?? (() => `conciv_${randomUUID()}`)
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

export function registerChatRoutes(app: H3, opts: ChatRouteOpts): void {
  const uiBus = opts.uiBus
  const gate = makePermissionGate(uiBus, {risky: opts.riskyTools})
  const store = opts.store

  if (opts.initialSessionId) {
    void ensureAgentRecord({store, harnessKind: opts.harness.id, cwd: opts.cwd}, opts.initialSessionId).catch(() => {})
  }

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
    onTurnStart: opts.onTurnStart,
  })
}
