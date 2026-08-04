import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import type {HarnessId} from '../../harness-detect.js'

const consentSchema = z.object({harnesses: z.array(z.enum(['claude', 'codex', 'opencode', 'pi']))})

export function consentFile(cwd: string): string {
  return join(cwd, '.conciv', 'harnesses.json')
}

export function readConsent(cwd: string): HarnessId[] {
  const raw = readFileOrNull(consentFile(cwd))
  if (raw === null) return []
  const parsed = consentSchema.safeParse(parseJsonOrNull(raw))
  if (!parsed.success) return []
  return parsed.data.harnesses
}

export function writeConsent(cwd: string, ids: HarnessId[]): void {
  mkdirSync(join(cwd, '.conciv'), {recursive: true})
  writeFileSync(consentFile(cwd), `${JSON.stringify({harnesses: ids}, null, 2)}\n`)
}

function readFileOrNull(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function parseJsonOrNull(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
