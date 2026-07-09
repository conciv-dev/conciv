import {describe, expect, it} from 'vitest'
import {mkdtempSync, readFileSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {MIGRATION_FILENAME, prepareDepot} from './depot.js'

describe('prepareDepot', () => {
  it('writes migration and record apis once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'depot-'))
    prepareDepot({dataDir: dir})
    prepareDepot({dataDir: dir})
    const sql = readFileSync(join(dir, 'migrations/main', MIGRATION_FILENAME), 'utf8')
    expect(sql).toContain('CREATE TABLE sessions')
    const config = readFileSync(join(dir, 'config.textproto'), 'utf8')
    expect(config.match(/ name: "sessions"/g)).toHaveLength(1)
    expect(existsSync(join(dir, 'migrations/main'))).toBe(true)
  })
})
