import {chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {isNull, eq, max} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import envPaths from 'env-paths'
import {z} from 'zod'
import {homeMigrations} from './home-migrations.gen.js'
import {engines, hubConnections as hubConnectionsTable, hubRevocations} from './home-schema.js'

const ConcivHomeSchema = z.string().min(1).optional().catch(undefined)

export type HomeDb = ReturnType<typeof drizzle>

export type EngineRow = {id: string; pid: number; root: string; apiBase: string}

export function concivHome(options: {homeDir?: string; env: NodeJS.ProcessEnv}): string {
  return options.homeDir ?? ConcivHomeSchema.parse(options.env['CONCIV_HOME']) ?? envPaths('conciv', {suffix: ''}).data
}

export function openHomeDb(home: string): HomeDb {
  prepareFolder(home)
  const file = join(home, 'home.db')
  closeSync(openSync(file, 'a', 0o600))
  chmodSync(file, 0o600)
  const client = new DatabaseSync(file, {timeout: 5000})
  const db = drizzle({client})
  try {
    migrate(db)
  } catch {
    retryMigrate(db)
  }
  return db
}

export function closeHomeDb(db: HomeDb): void {
  db.$client.close()
}

export function withHomeDb<T>(home: string, run: (db: HomeDb) => T): T {
  const db = openHomeDb(home)
  try {
    return run(db)
  } finally {
    closeHomeDb(db)
  }
}

export function readHomeDb<T>(home: string, run: (db: HomeDb) => T): T | null {
  if (!existsSync(join(home, 'home.db'))) return null
  return withHomeDb(home, run)
}

export function registerEngine(db: HomeDb, row: EngineRow): void {
  db.insert(engines).values(row).onConflictDoUpdate({target: engines.id, set: row}).run()
}

export function retireEngine(db: HomeDb, id: string, now: number): void {
  db.update(engines).set({deletedAt: now}).where(eq(engines.id, id)).run()
}

export function listEngines(db: HomeDb): EngineRow[] {
  return db
    .select({id: engines.id, pid: engines.pid, root: engines.root, apiBase: engines.apiBase})
    .from(engines)
    .where(isNull(engines.deletedAt))
    .all()
}

export function recordHubConnection(
  db: HomeDb,
  harness: string,
  now: number,
  revokedBefore = Number.POSITIVE_INFINITY,
): boolean {
  return db.transaction((tx) => {
    const revokedAt =
      tx
        .select({revokedAt: max(hubRevocations.revokedAt)})
        .from(hubRevocations)
        .get()?.revokedAt ?? 0
    if (revokedAt > revokedBefore) return false
    tx.insert(hubConnectionsTable).values({harness, connectedAt: now}).onConflictDoNothing().run()
    return true
  })
}

export function removeHubConnection(db: HomeDb, harness: string): void {
  db.transaction((tx) => {
    tx.delete(hubConnectionsTable).where(eq(hubConnectionsTable.harness, harness)).run()
    tx.insert(hubRevocations).values({revokedAt: Date.now()}).onConflictDoNothing().run()
  })
}

export function lastHubRevocation(db: HomeDb): number {
  return (
    db
      .select({revokedAt: max(hubRevocations.revokedAt)})
      .from(hubRevocations)
      .get()?.revokedAt ?? 0
  )
}

export function hubConnections(db: HomeDb): Array<{harness: string; connectedAt: number}> {
  return db
    .select({harness: hubConnectionsTable.harness, connectedAt: hubConnectionsTable.connectedAt})
    .from(hubConnectionsTable)
    .orderBy(hubConnectionsTable.harness)
    .all()
}

export function isHomeFolderRefused(error: unknown): error is Error {
  return error instanceof Error && error.name === 'HomeFolderRefused'
}

function prepareFolder(home: string): void {
  const stats = lstatSync(home, {throwIfNoEntry: false})
  if (stats === undefined) {
    mkdirSync(home, {recursive: true, mode: 0o700})
    return
  }
  if (stats.isSymbolicLink()) throw homeFolderRefused(home, 'it is a symbolic link')
  if (!stats.isDirectory()) throw homeFolderRefused(home, 'it is not a directory')
  const uid = process.getuid?.()
  if (uid !== undefined && stats.uid !== uid) throw homeFolderRefused(home, `it is owned by uid ${stats.uid}`)
  chmodSync(home, 0o700)
}

function homeFolderRefused(home: string, reason: string): Error {
  return Object.assign(new Error(`conciv refuses the home folder ${home}: ${reason}`), {name: 'HomeFolderRefused'})
}

function migrate(db: HomeDb): void {
  db.$client.exec('PRAGMA journal_mode = WAL')
  migrateSync(homeMigrations, db._.session)
}

function retryMigrate(db: HomeDb): void {
  try {
    migrate(db)
  } catch (error) {
    closeHomeDb(db)
    throw error
  }
}
