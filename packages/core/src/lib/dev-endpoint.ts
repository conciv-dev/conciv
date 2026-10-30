import {randomUUID} from 'node:crypto'
import {chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'
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

export function writePrivateFile(path: string, contents: string): void {
  mkdirSync(dirname(path), {recursive: true})
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(tempPath, contents, {mode: FILE_MODE})
    chmodSync(tempPath, FILE_MODE)
    renameSync(tempPath, path)
  } catch (error) {
    rmSync(tempPath, {force: true})
    throw error
  }
}

export function writeDevEndpoint(dir: string, endpoint: DevEndpoint): void {
  writePrivateFile(endpointPath(dir), JSON.stringify(DevEndpointSchema.parse(endpoint)))
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
