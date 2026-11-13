import type {ChatPlane} from '@conciv/chat'
import type {ConcivDb} from '@conciv/db'
import {
  readApprovalAsk,
  approvalRequestedEvent,
  approvalSettledEvent,
  type ChatEvent,
} from '@conciv/protocol/chat-event-types'
import {SessionId, type PermissionRule} from '@conciv/protocol/chat-types'
import {
  Agent,
  Bus,
  CodeModeCatalog,
  CodeModeInstructions,
  Database,
  Instructions,
  InstructionState,
  Permission,
  Session,
  SkillInstructions,
  Tool,
} from '@conciv/plugin-host'
import {Effect, Layer, Option, Schema} from 'effect'
import {logError} from '../lib/debug.js'
import {storedSessionRules, type StoredRules} from '../sessions/session-rows.js'

const TITLE_LIMIT = 200

export type PermissionOutcome = 'replied' | 'foreign' | 'gone'

export type PermissionAnswer = (
  sessionId: SessionId,
  requestId: string,
  reply: Permission.Reply,
) => Promise<PermissionOutcome>

type PermissionCards = {
  plane: Pick<ChatPlane, 'permissionAsked' | 'permissionSettled'>
  publish: (sessionId: SessionId, chunk: ChatEvent) => void
  log: (line: string) => void
}

type CardSettle = {
  plane: Pick<ChatPlane, 'permissionSettled'>
  publish: PermissionCards['publish']
}

type CardDecision = {approvalId: string; approved: boolean; scope: 'once' | 'session'}

const isAsked = Schema.is(Permission.Event.Asked.data)

const isReplied = Schema.is(Permission.Event.Replied.data)

const decodeRequestId = Schema.decodeUnknownOption(Permission.Id)

const NO_PLUGIN_TOOLS: PermissionRule[] = [
  {action: '*', resource: '*', effect: 'deny'},
  {action: 'execute', resource: '*', effect: 'allow'},
]

function sessionPermissions(sessionId: SessionId, stored: StoredRules): PermissionRule[] {
  if (stored.readable) return stored.rules ?? []
  logError(`[core] session ${sessionId} has permission rules that cannot be read, so it is offered no plugin tools`)
  return NO_PLUGIN_TOOLS
}

export function permissionSessions(db: ConcivDb) {
  return Layer.succeed(
    Permission.PermissionSessions,
    Permission.PermissionSessions.of({
      get: (sessionId) =>
        Effect.sync(() => {
          const parsed = SessionId.safeParse(sessionId)
          if (!parsed.success) return undefined
          const stored = storedSessionRules(db, parsed.data)
          if (stored === null) return undefined
          return {agent: Agent.defaultId, permissions: sessionPermissions(parsed.data, stored)}
        }),
    }),
  )
}

function sessionRules(
  sessionId: SessionId,
): Effect.Effect<Permission.Ruleset, never, Agent.Interface | Permission.SessionsInterface> {
  return Effect.gen(function* () {
    const session = yield* (yield* Permission.PermissionSessions).get(Session.Id.make(sessionId))
    const agent = yield* (yield* Agent.Service).select(session?.agent)
    return Permission.merge(agent.info?.permissions ?? [], session?.permissions ?? [])
  })
}

export function sessionSnapshot(
  sessionId: SessionId,
): Effect.Effect<Tool.Snapshot, never, Tool.Interface | Agent.Interface | Permission.SessionsInterface> {
  return Effect.gen(function* () {
    return yield* (yield* Tool.Service).snapshot(yield* sessionRules(sessionId))
  })
}

export function pluginInstructions(
  sessionId: SessionId,
  reset: 'keep' | 'reset',
  inventory: CodeModeCatalog.Inventory,
) {
  return Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const bus = yield* Bus.Service
    const id = Session.Id.make(sessionId)
    const skills = yield* (yield* SkillInstructions.Service).load(yield* sessionRules(sessionId))
    const instructions = Instructions.combine([CodeModeInstructions.make(inventory), skills])
    const previewed = yield* InstructionState.preview(db, id, instructions, yield* Instructions.read(instructions))
    yield* InstructionState.commit(db, bus, instructions, yield* InstructionState.observe(db, instructions, id))
    if (reset === 'reset') yield* InstructionState.advanceEpoch(db, id, yield* Bus.latestSequence(db, id))
    return {
      initial: Instructions.join(yield* InstructionState.initial(db, id, instructions)),
      update: reset === 'reset' ? '' : previewed.update,
    }
  })
}

function formatCardTitle(request: Permission.Request): string {
  const title = `${request.action} ${request.resources.join(', ')}`
  return title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT - 1)}…` : title
}

async function showCard(cards: PermissionCards, request: Permission.Request): Promise<void> {
  const sessionId = SessionId.parse(request.sessionId)
  const card = {
    approvalId: request.id,
    toolCallId: request.id,
    title: formatCardTitle(request),
    input: request.metadata ?? {},
    permission: {always: (request.save?.length ?? 0) > 0},
  }
  await cards.plane.permissionAsked(sessionId, card)
  cards.publish(sessionId, {...approvalRequestedEvent.create(card), timestamp: Date.now()})
}

async function dropCard(cards: CardSettle, sessionId: string, requestId: string): Promise<void> {
  const session = SessionId.parse(sessionId)
  await cards.plane.permissionSettled(session, requestId)
  cards.publish(session, {...approvalSettledEvent.create({approvalId: requestId}), timestamp: Date.now()})
}

function cardWork(cards: PermissionCards, type: string, data: unknown): Promise<void> | null {
  if (type === Permission.Event.Asked.type && isAsked(data)) return showCard(cards, data)
  if (type === Permission.Event.Replied.type && isReplied(data)) return dropCard(cards, data.sessionId, data.requestId)
  return null
}

export function followPermissionCards(cards: PermissionCards): Effect.Effect<Bus.Unsubscribe, never, Bus.Interface> {
  return Effect.gen(function* () {
    const bus = yield* Bus.Service
    return yield* bus.listen((event) =>
      Effect.promise(async () => {
        await cardWork(cards, event.type, event.data)?.catch((error: unknown) =>
          cards.log(`[core] the permission card for ${event.type} could not be updated: ${String(error)}`),
        )
      }),
    )
  })
}

export function answerPermission(
  sessionId: SessionId,
  requestId: string,
  reply: Permission.Reply,
): Effect.Effect<PermissionOutcome, never, Permission.Interface> {
  return Effect.gen(function* () {
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
}

function toPermissionReply(approved: boolean, scope: CardDecision['scope']): Permission.Reply {
  if (!approved) return 'reject'
  return scope === 'session' ? 'always' : 'once'
}

export async function decidePermissionCard(
  deps: {
    plane: Pick<ChatPlane, 'catchUp' | 'decide' | 'permissionSettled'>
    answer: PermissionAnswer
    publish: PermissionCards['publish']
  },
  sessionId: SessionId,
  decision: CardDecision,
): Promise<{startsTurn: boolean} | null> {
  const cards = (await deps.plane.catchUp(sessionId)).map(readApprovalAsk)
  const card = cards.find((ask) => ask?.approvalId === decision.approvalId)
  if (card?.permission === undefined)
    return deps.plane.decide(sessionId, decision.approvalId, decision.approved, decision.scope)
  const outcome = await deps.answer(
    sessionId,
    decision.approvalId,
    toPermissionReply(decision.approved, decision.scope),
  )
  if (outcome === 'gone') await dropCard(deps, sessionId, decision.approvalId)
  return outcome === 'replied' ? {startsTurn: false} : null
}
