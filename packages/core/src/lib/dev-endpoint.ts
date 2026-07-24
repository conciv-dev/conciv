import {chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {z} from 'zod'

const FILE_NAME = 'dev-endpoint.json'
const FILE_MODE = 0o600

export const DevEndpointSchema = z.object({
  apiBase: z.string().min(1),
  token: z.string().nullable(),
  pid: z.number().int().positive(),
})

export type DevEndpoint = z.infer<typeof DevEndpointSchema>

export function defaultDevEndpointDir(): string {
  return join(homedir(), '.conciv')
}

function endpointPath(dir: string): string {
  return join(dir, FILE_NAME)
}

export function writeDevEndpoint(dir: string, endpoint: DevEndpoint): void {
  const validated = DevEndpointSchema.parse(endpoint)
  mkdirSync(dir, {recursive: true})
  const path = endpointPath(dir)
  writeFileSync(path, JSON.stringify(validated), {mode: FILE_MODE})
  chmodSync(path, FILE_MODE)
}

export function readDevEndpoint(dir: string): DevEndpoint | null {
  try {
    const raw = readFileSync(endpointPath(dir), 'utf8')
    const parsed = DevEndpointSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function removeDevEndpoint(dir: string, pid: number): void {
  const current = readDevEndpoint(dir)
  if (current && current.pid !== pid) return
  rmSync(endpointPath(dir), {force: true})
}
