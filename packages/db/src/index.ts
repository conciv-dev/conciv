export * from './db.js'
export * from './run-migrations.js'
export * from './run-schema.js'
export * from './schema.js'
export {migrations} from './migrations.gen.js'
export * from './home-db.js'
import {eq} from 'drizzle-orm'
import {Effect} from 'effect'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'
import {access} from 'node:fs/promises'
import {z} from 'zod'
import {listEngines, prepareHome, retireEngine, withHomeDb, type EngineRow} from './home-db.js'

const HealthSchema = z.object({ok: z.literal(true), id: z.string()})
const RefusedSchema = z.object({cause: z.object({code: z.literal('ECONNREFUSED')})})
const SignalErrorSchema = z.object({code: z.enum(['ESRCH', 'EPERM'])})

type Verdict = {row: EngineRow; kind: 'live' | 'retire'} | {row: EngineRow; kind: 'unreachable'; error: string}

export async function checkEngines(
  home: string,
  options: {timeoutMs: number; roots?: string[]},
): Promise<{live: EngineRow[]; unreachable: Array<{root: string; error: string}>}> {
  const prepared = await prepareHome(home)
  const listed = withHomeDb(prepared, listEngines)
  const roots = options.roots
  const rows = roots === undefined ? listed : listed.filter((row) => roots.includes(row.root))
  const verdicts = await Promise.all(rows.map((row) => probe(row, options.timeoutMs)))
  const retired = verdicts.filter((verdict) => verdict.kind === 'retire')
  if (retired.length > 0) {
    const now = Date.now()
    withHomeDb(prepared, (db) => retired.forEach((verdict) => retireEngine(db, verdict.row.id, now)))
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
  const health = HealthSchema.safeParse(parsedJson(text))
  if (!health.success) return {row, kind: 'unreachable', error: `/health answered HTTP ${status} without an engine id`}
  return {row, kind: health.data.id === row.id ? 'live' : 'retire'}
}

function rootExists(root: string): Promise<boolean> {
  return access(root).then(
    () => true,
    () => false,
  )
}

async function probe(row: EngineRow, timeoutMs: number): Promise<Verdict> {
  const origin = URL.parse(row.apiBase)?.origin
  if (origin === undefined || !processAlive(row.pid) || !(await rootExists(row.root))) return {row, kind: 'retire'}
  try {
    const response = await fetch(`${origin}/health`, {signal: AbortSignal.timeout(timeoutMs)})
    return healthVerdict(row, response.status, await response.text())
  } catch (error) {
    if (RefusedSchema.safeParse(error).success) return {row, kind: 'retire'}
    return {row, kind: 'unreachable', error: error instanceof Error ? error.message : String(error)}
  }
}

export async function readModel(db: ConcivDb, id: string): Promise<string | null> {
  const rows = await Effect.runPromise(db.select({model: sessions.model}).from(sessions).where(eq(sessions.id, id)))
  return rows[0]?.model ?? null
}
