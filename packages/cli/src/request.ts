import {ORPCError, safe} from '@orpc/client'
import {z} from 'zod'
import {
  CONCIV_CLIENT_HEADER,
  CONCIV_NAMED_TAB_HEADER,
  CONCIV_ORIGIN_HEADER,
  CONCIV_SESSION_HEADER,
  isSessionId,
  type SessionId,
} from '@conciv/types/chat-types'
import {makeRpcClient, type EngineClient} from '@conciv/client'
import {ENGINE_ERROR_STATUS} from '@conciv/protocol'
import {initContributions} from '@conciv/harness/init/registry'
import {INIT_HARNESS_IDS} from '@conciv/types/harness-types'
import type {CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'
import {engineOrigin} from './engine-origin.js'

const OFFLINE_CODES = [
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]

const MAX_CAUSE_DEPTH = 5

const TERMINAL_CLIENT = 'terminal'

const LinkSchema = z.object({code: z.string().optional(), message: z.string().optional(), cause: z.unknown()})

const APPROVAL_DENIED = 'APPROVAL_DENIED'

const PLUGIN_RPC_CODES: readonly string[] = ['PLUGIN_RPC', 'PLUGIN_RPC_INTERNAL']

const PluginFailureSchema = z.object({type: z.string(), data: z.unknown().optional()})

function declaredSessionId(): SessionId | null {
  const raw = process.env.CONCIV_SESSION_ID?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) {
    throw userFailure(`CONCIV_SESSION_ID is not a conciv session id: "${raw}"`, {
      hint: 'Unset it, or set it to the ses_… id the engine handed your terminal.',
    })
  }
  return raw
}

const processSession: {id: SessionId | null} = {id: null}

async function sessionId(origin: string, token: string | undefined): Promise<SessionId> {
  const declared = declaredSessionId()
  if (declared !== null) return declared
  const held = processSession.id
  if (held !== null) return held
  const resolved = await makeRpcClient(origin, {token}).sessions.resolve({})
  processSession.id = resolved.sessionId
  return resolved.sessionId
}

export type CliTarget = {tab: SessionId | null}

type RpcCall = (rpc: EngineClient, sessionId: SessionId) => Promise<unknown>

type EngineOrigin = Awaited<ReturnType<typeof engineOrigin>>

async function withSession(engine: EngineOrigin, target: CliTarget, call: RpcCall): Promise<unknown> {
  const id = target.tab ?? (await sessionId(engine.origin, engine.token))
  const session = {[CONCIV_SESSION_HEADER]: id}
  const named = target.tab === null ? {} : {[CONCIV_NAMED_TAB_HEADER]: '1'}
  const hub = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: callingAgent(process.env), ...named}
  return call(
    makeRpcClient(engine.origin, {token: engine.token, headers: engine.outside ? {...session, ...hub} : session}),
    id,
  )
}

export async function engineAnswer<Answer>(origin: string, pending: Promise<Answer>): Promise<Answer> {
  const result = await safe(pending)
  if (result.isSuccess) return result.data
  if (offline(result.error, 0)) throw offlineFailure(origin)
  if (rejectedByServer(result.error)) throw rpcFailure(result.error)
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

function rejectedByServer(error: unknown): error is ORPCError<string, unknown> {
  if (!(error instanceof ORPCError)) return false
  const status = ENGINE_ERROR_STATUS[error.code]
  return error.defined || error.code === APPROVAL_DENIED || (status !== undefined && status >= 400 && status < 500)
}

function rpcFailure(error: ORPCError<string, unknown>): Error {
  const plugin = PLUGIN_RPC_CODES.includes(error.code) ? PluginFailureSchema.safeParse(error.data) : null
  if (plugin === null || !plugin.success) return userFailure(error.message, {code: error.code})
  return userFailure(error.message, {code: error.code, type: plugin.data.type, data: plugin.data.data})
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
  if (link.data.code !== undefined && OFFLINE_CODES.includes(link.data.code)) return true
  if (link.data.message === 'fetch failed') return true
  return offline(link.data.cause, depth + 1)
}
