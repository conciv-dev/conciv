import {readFileSync} from 'node:fs'
import {z} from 'zod'
import {writeText} from './fs.js'

const serverStateSchema = z.object({port: z.number().int().min(1).max(65535)})

export function readPersistedPort(file: string): number | undefined {
  try {
    const parsed = serverStateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    return parsed.success ? parsed.data.port : undefined
  } catch {
    return undefined
  }
}

export function writePersistedPort(file: string, port: number): void {
  writeText(file, `${JSON.stringify({port}, null, 2)}\n`)
}

export function isAddressInUse(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE'
}
