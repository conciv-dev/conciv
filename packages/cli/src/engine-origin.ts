import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {concivStateDir} from '@conciv/protocol/state-types'

const DEFAULT_ENGINE_PORT = '5173'

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

export function engineOrigin(cwd: string, env: NodeJS.ProcessEnv): string {
  const discovered = discoveredEngine(cwd)
  const port = env.CONCIV_PORT ?? discovered?.port ?? DEFAULT_ENGINE_PORT
  const token = env.CONCIV_TOKEN ?? discovered?.token
  const origin = `http://127.0.0.1:${port}`
  return token === undefined ? origin : `${origin}/t/${token}`
}
