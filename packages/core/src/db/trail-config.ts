import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

export type RecordApiDecl = {name: string}

export function migrationFileName(index: number, name: string): string {
  return `U${String(100 + index).padStart(4, '0')}__${name}.sql`
}

function buildFts(table: string, fts: string[]): string {
  const cols = fts.join(', ')
  const newVals = fts.map((c) => `new.${c}`).join(', ')
  const oldVals = fts.map((c) => `old.${c}`).join(', ')
  return [
    `CREATE VIRTUAL TABLE ${table}_fts USING fts5(${cols}, content='${table}', content_rowid='rowid');`,
    `CREATE TRIGGER ${table}_ai AFTER INSERT ON ${table} BEGIN`,
    `  INSERT INTO ${table}_fts(rowid, ${cols}) VALUES (new.rowid, ${newVals});`,
    `END;`,
    `CREATE TRIGGER ${table}_ad AFTER DELETE ON ${table} BEGIN`,
    `  INSERT INTO ${table}_fts(${table}_fts, rowid, ${cols}) VALUES('delete', old.rowid, ${oldVals});`,
    `END;`,
    `CREATE TRIGGER ${table}_au AFTER UPDATE ON ${table} BEGIN`,
    `  INSERT INTO ${table}_fts(${table}_fts, rowid, ${cols}) VALUES('delete', old.rowid, ${oldVals});`,
    `  INSERT INTO ${table}_fts(rowid, ${cols}) VALUES (new.rowid, ${newVals});`,
    `END;`,
  ].join('\n')
}

function buildMigration(table: string, columns: string, fts: string[]): string {
  const create = [
    `CREATE TABLE ${table} (`,
    `  id BLOB PRIMARY KEY NOT NULL CHECK (is_uuid_v7(id)) DEFAULT (uuid_v7()),`,
    `  cid TEXT NOT NULL,`,
    `  ${columns}`,
    `) STRICT;`,
    `CREATE UNIQUE INDEX ${table}_cid ON ${table}(cid);`,
  ].join('\n')
  return fts.length ? `${create}\n${buildFts(table, fts)}\n` : `${create}\n`
}

export function emitMigration(dataDir: string, index: number, name: string, columns: string, fts: string[] = []): void {
  const dir = join(dataDir, 'migrations', 'main')
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, migrationFileName(index, name)), buildMigration(name, columns, fts))
}

function recordApiBlock(api: RecordApiDecl): string {
  return `  { name: "${api.name}" table_name: "${api.name}" conflict_resolution: REPLACE acl_world: [READ, CREATE, UPDATE, DELETE] enable_subscriptions: true }`
}

export function writeTrailConfig(dataDir: string, apis: RecordApiDecl[]): void {
  const config = [
    'email {}',
    'server { application_name: "mandarax" logs_retention_sec: 604800 }',
    'auth { auth_token_ttl_sec: 3600 refresh_token_ttl_sec: 2592000 }',
    'jobs {}',
    'record_apis: [',
    apis.map(recordApiBlock).join(',\n'),
    ']',
    '',
  ].join('\n')
  mkdirSync(dataDir, {recursive: true})
  writeFileSync(join(dataDir, 'config.textproto'), config)
}
