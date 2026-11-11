import {safe, toORPCError, type ORPCError} from '@orpc/client'
import {z} from 'zod'
import {
  CONCIV_CLAUDE_SESSION_HEADER,
  CONCIV_CLIENT_HEADER,
  CONCIV_ORIGIN_HEADER,
  CONCIV_SESSION_HEADER,
  isSessionId,
  TabsSchema,
  type SessionId,
} from '@conciv/protocol/chat-types'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {concivHome, existingDb, listEngines, readCatalog, withHomeDb} from '@conciv/db'
import {initContributions} from '@conciv/harness-init/registry'
import {INIT_HARNESS_IDS, type InitHarnessId} from '@conciv/protocol/harness-types'
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

const INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'

const HintSchema = z.object({hint: z.string()})

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
  const resolved = (await oneOpenTab(origin)) ?? (await makeRpcClient(origin).sessions.resolve({})).sessionId
  processSession.id = resolved
  return resolved
}

async function oneOpenTab(origin: string): Promise<SessionId | null> {
  const response = await fetch(`${origin}/api/tabs`)
  if (!response.ok) return null
  const listed = TabsSchema.safeParse(await response.json())
  if (!listed.success) return null
  const [only, second] = listed.data.tabs
  return only !== undefined && second === undefined ? only.sessionId : null
}

export type CliTarget = {tab: SessionId | null; home?: string}

type RpcCall = (rpc: RpcClient) => Promise<unknown>

type EngineOrigin = Awaited<ReturnType<typeof engineOrigin>>

async function withSession(engine: EngineOrigin, target: CliTarget, call: RpcCall): Promise<unknown> {
  const agent = callingAgent(process.env)
  const session = {
    [CONCIV_SESSION_HEADER]: target.tab ?? (await sessionId(engine.origin)),
    ...harnessSession(agent, process.env),
  }
  const hub = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: agent}
  return call(makeRpcClient(engine.origin, {headers: engine.outside ? {...session, ...hub} : session}))
}

async function servedOutcome(engine: EngineOrigin, target: CliTarget, call: RpcCall): Promise<CliOutcome | null> {
  const result = await safe(withSession(engine, target, call))
  if (result.isSuccess) return {report: 'json', data: result.data}
  if (result.isDefined) throw rpcFailure(toORPCError(result.error))
  if (offline(result.error, 0)) return null
  if (rejectedByServer(result.error)) throw rpcFailure(toORPCError(result.error))
  throw result.error
}

export async function runRpc(target: CliTarget, call: RpcCall): Promise<CliOutcome> {
  const engine =
    target.home === undefined ? await engineOrigin(process.cwd(), process.env, target.tab) : homeEngine(target.home)
  const outcome = await servedOutcome(engine, target, call)
  if (outcome === null) throw offlineFailure(engine.origin)
  return outcome
}

function homeEngine(extension: string): EngineOrigin {
  const owner = withHomeDb(concivHome({env: process.env}), listEngines).find((row) =>
    loads({root: row.root, extension}),
  )
  if (owner === undefined)
    throw userFailure(`No running conciv dev server loads the ${extension} extension.`, {
      hint: `Start an app whose conciv config loads ${extension}; its engine registers in the conciv home.`,
    })
  return {origin: owner.apiBase, outside: false}
}

function loads(input: {root: string; extension: string}): boolean {
  try {
    return readCatalog(existingDb({stateRoot: input.root})).commands.some(
      (entry) => entry.extension === input.extension,
    )
  } catch {
    return false
  }
}

function callingAgent(env: NodeJS.ProcessEnv): InitHarnessId | typeof TERMINAL_CLIENT {
  const shellEnv = (id: InitHarnessId) => initContributions[id].hub?.shellEnv
  return (
    INIT_HARNESS_IDS.find((id) => {
      const variable = shellEnv(id)
      return variable !== undefined && Boolean(env[variable])
    }) ?? TERMINAL_CLIENT
  )
}

function harnessSession(agent: InitHarnessId | typeof TERMINAL_CLIENT, env: NodeJS.ProcessEnv): Record<string, string> {
  if (agent === TERMINAL_CLIENT) return {}
  const variable = initContributions[agent].hub?.sessionEnv
  const value = variable === undefined ? undefined : env[variable]?.trim()
  return value ? {[CONCIV_CLAUDE_SESSION_HEADER]: value} : {}
}

function rejectedByServer(error: unknown): boolean {
  const remote = RemoteSchema.safeParse(error)
  return remote.success && remote.data.code !== INTERNAL_SERVER_ERROR
}

function rpcFailure(error: ORPCError<string, unknown>): Error {
  const hint = HintSchema.safeParse(error.data).data?.hint
  return userFailure(error.message, {code: error.code, ...(hint === undefined ? {} : {hint})})
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
