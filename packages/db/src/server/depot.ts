import {existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync} from 'node:fs'
import {join} from 'node:path'
import {
  extensionMigrationFilename,
  extensionTableName,
  extensionTableSql,
  type ExtensionTableSpec,
} from './extension-tables.js'

export const MIGRATION_FILENAME = 'U1783545917__conciv.sql'

export const MIGRATION_SQL = `CREATE TABLE sessions (
  id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  session_id TEXT NOT NULL UNIQUE,
  harness_session_id TEXT,
  harness_kind TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'chat',
  title TEXT,
  model TEXT,
  usage TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  cwd TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE drafts (
  id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  session_id TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL DEFAULT '',
  selection_start INTEGER NOT NULL DEFAULT 0,
  selection_end INTEGER NOT NULL DEFAULT 0,
  grabs TEXT NOT NULL DEFAULT '[]',
  scroll_top INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE markers (
  id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  session_id TEXT NOT NULL,
  after_turn INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
) STRICT;
`

const CORE_APIS = ['sessions', 'drafts', 'markers']

export function recordApiConfig(name: string): string {
  return `record_apis: [
  {
    name: "${name}"
    table_name: "${name}"
    acl_world: [CREATE, READ, UPDATE, DELETE]
    enable_subscriptions: true
  }
]
`
}

export const RECORD_API_CONFIG = CORE_APIS.map(recordApiConfig).join('')

export const BASE_CONFIG = `server {
  application_name: "conciv"
}
`

function writeIfMissing(path: string, content: string): void {
  if (!existsSync(path)) writeFileSync(path, content)
}

function writeMigrations(dataDir: string, tables: ExtensionTableSpec[]): void {
  const migrationsDir = join(dataDir, 'migrations/main')
  mkdirSync(migrationsDir, {recursive: true})
  writeIfMissing(join(migrationsDir, MIGRATION_FILENAME), MIGRATION_SQL)
  for (const spec of tables) {
    writeIfMissing(join(migrationsDir, extensionMigrationFilename(spec)), extensionTableSql(spec))
  }
}

function declaredApi(config: string, name: string): boolean {
  return config.includes(` name: "${name}"`)
}

function ensureRecordApis(dataDir: string, apiNames: string[]): void {
  const configPath = join(dataDir, 'config.textproto')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, `${BASE_CONFIG}${apiNames.map(recordApiConfig).join('')}`)
    return
  }
  const existing = readFileSync(configPath, 'utf8')
  const missing = apiNames.filter((name) => !declaredApi(existing, name))
  if (missing.length > 0) appendFileSync(configPath, missing.map(recordApiConfig).join(''))
}

export function prepareDepot(opts: {dataDir: string; extensionTables?: ExtensionTableSpec[]}): void {
  const tables = opts.extensionTables ?? []
  writeMigrations(opts.dataDir, tables)
  ensureRecordApis(opts.dataDir, [...CORE_APIS, ...tables.map(extensionTableName)])
}
