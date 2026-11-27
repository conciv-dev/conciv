import {ORPCError, safe} from '@orpc/client'
import {z} from 'zod'
import {
  CONCIV_CLIENT_HEADER,
  CONCIV_ORIGIN_HEADER,
  CONCIV_SESSION_HEADER,
  isSessionId,
  type SessionId,
} from '@conciv/types/chat-types'
import {makeRpcClient, type EngineClient} from '@conciv/client'
import {contractCode, ENGINE_ERROR_STATUS, ErrorDetailSchema} from '@conciv/protocol'
import {initContributions} from '@conciv/harness/init/registry'
import {INIT_HARNESS_IDS} from '@conciv/types/harness-types'
import type {CliOutcome} from './envelope.js'
import {engineOrigin} from './engine-origin.js'
import {cliErrors, engineErrors} from '@conciv/errors'

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

const PLUGIN_RPC_CODES: readonly string[] = [
  contractCode(engineErrors.PLUGIN_RPC),
  contractCode(engineErrors.PLUGIN_RPC_INTERNAL),
]

const PluginFailureSchema = z.object({type: z.string(), data: z.unknown().optional()})

function declaredSessionId(): SessionId | null {
  const raw = process.env.CONCIV_SESSION_ID?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) {
    throw cliErrors.SESSION_ID_INVALID({raw})
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
  const hub = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: callingAgent(process.env)}
  return call(
    makeRpcClient(engine.origin, {token: engine.token, headers: engine.outside ? {...session, ...hub} : session}),
    id,
  )
}

export async function engineAnswer<Answer>(origin: string, pending: Promise<Answer>): Promise<Answer> {
  const result = await safe(pending)
  if (result.isSuccess) return result.data
  if (rejectedByServer(result.error)) throw rpcFailure(result.error)
  if (offline(result.error, 0)) throw offlineFailure(origin)
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
  return error.defined || clientError(ENGINE_ERROR_STATUS[error.code])
}

function clientError(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500
}

function rpcFields(error: ORPCError<string, unknown>): {code: string; type?: string; data?: unknown} {
  if (!PLUGIN_RPC_CODES.includes(error.code)) return {code: error.code}
  const plugin = PluginFailureSchema.safeParse(error.data)
  return plugin.success ? {code: error.code, type: plugin.data.type, data: plugin.data.data} : {code: error.code}
}

function rpcFailure(error: ORPCError<string, unknown>): Error {
  const fix = ErrorDetailSchema.safeParse(error.data).data?.fix
  return cliErrors.RPC_REJECTED({message: error.message, fix, internal: rpcFields(error), cause: error})
}

function offlineFailure(origin: string): Error {
  return cliErrors.OFFLINE({host: new URL(origin).host})
}

function offline(error: unknown, depth: number): boolean {
  if (depth > MAX_CAUSE_DEPTH) return false
  const link = LinkSchema.safeParse(error)
  if (!link.success) return false
  if (link.data.code !== undefined && OFFLINE_CODES.includes(link.data.code)) return true
  if (link.data.message === 'fetch failed') return true
  return offline(link.data.cause, depth + 1)
}
