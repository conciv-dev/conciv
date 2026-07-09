import {describe, expect, it} from 'vitest'
import {mkdtempSync, readFileSync, readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {extensionMigrationFilename, extensionTableName, extensionTableSql} from './extension-tables.js'
import {prepareDepot} from './depot.js'

const spec = {extension: 'My-Ext', name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`}

describe('extension tables', () => {
  it('derives a slugged physical name', () => {
    expect(extensionTableName(spec)).toBe('ext_my_ext_notes')
  })

  it('generates STRICT ddl with the uuid_v7 blob pk', () => {
    const sql = extensionTableSql(spec)
    expect(sql).toContain('CREATE TABLE ext_my_ext_notes')
    expect(sql).toContain('id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7())')
    expect(sql).toContain('session_id TEXT NOT NULL')
    expect(sql).toContain(') STRICT;')
  })

  it('migration filename is deterministic, order-independent, and sorts after the conciv base migration', () => {
    const filename = extensionMigrationFilename(spec)
    expect(filename).toBe(extensionMigrationFilename(spec))
    expect(filename).toMatch(/^U\d+__ext_my_ext_notes\.sql$/)
    const version = Number(filename.slice(1).split('__')[0])
    expect(version).toBeGreaterThan(1783545917)
  })

  it('rejects names that do not survive slugging', () => {
    const bad = {extension: 'x', name: '9bad', columns: 'a TEXT'}
    expect(() => extensionTableName(bad)).toThrowError(expect.objectContaining({code: 'invalid-table'}))
  })

  it('prepareDepot writes extension migrations + record apis idempotently', () => {
    const dir = mkdtempSync(join(tmpdir(), 'depot-ext-'))
    prepareDepot({dataDir: dir, extensionTables: [spec]})
    prepareDepot({dataDir: dir, extensionTables: [spec]})
    const files = readdirSync(join(dir, 'migrations/main'))
    expect(files.filter((file) => file.includes('ext_my_ext_notes'))).toHaveLength(1)
    const config = readFileSync(join(dir, 'config.textproto'), 'utf8')
    expect(config.match(/ name: "ext_my_ext_notes"/g)).toHaveLength(1)
  })
})
