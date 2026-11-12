import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {checkEngines, concivHome, type EngineRow} from '@conciv/db'
import {makeRpcClient} from '@conciv/contract'
import type {SessionId} from '@conciv/protocol/chat-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {userFailure} from './failure.js'

const DEFAULT_ENGINE_PORT = '5173'

const PROBE_MS = 300

const ServerStateSchema = z.object({
  port: z.number().int().min(1).max(65535),
  token: z.string().min(1).optional(),
})

type ServerState = z.infer<typeof ServerStateSchema> & {stateDir: string}

function recordedState(directory: string): ServerState | undefined {
  const stateDir = concivStateDir(directory)
  try {
    const parsed = ServerStateSchema.safeParse(JSON.parse(readFileSync(join(stateDir, 'server.json'), 'utf8')))
    return parsed.success ? {...parsed.data, stateDir} : undefined
  } catch {
    return undefined
  }
}

export function discoveredEngine(directory: string): ServerState | undefined {
  const state = recordedState(directory)
  if (state !== undefined) return state
  const parent = dirname(directory)
  if (parent === directory) return undefined
  return discoveredEngine(parent)
}

type EngineOrigin = {origin: string; chosen: boolean}

export async function engineOrigin(cwd: string, env: NodeJS.ProcessEnv, tab: SessionId | null): Promise<EngineOrigin> {
  if (tab !== null) return {origin: await tabOwner(await liveEngines(env), tab), chosen: true}
  const discovered = discoveredEngine(cwd)
  const port = env.CONCIV_PORT ?? discovered?.port
  const token = env.CONCIV_TOKEN ?? discovered?.token
  if (port !== undefined) return {origin: scopedOrigin(port, token), chosen: true}
  const latest = (await liveEngines(env)).at(-1)
  if (latest === undefined) return {origin: scopedOrigin(DEFAULT_ENGINE_PORT, token), chosen: true}
  return {origin: latest.apiBase, chosen: false}
}

export function scopedOrigin(port: string | number, token: string | undefined): string {
  const origin = `http://127.0.0.1:${port}`
  return token === undefined ? origin : `${origin}/t/${token}`
}

async function liveEngines(env: NodeJS.ProcessEnv): Promise<EngineRow[]> {
  return (await checkEngines(concivHome({env}), {timeoutMs: PROBE_MS})).live
}

async function tabOwner(live: EngineRow[], tab: SessionId): Promise<string> {
  const answers = await Promise.allSettled(live.map((row) => holdsTab(row, tab)))
  const owners = live.filter((_row, index) => {
    const answer = answers[index]
    return answer?.status === 'fulfilled' && answer.value
  })
  const [owner, ...others] = owners
  if (owner !== undefined && others.length === 0) return owner.apiBase
  if (owner !== undefined) {
    const roots = owners.map((row) => row.root).join(', ')
    throw userFailure(`tab ${tab} is open in ${owners.length} running conciv dev servers: ${roots}.`, {
      hint: 'stop all but one of them, or reload the page so only one server holds the tab.',
    })
  }
  const silent = answers.filter((answer) => answer.status === 'rejected').length
  const unanswered = silent === 0 ? '' : ` (${silent} of them did not answer)`
  throw userFailure(`tab ${tab} is not open in any of the ${live.length} running conciv dev servers${unanswered}.`, {
    hint: 'conciv tools tabs lists the open tabs; open the page again if it was closed.',
  })
}

async function holdsTab(row: EngineRow, tab: SessionId): Promise<boolean> {
  return (await makeRpcClient(row.apiBase).tabs.get({sessionId: tab}, {signal: AbortSignal.timeout(PROBE_MS)})).open
}
