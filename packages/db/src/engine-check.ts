import {z} from 'zod'
import {listEngines, retireEngine, withHomeDb, type EngineRow} from './home-db.js'

const HealthSchema = z.object({ok: z.literal(true), id: z.string()})
const RefusedSchema = z.object({cause: z.object({code: z.literal('ECONNREFUSED')})})

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

async function probe(row: EngineRow, timeoutMs: number): Promise<Verdict> {
  const origin = URL.parse(row.apiBase)?.origin
  if (origin === undefined) return {row, kind: 'retire'}
  try {
    const response = await fetch(`${origin}/health`, {signal: AbortSignal.timeout(timeoutMs)})
    const health = HealthSchema.safeParse(await response.json().catch(() => null))
    return {row, kind: health.success && health.data.id === row.id ? 'live' : 'retire'}
  } catch (error) {
    if (RefusedSchema.safeParse(error).success) return {row, kind: 'retire'}
    return {row, kind: 'unreachable', error: error instanceof Error ? error.message : String(error)}
  }
}
