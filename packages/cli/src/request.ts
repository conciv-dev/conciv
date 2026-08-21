import {safe, toORPCError, type ORPCError} from '@orpc/client'
import {z} from 'zod'
import {CONCIV_SESSION_HEADER, isSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import type {CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'

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

const LinkSchema = z.object({code: z.string().optional(), message: z.string().optional(), cause: z.unknown()})

const RemoteSchema = z.object({status: z.number(), code: z.string()})

function defaultOrigin(): string {
  const port = process.env.CONCIV_PORT ?? '5173'
  return `http://127.0.0.1:${port}`
}

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

async function withSession(origin: string, call: (rpc: RpcClient) => Promise<unknown>): Promise<unknown> {
  const headers = {[CONCIV_SESSION_HEADER]: await sessionId(origin)}
  return call(makeRpcClient(origin, {headers}))
}

export async function runRpc(call: (rpc: RpcClient) => Promise<unknown>): Promise<CliOutcome> {
  const origin = defaultOrigin()
  const result = await safe(withSession(origin, call))
  if (result.isSuccess) return {report: 'json', data: result.data}
  if (result.isDefined) throw rpcFailure(toORPCError(result.error))
  if (offline(result.error, 0)) throw offlineFailure(origin)
  if (rejectedByServer(result.error)) throw rpcFailure(toORPCError(result.error))
  throw result.error
}

function rejectedByServer(error: unknown): boolean {
  const remote = RemoteSchema.safeParse(error)
  return remote.success && remote.data.status >= 400 && remote.data.status < 500
}

function rpcFailure(error: ORPCError<string, unknown>): Error {
  return userFailure(error.message, {code: error.code})
}

function offlineFailure(origin: string): Error {
  return userFailure(`No conciv dev server on ${new URL(origin).host}.`, {
    hint: 'Start your app (pnpm dev), or point conciv at it with CONCIV_PORT=<port>.',
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
