import {chmod, lstat, mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {and, eq, isNull, max, sql} from 'drizzle-orm'
import type {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import envPaths from 'env-paths'
import {z} from 'zod'
import {homeMigrations} from './home-migrations.gen.js'
import {openDatabase, openMigratedDb} from './open/migrated-db.js'
import {engines, hubConnections as hubConnectionsTable, hubOperations, hubRevocations} from './home-schema.js'

const ConcivHomeSchema = z.string().min(1).optional().catch(undefined)
const IMMEDIATE: {behavior: 'immediate'} = {behavior: 'immediate'}

export type HomeDb = ReturnType<typeof drizzle>

export type EngineRow = {id: string; pid: number; root: string; apiBase: string}

export function concivHome(options: {homeDir?: string; env: NodeJS.ProcessEnv}): string {
  return options.homeDir ?? ConcivHomeSchema.parse(options.env['CONCIV_HOME']) ?? envPaths('conciv', {suffix: ''}).data
}

const PreparedHomeSchema = z.string().brand('PreparedHome')

export type PreparedHome = z.infer<typeof PreparedHomeSchema>

const HOME_FILES = ['home.db', 'home.lock']
const FILE_MODE = 0o600
const FOLDER_MODE = 0o700

export async function prepareHome(home: string): Promise<PreparedHome> {
  await prepareFolder(home)
  await Promise.all(HOME_FILES.map((name) => preparePrivateFile(join(home, name))))
  return PreparedHomeSchema.parse(home)
}

async function preparePrivateFile(path: string): Promise<void> {
  openDatabase(path).close()
  await chmod(path, FILE_MODE)
}

export function openHomeDb(home: PreparedHome): HomeDb {
  return openMigratedDb({
    file: join(home, 'home.db'),
    lock: join(home, 'home.lock'),
    migrate: (db) => migrateSync(homeMigrations, db._.session),
  })
}

export function closeHomeDb(db: HomeDb): void {
  db.$client.close()
}

export function withHomeDb<T>(home: PreparedHome, run: (db: HomeDb) => T): T {
  const db = openHomeDb(home)
  try {
    return run(db)
  } finally {
    closeHomeDb(db)
  }
}

export async function readHomeDb<T>(home: string, run: (db: HomeDb) => T): Promise<T | null> {
  if ((await lstatOrNull(join(home, 'home.db'))) === null) return null
  return withHomeDb(await prepareHome(home), run)
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
    .orderBy(sql`rowid`)
    .all()
}

export type HubOperation = {harness: string; pid: number; childPid: number | null; startedAt: number}

export function recordHubConnection(
  db: HomeDb,
  harness: string,
  now: number,
  generation = Number.POSITIVE_INFINITY,
): boolean {
  return db.transaction((tx) => {
    if (currentGeneration(tx) > generation) return false
    tx.insert(hubConnectionsTable).values({harness, connectedAt: now}).onConflictDoNothing().run()
    return true
  }, IMMEDIATE)
}

export function removeHubConnection(db: HomeDb, harness: string): void {
  db.transaction((tx) => {
    tx.delete(hubConnectionsTable).where(eq(hubConnectionsTable.harness, harness)).run()
    tx.insert(hubRevocations).values({}).run()
  }, IMMEDIATE)
}

export function lastHubRevocation(db: HomeDb): number {
  return currentGeneration(db)
}

export function takeHubOperation(db: HomeDb, operation: HubOperation, stale: (held: HubOperation) => boolean): boolean {
  return db.transaction((tx) => {
    const held = tx.select().from(hubOperations).where(eq(hubOperations.harness, operation.harness)).get()
    if (held !== undefined && !stale(held)) return false
    tx.insert(hubOperations)
      .values(operation)
      .onConflictDoUpdate({
        target: hubOperations.harness,
        set: {pid: operation.pid, childPid: operation.childPid, startedAt: operation.startedAt},
      })
      .run()
    return true
  }, IMMEDIATE)
}

export function markHubOperationChild(db: HomeDb, operation: HubOperation, childPid: number): boolean {
  return Number(db.update(hubOperations).set({childPid}).where(sameOperation(operation)).run().changes) > 0
}

export function endHubOperation(db: HomeDb, operation: HubOperation): void {
  db.delete(hubOperations).where(sameOperation(operation)).run()
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

const MissingEntrySchema = z.object({code: z.literal('ENOENT')})

function lstatOrNull(path: string) {
  return lstat(path).catch((error: unknown) => {
    if (MissingEntrySchema.safeParse(error).success) return null
    throw error
  })
}

async function prepareFolder(home: string): Promise<void> {
  const stats = await lstatOrNull(home)
  if (stats === null) {
    await mkdir(home, {recursive: true, mode: FOLDER_MODE})
    return
  }
  if (stats.isSymbolicLink()) throw homeFolderRefused(home, 'it is a symbolic link')
  if (!stats.isDirectory()) throw homeFolderRefused(home, 'it is not a directory')
  const uid = process.getuid?.()
  if (uid !== undefined && stats.uid !== uid) throw homeFolderRefused(home, `it is owned by uid ${stats.uid}`)
  await chmod(home, FOLDER_MODE)
}

function homeFolderRefused(home: string, reason: string): Error {
  return Object.assign(new Error(`conciv refuses the home folder ${home}: ${reason}`), {name: 'HomeFolderRefused'})
}

function currentGeneration(db: Pick<HomeDb, 'select'>): number {
  return (
    db
      .select({generation: max(hubRevocations.generation)})
      .from(hubRevocations)
      .get()?.generation ?? 0
  )
}

function sameOperation(operation: HubOperation) {
  return and(
    eq(hubOperations.harness, operation.harness),
    eq(hubOperations.pid, operation.pid),
    eq(hubOperations.startedAt, operation.startedAt),
  )
}
