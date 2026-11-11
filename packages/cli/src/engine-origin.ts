import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {checkEngines, concivHome, type EngineRow} from '@conciv/db'
import {createOutsideTabs} from '@conciv/core/outside-tabs'
import type {SessionId} from '@conciv/protocol/chat-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {userFailure} from './failure.js'

const DEFAULT_ENGINE_PORT = '5173'

const PROBE_MS = 2000

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

type EngineOrigin = {origin: string; outside: boolean}

export async function engineOrigin(cwd: string, env: NodeJS.ProcessEnv, tab: SessionId | null): Promise<EngineOrigin> {
  if (tab !== null) return {origin: await tabOwner(env, tab), outside: true}
  const discovered = discoveredEngine(cwd)
  const port = env.CONCIV_PORT ?? discovered?.port
  const token = env.CONCIV_TOKEN ?? discovered?.token
  if (port !== undefined) return {origin: scopedOrigin(port, token), outside: false}
  const latest = (await liveEngines(env)).at(-1)
  if (latest === undefined) return {origin: scopedOrigin(DEFAULT_ENGINE_PORT, token), outside: false}
  return {origin: latest.apiBase, outside: true}
}

function scopedOrigin(port: string | number, token: string | undefined): string {
  const origin = `http://127.0.0.1:${port}`
  return token === undefined ? origin : `${origin}/t/${token}`
}

async function liveEngines(env: NodeJS.ProcessEnv): Promise<EngineRow[]> {
  return (await checkEngines(concivHome({env}), {timeoutMs: PROBE_MS})).live
}

async function tabOwner(env: NodeJS.ProcessEnv, tab: SessionId): Promise<string> {
  const owned = await createOutsideTabs(concivHome({env}))
    .find(tab)
    .catch((error: unknown) => {
      throw userFailure(error instanceof Error ? error.message : String(error), {
        hint: 'pass --tab with the tab open for your project, or close all but one browser tab that holds it; conciv tools tabs lists the open tabs.',
      })
    })
  return owned.apiBase
}
