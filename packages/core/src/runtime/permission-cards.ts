import type {ChatPlane} from '@conciv/chat'
import type {ConcivDb} from '@conciv/db'
import {
  approvalAskOf,
  approvalRequestedEvent,
  approvalSettledEvent,
  type ChatEvent,
} from '@conciv/protocol/chat-event-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {Agent, Bus, Permission} from '@conciv/plugin-host'
import {Effect, Layer, Option, Schema} from 'effect'
import {currentRow} from '../sessions/session-rows.js'

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

type CardDecision = {approvalId: string; approved: boolean; scope: 'once' | 'session'}

const isAsked = Schema.is(Permission.Event.Asked.data)

const isReplied = Schema.is(Permission.Event.Replied.data)

const decodeRequestId = Schema.decodeUnknownOption(Permission.Id)

export function permissionSessions(db: ConcivDb) {
  return Layer.succeed(
    Permission.PermissionSessions,
    Permission.PermissionSessions.of({
      get: (sessionId) =>
        Effect.sync(() => {
          const parsed = SessionId.safeParse(sessionId)
          if (!parsed.success || currentRow(db, parsed.data) === null) return undefined
          return {agent: Agent.defaultId}
        }),
    }),
  )
}

function titleOf(request: Permission.Request): string {
  const title = `${request.action} ${request.resources.join(', ')}`
  return title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT - 1)}…` : title
}

async function showCard(cards: PermissionCards, request: Permission.Request): Promise<void> {
  const sessionId = SessionId.parse(request.sessionId)
  const card = {
    approvalId: request.id,
    toolCallId: request.id,
    title: titleOf(request),
    input: request.metadata ?? {},
    permission: {always: (request.save?.length ?? 0) > 0},
  }
  await cards.plane.permissionAsked(sessionId, card)
  cards.publish(sessionId, {...approvalRequestedEvent.create(card), timestamp: Date.now()})
}

async function dropCard(cards: PermissionCards, sessionId: string, requestId: string): Promise<void> {
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
      Effect.sync(() => {
        void cardWork(cards, event.type, event.data)?.catch((error: unknown) =>
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

function replyOf(approved: boolean, scope: CardDecision['scope']): Permission.Reply {
  if (!approved) return 'reject'
  return scope === 'session' ? 'always' : 'once'
}

export async function decidePermissionCard(
  deps: {plane: Pick<ChatPlane, 'catchUp' | 'decide' | 'permissionSettled'>; answer: PermissionAnswer},
  sessionId: SessionId,
  decision: CardDecision,
): Promise<{startsTurn: boolean} | null> {
  const cards = (await deps.plane.catchUp(sessionId)).map(approvalAskOf)
  const card = cards.find((ask) => ask?.approvalId === decision.approvalId)
  if (card?.permission === undefined)
    return deps.plane.decide(sessionId, decision.approvalId, decision.approved, decision.scope)
  const outcome = await deps.answer(sessionId, decision.approvalId, replyOf(decision.approved, decision.scope))
  if (outcome === 'gone') await deps.plane.permissionSettled(sessionId, decision.approvalId)
  return outcome === 'replied' ? {startsTurn: false} : null
}
