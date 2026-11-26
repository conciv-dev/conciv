import {randomUUID} from 'node:crypto'
import {chmod, mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
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

export async function writePrivateFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), {recursive: true})
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(tempPath, contents, {mode: FILE_MODE})
    await chmod(tempPath, FILE_MODE)
    await rename(tempPath, path)
  } catch (error) {
    await rm(tempPath, {force: true})
    throw error
  }
}

export async function writeDevEndpoint(dir: string, endpoint: DevEndpoint): Promise<void> {
  await writePrivateFile(endpointPath(dir), JSON.stringify(DevEndpointSchema.parse(endpoint)))
}

export async function readDevEndpoint(dir: string): Promise<DevEndpoint | null> {
  try {
    const raw = await readFile(endpointPath(dir), 'utf8')
    const parsed = DevEndpointSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function removeDevEndpoint(dir: string, pid: number): Promise<void> {
  const current = await readDevEndpoint(dir)
  if (current && current.pid !== pid) return
  await rm(endpointPath(dir), {force: true})
}
