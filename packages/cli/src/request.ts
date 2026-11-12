import {safe, toORPCError, type ORPCError} from '@orpc/client'
import {z} from 'zod'
import {
  CONCIV_CLIENT_HEADER,
  CONCIV_NAMED_TAB_HEADER,
  CONCIV_ORIGIN_HEADER,
  CONCIV_SESSION_HEADER,
  isSessionId,
  type SessionId,
} from '@conciv/protocol/chat-types'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {initContributions} from '@conciv/harness-init/registry'
import {INIT_HARNESS_IDS} from '@conciv/protocol/harness-types'
import type {CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'
import {engineOrigin} from './engine-origin.js'

const OFFLINE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
])

const MAX_CAUSE_DEPTH = 5

const TERMINAL_CLIENT = 'terminal'

const LinkSchema = z.object({code: z.string().optional(), message: z.string().optional(), cause: z.unknown()})

const RemoteSchema = z.object({status: z.number(), code: z.string()})

const APPROVAL_DENIED = 'APPROVAL_DENIED'

function declaredSessionId(): SessionId | null {
  const raw = process.env.CONCIV_SESSION_ID?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) {
    throw userFailure(`CONCIV_SESSION_ID is not a conciv session id: "${raw}"`, {
      hint: 'Unset it, or set it to the conciv_… id the engine handed your terminal.',
    })
  }
  return raw
}

const processSession: {id: SessionId | null} = {id: null}

async function sessionId(origin: string): Promise<SessionId> {
  const declared = declaredSessionId()
  if (declared !== null) return declared
  const held = processSession.id
  if (held !== null) return held
  const resolved = await makeRpcClient(origin).sessions.resolve({})
  processSession.id = resolved.sessionId
  return resolved.sessionId
}

export type CliTarget = {tab: SessionId | null}

type RpcCall = (rpc: RpcClient) => Promise<unknown>

type EngineOrigin = Awaited<ReturnType<typeof engineOrigin>>

async function withSession(engine: EngineOrigin, target: CliTarget, call: RpcCall): Promise<unknown> {
  const session = {[CONCIV_SESSION_HEADER]: target.tab ?? (await sessionId(engine.origin))}
  const named = target.tab === null ? {} : {[CONCIV_NAMED_TAB_HEADER]: '1'}
  const hub = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: callingAgent(process.env), ...named}
  return call(makeRpcClient(engine.origin, {headers: engine.outside ? {...session, ...hub} : session}))
}

export async function engineAnswer<Answer>(origin: string, pending: Promise<Answer>): Promise<Answer> {
  const result = await safe(pending)
  if (result.isSuccess) return result.data
  if (result.isDefined) throw rpcFailure(toORPCError(result.error))
  if (offline(result.error, 0)) throw offlineFailure(origin)
  if (rejectedByServer(result.error)) throw rpcFailure(toORPCError(result.error))
  throw result.error
}

export async function runRpc(target: CliTarget, call: RpcCall): Promise<CliOutcome> {
  const engine = await engineOrigin(process.cwd(), process.env, target.tab)
  return {report: 'json', data: await engineAnswer(engine.origin, withSession(engine, target, call))}
}

function callingAgent(env: NodeJS.ProcessEnv): string {
  const shellEnv = (id: (typeof INIT_HARNESS_IDS)[number]) => initContributions[id].hub?.shellEnv
  return (
    INIT_HARNESS_IDS.find((id) => {
      const variable = shellEnv(id)
      return variable !== undefined && Boolean(env[variable])
    }) ?? TERMINAL_CLIENT
  )
}

function rejectedByServer(error: unknown): boolean {
  const remote = RemoteSchema.safeParse(error)
  if (!remote.success) return false
  return remote.data.code === APPROVAL_DENIED || (remote.data.status >= 400 && remote.data.status < 500)
}

function rpcFailure(error: ORPCError<string, unknown>): Error {
  return userFailure(error.message, {code: error.code})
}

function offlineFailure(origin: string): Error {
  return userFailure(`No conciv dev server on ${new URL(origin).host}.`, {
    hint: "Start your app (pnpm dev). conciv reads the engine port from .conciv/server.json; CONCIV_PORT=<engine port> overrides it (this is the conciv engine port, not Vite's).",
  })
}

function offline(error: unknown, depth: number): boolean {
  if (depth > MAX_CAUSE_DEPTH) return false
  const link = LinkSchema.safeParse(error)
  if (!link.success) return false
  if (link.data.code !== undefined && OFFLINE_CODES.has(link.data.code)) return true
  if (link.data.message === 'fetch failed') return true
  return offline(link.data.cause, depth + 1)
}
