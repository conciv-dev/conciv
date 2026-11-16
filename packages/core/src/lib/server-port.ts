import {readFileSync, rmSync} from 'node:fs'
import {z} from 'zod'
import {writePrivateFile} from './dev-endpoint.js'

const serverStateSchema = z.object({port: z.number().int().min(1).max(65535)})

export function readPersistedPort(file: string): number | undefined {
  try {
    const parsed = serverStateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    return parsed.success ? parsed.data.port : undefined
  } catch {
    return undefined
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return z.object({code: z.literal(code)}).safeParse(error).success
}

function readOptionalText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return undefined
    throw error
  }
}

export function writePersistedPort(file: string, state: {port: number; token: string}): () => void {
  const previous = readOptionalText(file)
  const written = `${JSON.stringify(state, null, 2)}\n`
  writePrivateFile(file, written)
  return () => {
    if (readOptionalText(file) !== written) return
    if (previous === undefined) rmSync(file, {force: true})
    else writePrivateFile(file, previous)
  }
}

export function isAddressInUse(error: unknown): boolean {
  return hasErrorCode(error, 'EADDRINUSE')
}
