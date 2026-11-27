import {log} from 'evlog'
import {z} from 'zod'
import {readSessionStorage} from './session-storage'

const LEAVING_COPY_PREFIX = 'conciv-draft-leaving:'

const LeavingCopySchema = z
  .string()
  .transform((raw, context): unknown => {
    try {
      return JSON.parse(raw)
    } catch {
      context.addIssue({code: 'custom', message: 'the leaving copy is not JSON'})
      return z.NEVER
    }
  })
  .pipe(z.object({stamp: z.number(), draft: z.unknown()}))

export type LeavingCopy<T> = {stamp: number; draft: T}

function leavingKey(name: string): string {
  return `${LEAVING_COPY_PREFIX}${name}`
}

export function keepLeavingCopy(name: string, draft: unknown): void {
  try {
    readSessionStorage()?.setItem(leavingKey(name), JSON.stringify({stamp: Date.now(), draft}))
  } catch (error) {
    log.error({action: 'persistence', message: 'could not keep the leaving copy of a draft', name, error})
  }
}

export function dropLeavingCopy(name: string): void {
  try {
    readSessionStorage()?.removeItem(leavingKey(name))
  } catch (error) {
    log.error({action: 'persistence', message: 'could not drop the leaving copy of a draft', name, error})
  }
}

function readRawCopy(name: string): string | null {
  try {
    return readSessionStorage()?.getItem(leavingKey(name)) ?? null
  } catch (error) {
    log.error({action: 'persistence', message: 'could not read the leaving copy of a draft', name, error})
    return null
  }
}

export function readLeavingCopy<T>(name: string, schema: z.ZodType<T>): LeavingCopy<T> | undefined {
  const raw = readRawCopy(name)
  if (raw === null) return undefined
  const parsed = LeavingCopySchema.pipe(z.object({stamp: z.number(), draft: schema})).safeParse(raw)
  if (parsed.success) return parsed.data
  log.error({
    action: 'persistence',
    message: 'the leaving copy of a draft is not a draft, dropped',
    name,
    error: parsed.error,
  })
  dropLeavingCopy(name)
  return undefined
}

export function settleLeavingCopy(name: string, writtenAt: number): void {
  const raw = readRawCopy(name)
  if (raw === null) return
  const parsed = LeavingCopySchema.safeParse(raw)
  if (parsed.success && parsed.data.stamp >= writtenAt) return
  dropLeavingCopy(name)
}

export function dropLeavingCopies(): void {
  try {
    const storage = readSessionStorage()
    if (!storage) return
    Array.from({length: storage.length}, (_, index) => storage.key(index))
      .filter((key): key is string => key?.startsWith(LEAVING_COPY_PREFIX) ?? false)
      .forEach((key) => storage.removeItem(key))
  } catch (error) {
    log.error({action: 'persistence', message: 'could not drop the leaving copies of the drafts', error})
  }
}
