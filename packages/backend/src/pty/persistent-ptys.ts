import {randomUUID} from 'node:crypto'
import type {ServerHarness, ServerSessions} from '@conciv/types/harness-types'
import {HarnessSessionId, type SessionId} from '@conciv/types/chat-types'
import type {HarnessConnectContext} from '@conciv/types/harness-types'
import {createTtySessions, type PtySize, type TtySession} from './pty-sessions.js'

const RESUMED_BANNER = '\u001b[2m─ conciv: resumed session ─\u001b[0m'

type PersistentPtyInfo = {id: string; sessionId: SessionId; size: PtySize; busy: boolean}

type TtyLauncher = NonNullable<ServerHarness['ttyCommand']>

type CreateInput = {sessionId: SessionId; size?: PtySize; model?: string}

type PersistentPtyDeps = {
  harness: (sessionId: SessionId) => Promise<ServerHarness>
  sessions: ServerSessions
  cwd: string
  stateDir: string
  mcpUrl: () => string | null
  env: Readonly<Record<string, string>>
}

export type PersistentPtys = ReturnType<typeof createPersistentPtys>

function ownerKey(harnessId: string, token: HarnessSessionId | null): string {
  return `${harnessId}:${token ?? ''}`
}

function describePty(session: TtySession, sessionId: SessionId): PersistentPtyInfo {
  return {id: session.id, sessionId, size: session.size(), busy: session.busy()}
}

export function createPersistentPtys(deps: PersistentPtyDeps) {
  const ttys = createTtySessions({env: deps.env})
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
    resume: !minted && ((await harness.transcriptExists?.(token)) ?? true),
    model: input.model ?? (await deps.sessions.model(input.sessionId)),
    mcpUrl: deps.mcpUrl(),
  })

  const spawnFresh = async (input: CreateInput, harness: ServerHarness, command: TtyLauncher): Promise<TtySession> => {
    const owner = await mintToken(input.sessionId)
    const context = await connectContext(input, harness, owner)
    const session = await ttys.open(
      input.sessionId,
      command(context),
      deps.cwd,
      ownerKey(harness.id, owner.token),
      input.size,
    )
    if (context.resume) session.inject(RESUMED_BANNER)
    return session
  }

  const opened = async (input: CreateInput, harness: ServerHarness, command: TtyLauncher): Promise<TtySession> => {
    const alive = await live(input.sessionId)
    if (alive === undefined || alive.exited() !== null) return spawnFresh(input, harness, command)
    resizeTo(alive, input.size)
    return alive
  }

  const create = async (input: CreateInput, origin: string | null): Promise<PersistentPtyInfo | null> => {
    const harness = await deps.harness(input.sessionId)
    const command = harness.ttyCommand
    if (command === undefined) return null
    const session = await opened(input, harness, command)
    if (!session.admitted.includes(origin)) session.admitted = [...session.admitted, origin]
    return describePty(session, input.sessionId)
  }

  const admitted = (ptyId: string, origin: string | null): TtySession | undefined => {
    const session = ttys.find(ptyId)
    return session?.admitted.includes(origin) === true ? session : undefined
  }

  return {create, find: ttys.find, admitted, shutdown: ttys.shutdown}
}
