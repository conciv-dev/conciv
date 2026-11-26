import type {ToolDomain} from '../../backend-defaults.js'
import type {ChatPendingApproval} from '@conciv/protocol'
import type {ConcivDb} from '../../db/connection.js'
import type {HarnessPermissionAsk, HarnessPermissionVerdict} from '@conciv/types/harness-types'
import {approvalRequestedEvent, approvalSettledEvent, type ChatEvent} from '@conciv/types/chat-event-types'
import {SessionId, type PermissionRule} from '@conciv/types/chat-types'
import {
  Agent,
  Bus,
  Database,
  Instructions,
  KV,
  Permission,
  Plugin,
  SessionErrors,
  SessionSchema,
  Tool,
} from '@conciv/backend-app-api'
import {CodeModeCatalog, CodeModeInstructions, InstructionState, SkillInstructions} from '../../backend-defaults.js'
import {Effect, Layer, Option, Ref, Schema} from 'effect'
import * as Identifier from '@conciv/protocol/schema/identifier'
import {once} from 'es-toolkit'
import {storedSessionRules, type StoredRules} from '../sessions/session-rows.js'
import {loadInstructionEntries} from './instruction-entries.js'

const TITLE_LIMIT = 200

const OUTSIDE_AGENT = 'outside-agent'

export type PermissionOutcome = 'replied' | 'foreign' | 'gone'

export type PermissionAnswer = (
  sessionId: SessionId,
  requestId: string,
  reply: Permission.Reply,
) => Promise<PermissionOutcome>

type CardPublish = (sessionId: SessionId, chunk: ChatEvent) => void

type PermissionCards = {
  publish: CardPublish
}

type CardDecision = {approvalId: string; reply: Permission.Reply}

const isAsked = Schema.is(Permission.Event.Asked.data)

const isReplied = Schema.is(Permission.Event.Replied.data)

const decodeRequestId = Schema.decodeUnknownOption(Permission.Id)

const isDeclined = Schema.is(Permission.DeclinedError)

const NO_PLUGIN_TOOLS: PermissionRule[] = [
  {action: '*', resource: '*', effect: 'deny'},
  {action: 'execute', resource: '*', effect: 'allow'},
]

function sessionPermissions(sessionId: SessionId, stored: StoredRules): Effect.Effect<PermissionRule[]> {
  if (stored.readable) return Effect.succeed(stored.rules ?? [])
  return Effect.logWarning(
    '[core] the session has permission rules that cannot be read, so it is offered no plugin tools',
  ).pipe(Effect.annotateLogs({sessionId}), Effect.as(NO_PLUGIN_TOOLS))
}

export function permissionSessions(db: ConcivDb) {
  return Layer.succeed(
    Permission.PermissionSessions,
    Permission.PermissionSessions.of({
      get: (sessionId) =>
        Effect.gen(function* () {
          const parsed = SessionId.safeParse(sessionId)
          if (!parsed.success) return undefined
          const stored = yield* storedSessionRules(db, parsed.data).pipe(Effect.orDie)
          if (stored === null) return undefined
          return {agent: Agent.defaultId, permissions: yield* sessionPermissions(parsed.data, stored)}
        }),
    }),
  )
}

function sessionRules(
  sessionId: SessionId,
): Effect.Effect<{agent: Agent.Id; rules: Permission.Ruleset}, never, Agent.Interface | Permission.SessionsInterface> {
  return Effect.gen(function* () {
    const session = yield* (yield* Permission.PermissionSessions).get(SessionSchema.Id.make(sessionId))
    const agent = yield* (yield* Agent.Service).select(session?.agent)
    return {agent: agent.id, rules: Permission.merge(agent.info?.permissions ?? [], session?.permissions ?? [])}
  })
}

export const sessionToolDomain = Effect.fn('core.permissions.toolDomain')(function* (
  sessionId: SessionId,
): Effect.fn.Return<
  ToolDomain,
  never,
  Tool.Interface | Agent.Interface | Permission.SessionsInterface | Identifier.Maker
> {
  yield* Effect.annotateCurrentSpan({sessionId})
  const {agent, rules} = yield* sessionRules(sessionId)
  return {snapshot: yield* (yield* Tool.Service).snapshot(rules), agent, ids: yield* Identifier.Service}
})

export const currentToolDomain = Effect.fn('core.permissions.currentToolDomain')(function* (
  sessionId: SessionId,
): Effect.fn.Return<
  ToolDomain,
  never,
  Plugin.Interface | Tool.Interface | Agent.Interface | Permission.SessionsInterface | Identifier.Maker
> {
  yield* Effect.annotateCurrentSpan({sessionId})
  yield* Plugin.awaitActivation
  return yield* sessionToolDomain(sessionId)
})

function isMarker(value: unknown): value is Instructions.Unavailable | Instructions.Removed {
  return value === Instructions.unavailable || value === Instructions.removed
}

function observedValues(read: Instructions.ReadResult) {
  return Object.fromEntries(read.flatMap(({key, value}) => (isMarker(value) ? [] : [[key, value]])))
}

export const pluginInstructions = Effect.fn('core.instructions.load')(function* (
  sessionId: SessionId,
  reset: 'keep' | 'reset',
  inventory: CodeModeCatalog.Inventory | undefined,
) {
  yield* Effect.annotateCurrentSpan({sessionId})
  const db = (yield* Database.Service).db
  const bus = yield* Bus.Service
  const context = yield* Effect.context()
  const id = SessionSchema.Id.make(sessionId)
  const skills = yield* (yield* SkillInstructions.Service).load((yield* sessionRules(sessionId)).rules)
  const entries = yield* loadInstructionEntries(yield* KV.Service, id)
  const instructions = Instructions.combine([CodeModeInstructions.make(inventory), skills, entries])
  const read = yield* Instructions.read(instructions)
  const {previewed, observation} = yield* db
    .transaction(() =>
      Effect.gen(function* () {
        const previewed = yield* InstructionState.preview(db, id, instructions, read)
        const observation = yield* InstructionState.observe(db, instructions, id)
        return {previewed, observation}
      }),
    )
    .pipe(
      Effect.catch((error) =>
        error._tag === 'Instructions.InitializationBlocked' ? Effect.fail(error) : Effect.die(error),
      ),
    )
  const commit = db.transaction(() =>
    Effect.gen(function* () {
      yield* InstructionState.commit(db, bus, instructions, observation)
      if (reset === 'reset') yield* InstructionState.advanceEpoch(db, id, yield* Bus.latestSequence(db, id))
    }),
  )
  return {
    initial:
      reset === 'reset'
        ? Instructions.join(Instructions.renderInitial(instructions, observedValues(read)))
        : Instructions.join(previewed.initial),
    update: reset === 'reset' ? '' : previewed.update,
    told: once(() => Effect.runPromiseWith(context)(commit.pipe(Effect.orDie))),
  }
})

function formatCardTitle(request: Permission.Request): string {
  const title = `${request.action} ${request.resources.join(', ')}`
  return title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT - 1)}…` : title
}

function buildCard(request: Permission.Request): ChatPendingApproval {
  return {
    approvalId: request.id,
    toolCallId: request.id,
    toolName: formatCardTitle(request),
    input: request.metadata ?? {},
    runId: null,
    permission: {always: (request.save?.length ?? 0) > 0},
  }
}

function showCard(cards: PermissionCards, request: Permission.Request): void {
  const sessionId = SessionId.parse(request.sessionId)
  const {toolName, runId: _runId, ...card} = buildCard(request)
  cards.publish(sessionId, {...approvalRequestedEvent.create({...card, title: toolName}), timestamp: Date.now()})
}

function dropCard(publish: CardPublish, sessionId: string, requestId: string): void {
  publish(SessionId.parse(sessionId), {...approvalSettledEvent.create({approvalId: requestId}), timestamp: Date.now()})
}

function cardWork(cards: PermissionCards, type: string, data: unknown): void {
  if (type === Permission.Event.Asked.type && isAsked(data)) showCard(cards, data)
  if (type === Permission.Event.Replied.type && isReplied(data)) dropCard(cards.publish, data.sessionId, data.requestId)
}

export const followPermissionCards = Effect.fn('core.permissions.followCards')(function* (
  cards: PermissionCards,
): Effect.fn.Return<Bus.Unsubscribe, never, Bus.Interface> {
  const bus = yield* Bus.Service
  return yield* bus.listen((event) =>
    Effect.try({try: () => cardWork(cards, event.type, event.data), catch: (error) => error}).pipe(
      Effect.catch((error) =>
        Effect.logError('[core] the permission card could not be updated').pipe(
          Effect.annotateLogs({event: event.type, error: String(error)}),
        ),
      ),
    ),
  )
})

export const pendingPermissionCards = Effect.fn('core.permissions.pendingCards')(function* (
  sessionId: SessionId,
): Effect.fn.Return<ChatPendingApproval[], never, Permission.Interface> {
  yield* Effect.annotateCurrentSpan({sessionId})
  const requests = yield* Permission.Service.use((permission) =>
    permission.forSession(SessionSchema.Id.make(sessionId)),
  )
  return requests.map(buildCard)
})

export function settlingAsks<A, E, R>(
  sessionId: SessionId,
  effect: Effect.Effect<A, E, R>,
  publish: CardPublish,
): Effect.Effect<A, E, R | Bus.Interface | Permission.Interface> {
  return Effect.gen(function* () {
    const asked = yield* Ref.make<readonly string[]>([])
    const unsubscribe = yield* (yield* Bus.Service).listen((event) => {
      const data = event.data
      if (event.type !== Permission.Event.Asked.type || !isAsked(data) || data.sessionId !== sessionId)
        return Effect.void
      return Ref.update(asked, (ids) => [...ids, data.id])
    })
    const settleLeft = Effect.gen(function* () {
      yield* unsubscribe
      const open = yield* Permission.Service.use((permission) =>
        permission.forSession(SessionSchema.Id.make(sessionId)),
      )
      const left = (yield* Ref.get(asked)).filter((id) => !open.some((request) => request.id === id))
      left.forEach((id) => dropCard(publish, sessionId, id))
    })
    return yield* effect.pipe(Effect.ensuring(settleLeft))
  }).pipe(Effect.withSpan('core.permissions.settleAsks', {attributes: {sessionId}}))
}

function refused(message: string): HarnessPermissionVerdict {
  return {allowed: false, message}
}

export const askForHarness = Effect.fn('core.permissions.askForHarness')(function* (
  sessionId: SessionId,
  ask: HarnessPermissionAsk,
  publish: CardPublish,
): Effect.fn.Return<HarnessPermissionVerdict, never, Permission.Interface | Bus.Interface> {
  yield* Effect.annotateCurrentSpan({sessionId})
  const asked = `${ask.action} ${ask.resources.join(', ')}`
  const assert = Permission.Service.use((permission) =>
    permission.assert({
      sessionId: SessionSchema.Id.make(sessionId),
      action: ask.action,
      resources: ask.resources,
      save: [],
      fallback: 'ask',
      metadata: ask.metadata,
    }),
  ).pipe(
    Effect.as<HarnessPermissionVerdict>({allowed: true}),
    Effect.catch((error) => Effect.succeed(refused(error.message || `Permission denied: ${asked}`))),
    Effect.catchDefect((defect) =>
      isDeclined(defect) ? Effect.succeed(refused(`The user rejected ${asked}.`)) : Effect.die(defect),
    ),
  )
  return yield* settlingAsks(sessionId, assert, publish)
})

export const answerPermission = Effect.fn('core.permissions.answer')(function* (
  sessionId: SessionId,
  requestId: string,
  reply: Permission.Reply,
): Effect.fn.Return<PermissionOutcome, never, Permission.Interface> {
  yield* Effect.annotateCurrentSpan({sessionId})
  const permission = yield* Permission.Service
  const id = decodeRequestId(requestId)
  if (Option.isNone(id)) return 'gone'
  const request = yield* permission.get(id.value)
  if (request === undefined) return 'gone'
  const owner: string = request.sessionId
  if (owner !== sessionId) return 'foreign'
  return yield* permission.reply({requestId: id.value, reply}).pipe(
    Effect.map((): PermissionOutcome => 'replied'),
    Effect.catchTag('Permission.NotFoundError', () => Effect.succeed<PermissionOutcome>('gone')),
  )
})

export const assertOutsideAgent = Effect.fn('core.permissions.assertOutsideAgent')(function* (
  sessionId: SessionId,
  client: string,
): Effect.fn.Return<void, Permission.Error | SessionErrors.NotFoundError, Permission.Interface> {
  yield* Effect.annotateCurrentSpan({sessionId, client})
  const permission = yield* Permission.Service
  yield* permission.assert({
    sessionId: SessionSchema.Id.make(sessionId),
    action: OUTSIDE_AGENT,
    resources: [client],
    save: [client],
    fallback: 'ask',
    metadata: {client},
  })
})

export async function decidePermissionCard(
  deps: {answer: PermissionAnswer; publish: CardPublish},
  sessionId: SessionId,
  decision: CardDecision,
): Promise<boolean> {
  const outcome = await deps.answer(sessionId, decision.approvalId, decision.reply)
  if (outcome === 'gone') dropCard(deps.publish, sessionId, decision.approvalId)
  return outcome === 'replied'
}
