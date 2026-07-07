import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import type {AnyTool} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import type {UiBus} from '../../runtime/ui-bus.js'
import type {SessionStore} from '../../store/session-store.js'
import {makeLaunchRoutes} from './launch.js'
import {makePermissionGate, makePermissionRoutes} from './permission.js'
import {readLocks} from '../../store/lock.js'
import {makeSessionRoutes, sweepEmptyChatRecords, type ResolveDeps} from './session.js'
import {makeTurnRoutes} from './turn.js'
import {makeAttachRoute} from './attach.js'
import {makeTurnHub} from '../../runtime/turn-hub.js'

export type ChatRouteOpts = {
  cwd: string
  stateRoot: string
  initialSessionId: string
  harness: HarnessAdapter
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  systemPromptFile?: string
  systemPromptText?: string
  claudeHome?: string
  uiBus: UiBus
  riskyTools?: ReadonlySet<string>
  store: SessionStore
  tools: (sessionId: string) => AnyTool[]
  onTurnStart?: (sessionId: string) => void
  onTurnEnd?: (sessionId: string) => Promise<void>
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

export function makeChatRoutes(opts: ChatRouteOpts) {
  const uiBus = opts.uiBus
  const gate = makePermissionGate(uiBus, {risky: opts.riskyTools})
  const store = opts.store
  const hub = makeTurnHub()

  if (opts.initialSessionId) {
    void ensureAgentRecord({store, harnessKind: opts.harness.id, cwd: opts.cwd}, opts.initialSessionId).catch(() => {})
  }

  void sweepEmptyChatRecords(store, new Set(readLocks(opts.stateRoot).map((l) => l.key))).catch(() => {})

  return new Hono()
    .route('/', makePermissionRoutes(gate))
    .route(
      '/',
      makeSessionRoutes({
        cwd: opts.cwd,
        stateRoot: opts.stateRoot,
        store,
        harness: opts.harness,
        hub,
        claudeHome: opts.claudeHome,
      }),
    )
    .route('/', makeLaunchRoutes({cwd: opts.cwd, harness: opts.harness, store}))
    .route(
      '/',
      makeTurnRoutes({
        cwd: opts.cwd,
        stateRoot: opts.stateRoot,
        harness: opts.harness,
        harnessEnv: opts.harnessEnv,
        claudeHome: opts.claudeHome,
        gate,
        systemPromptFile: opts.systemPromptFile,
        systemPromptText: opts.systemPromptText,
        uiBus,
        store,
        tools: opts.tools,
        onTurnStart: opts.onTurnStart,
        onTurnEnd: opts.onTurnEnd,
        hub,
      }),
    )
    .route('/', makeAttachRoute({cwd: opts.cwd, harness: opts.harness, store, hub, claudeHome: opts.claudeHome}))
}
