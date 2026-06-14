import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import type {ZodType} from 'zod'

// Read a file's UTF-8 contents, or '' if it doesn't exist / can't be read.
export function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

// Read + Zod-validate a JSON file; any failure (missing/unparseable/invalid) yields the fallback.
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

// Write text to a file, creating its parent directory first.
export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(path, text)
}

// Write a value as JSON, creating its parent directory first.
export function writeJson(path: string, value: unknown): void {
  writeText(path, JSON.stringify(value))
}
