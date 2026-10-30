import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {concivStateDir} from '@conciv/protocol/state-types'

const DEFAULT_ENGINE_PORT = '5173'

const ServerStateSchema = z.object({port: z.number().int().min(1).max(65535)})

function recordedPort(directory: string): number | undefined {
  try {
    const parsed = ServerStateSchema.safeParse(
      JSON.parse(readFileSync(join(concivStateDir(directory), 'server.json'), 'utf8')),
    )
    return parsed.success ? parsed.data.port : undefined
  } catch {
    return undefined
  }
}

function discoveredPort(directory: string): number | undefined {
  const port = recordedPort(directory)
  if (port !== undefined) return port
  const parent = dirname(directory)
  if (parent === directory) return undefined
  return discoveredPort(parent)
}

export function engineOrigin(cwd: string, env: NodeJS.ProcessEnv): string {
  const port = env.CONCIV_PORT ?? discoveredPort(cwd) ?? DEFAULT_ENGINE_PORT
  return `http://127.0.0.1:${port}`
}
