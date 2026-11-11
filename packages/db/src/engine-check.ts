import {existsSync} from 'node:fs'
import {z} from 'zod'
import {listEngines, retireEngine, withHomeDb, type EngineRow} from './home-db.js'

const HealthSchema = z.object({ok: z.literal(true), id: z.string()})
const RefusedSchema = z.object({cause: z.object({code: z.literal('ECONNREFUSED')})})
const SignalErrorSchema = z.object({code: z.enum(['ESRCH', 'EPERM'])})
const CWD_GONE = /uv_cwd|ENOENT[^\n]*cwd/

type Verdict = {row: EngineRow; kind: 'live' | 'retire'} | {row: EngineRow; kind: 'unreachable'; error: string}

export async function checkEngines(
  home: string,
  options: {timeoutMs: number},
): Promise<{live: EngineRow[]; unreachable: Array<{root: string; error: string}>}> {
  const rows = withHomeDb(home, listEngines)
  const verdicts = await Promise.all(rows.map((row) => probe(row, options.timeoutMs)))
  const retired = verdicts.filter((verdict) => verdict.kind === 'retire')
  if (retired.length > 0) {
    const now = Date.now()
    withHomeDb(home, (db) => retired.forEach((verdict) => retireEngine(db, verdict.row.id, now)))
  }
  return {
    live: verdicts.filter((verdict) => verdict.kind === 'live').map((verdict) => verdict.row),
    unreachable: verdicts.flatMap((verdict) =>
      verdict.kind === 'unreachable' ? [{root: verdict.row.root, error: verdict.error}] : [],
    ),
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const signalled = SignalErrorSchema.safeParse(error)
    if (!signalled.success) throw error
    return signalled.data.code === 'EPERM'
  }
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

function healthVerdict(row: EngineRow, status: number, text: string): Verdict {
  if (CWD_GONE.test(text)) return {row, kind: 'retire'}
  const health = HealthSchema.safeParse(parsedJson(text))
  if (!health.success) return {row, kind: 'unreachable', error: `/health answered HTTP ${status} without an engine id`}
  return {row, kind: health.data.id === row.id ? 'live' : 'retire'}
}

async function probe(row: EngineRow, timeoutMs: number): Promise<Verdict> {
  const origin = URL.parse(row.apiBase)?.origin
  if (origin === undefined || !processAlive(row.pid) || !existsSync(row.root)) return {row, kind: 'retire'}
  try {
    const response = await fetch(`${origin}/health`, {signal: AbortSignal.timeout(timeoutMs)})
    return healthVerdict(row, response.status, await response.text())
  } catch (error) {
    if (RefusedSchema.safeParse(error).success) return {row, kind: 'retire'}
    return {row, kind: 'unreachable', error: error instanceof Error ? error.message : String(error)}
  }
}
