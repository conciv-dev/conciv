import {existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync} from 'node:fs'
import {join} from 'node:path'

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

const api = (name: string) => `record_apis: [
  {
    name: "${name}"
    table_name: "${name}"
    acl_world: [CREATE, READ, UPDATE, DELETE]
    enable_subscriptions: true
  }
]
`

export const RECORD_API_CONFIG = ['sessions', 'drafts', 'markers'].map(api).join('')

export const BASE_CONFIG = `server {
  application_name: "conciv"
}
`

export function prepareDepot(opts: {dataDir: string}): void {
  const migrationsDir = join(opts.dataDir, 'migrations/main')
  mkdirSync(migrationsDir, {recursive: true})
  const migration = join(migrationsDir, MIGRATION_FILENAME)
  if (!existsSync(migration)) writeFileSync(migration, MIGRATION_SQL)
  const configPath = join(opts.dataDir, 'config.textproto')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, `${BASE_CONFIG}${RECORD_API_CONFIG}`)
    return
  }
  const existing = readFileSync(configPath, 'utf8')
  if (!existing.includes('name: "sessions"')) appendFileSync(configPath, RECORD_API_CONFIG)
}
