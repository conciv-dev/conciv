import {safe, toORPCError, type ORPCError} from '@orpc/client'
import {z} from 'zod'
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

function defaultOrigin(): string {
  const port = process.env.CONCIV_PORT ?? '5173'
  return `http://127.0.0.1:${port}`
}

export async function runRpc(call: (rpc: RpcClient) => Promise<unknown>): Promise<CliOutcome> {
  const origin = defaultOrigin()
  const result = await safe(call(makeRpcClient(origin)))
  if (result.isSuccess) return {report: 'json', data: result.data}
  if (result.isDefined) throw definedFailure(toORPCError(result.error))
  if (offline(result.error, 0)) throw offlineFailure(origin)
  throw result.error
}

function definedFailure(error: ORPCError<string, unknown>): Error {
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
