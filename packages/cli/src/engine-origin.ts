import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {concivStateDir} from '@conciv/protocol/state-types'

const DEFAULT_ENGINE_PORT = '5173'

const ServerStateSchema = z.object({port: z.number().int().min(1).max(65535)})
const EndpointSchema = z.object({token: z.string().min(1)})

function recorded<Shape>(directory: string, file: string, schema: z.ZodType<Shape>): Shape | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(join(concivStateDir(directory), file), 'utf8')))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function discovered<Shape>(directory: string, file: string, schema: z.ZodType<Shape>): Shape | undefined {
  const found = recorded(directory, file, schema)
  if (found !== undefined) return found
  const parent = dirname(directory)
  if (parent === directory) return undefined
  return discovered(parent, file, schema)
}

export function engineOrigin(cwd: string, env: NodeJS.ProcessEnv): string {
  const port = env.CONCIV_PORT ?? discovered(cwd, 'server.json', ServerStateSchema)?.port ?? DEFAULT_ENGINE_PORT
  const token = env.CONCIV_TOKEN ?? discovered(cwd, 'mcp-endpoint.json', EndpointSchema)?.token
  const origin = `http://127.0.0.1:${port}`
  return token === undefined ? origin : `${origin}/t/${token}`
}
