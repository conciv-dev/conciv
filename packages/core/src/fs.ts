import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import type {ZodType} from 'zod'

export function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

export function readJson<T>(path: string, schema: ZodType<T>, fallback: T): T {
  const raw = readFileOrEmpty(path)
  if (!raw) return fallback
  try {
    const result = schema.safeParse(JSON.parse(raw))
    return result.success ? result.data : fallback
  } catch {
    return fallback
  }
}

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(path, text)
}

export function writeJson(path: string, value: unknown): void {
  writeText(path, JSON.stringify(value))
}
