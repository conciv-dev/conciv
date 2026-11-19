import {randomUUID} from 'node:crypto'
import type {ServerHarness, ServerSessions} from '@conciv/protocol/harness-types'
import {Cache, Duration, Effect} from 'effect'
import {HarnessSessionId, type SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import {createTtySessions, type TtySession} from './pty-sessions.js'

const TICKET_TTL = Duration.seconds(60)

const TICKET_CAPACITY = 10_000

const RESUMED_BANNER = '\u001b[2m─ conciv: resumed session ─\u001b[0m'

type PtySize = {cols: number; rows: number}

type PersistentPtyInfo = {id: string; sessionId: SessionId; size: PtySize; busy: boolean}

type TtyLauncher = NonNullable<ServerHarness['ttyCommand']>

type TicketScope = {ptyId: string; origin: string | null}

type CreateInput = {sessionId: SessionId; size?: PtySize; model?: string}

type PersistentPtyDeps = {
  harness: (sessionId: SessionId) => Promise<ServerHarness>
  sessions: Pick<ServerSessions, 'resumeToken' | 'recordToken' | 'model'>
  cwd: string
  stateDir: string
  mcpUrl: () => string | null
}

export type PersistentPtys = ReturnType<typeof createPersistentPtys>

function ownerKey(harnessId: string, token: HarnessSessionId | null): string {
  return `${harnessId}:${token ?? ''}`
}

function describePty(session: TtySession, sessionId: SessionId): PersistentPtyInfo {
  return {id: session.id, sessionId, size: session.size(), busy: session.busy()}
}

export function createPersistentPtys(deps: PersistentPtyDeps) {
  const ttys = createTtySessions()
  const tickets = Effect.runSync(
    Cache.make<string, TicketScope>({
      capacity: TICKET_CAPACITY,
      timeToLive: TICKET_TTL,
      lookup: () => Effect.die(new Error('conciv: terminal tickets are set and consumed, never looked up')),
    }),
  )

  const issueTicket = (scope: TicketScope): {ticket: string; expiresIn: number} => {
    const ticket = randomUUID()
    Effect.runSync(Cache.set(tickets, ticket, scope))
    return {ticket, expiresIn: Duration.toSeconds(TICKET_TTL)}
  }

  const consumeTicket = (ticket: string, scope: TicketScope): boolean =>
    Effect.runSync(
      Cache.invalidateWhen(tickets, ticket, (bound) => bound.ptyId === scope.ptyId && bound.origin === scope.origin),
    )

  const live = async (sessionId: SessionId): Promise<TtySession | undefined> => {
    const owner = ownerKey((await deps.harness(sessionId)).id, await deps.sessions.resumeToken(sessionId))
    const alive = ttys.get(sessionId)
    if (alive === undefined || alive.owner === owner) return alive
    ttys.close(sessionId)
    return undefined
  }

  const mintToken = async (sessionId: SessionId): Promise<{token: HarnessSessionId; minted: boolean}> => {
    const existing = await deps.sessions.resumeToken(sessionId)
    if (existing) return {token: existing, minted: false}
    const token = HarnessSessionId.parse(randomUUID())
    await deps.sessions.recordToken(sessionId, token)
    return {token, minted: true}
  }

  const resizeTo = (session: TtySession, size: PtySize | undefined): void => {
    if (size) session.resize(size.cols, size.rows)
  }

  const connectContext = async (
    input: CreateInput,
    harness: ServerHarness,
    {token, minted}: {token: HarnessSessionId; minted: boolean},
  ): Promise<HarnessConnectContext> => ({
    cwd: deps.cwd,
    stateDir: deps.stateDir,
    concivSessionId: input.sessionId,
    harnessSessionId: token,
    resume: !minted && (harness.transcriptExists?.(token) ?? true),
    owned: true,
    model: input.model ?? (await deps.sessions.model(input.sessionId)),
    mcpUrl: deps.mcpUrl(),
    hookUrl: null,
  })

  const spawnFresh = async (input: CreateInput, harness: ServerHarness, command: TtyLauncher): Promise<TtySession> => {
    const owner = await mintToken(input.sessionId)
    const context = await connectContext(input, harness, owner)
    const session = await ttys.open(input.sessionId, command(context), deps.cwd, ownerKey(harness.id, owner.token))
    resizeTo(session, input.size)
    if (context.resume) session.inject(RESUMED_BANNER)
    return session
  }

  const create = async (input: CreateInput): Promise<PersistentPtyInfo | null> => {
    const harness = await deps.harness(input.sessionId)
    const command = harness.ttyCommand
    if (command === undefined) return null
    const alive = await live(input.sessionId)
    if (alive !== undefined && alive.exited() === null) {
      resizeTo(alive, input.size)
      return describePty(alive, input.sessionId)
    }
    return describePty(await spawnFresh(input, harness, command), input.sessionId)
  }

  return {create, find: ttys.find, issueTicket, consumeTicket, shutdown: ttys.shutdown}
}
