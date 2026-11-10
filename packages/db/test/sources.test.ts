import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {sql} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {integer, sqliteTable, sqliteView, text} from 'drizzle-orm/sqlite-core'
import {describe, expect, it} from 'vitest'
import {catalogSources} from '../src/catalog-sources.js'
import {sourceCatalog} from '../src/source-catalog.js'

const rows = sqliteTable('design_rows', {
  seq: integer().primaryKey(),
  run_id: integer().notNull(),
  kind: text().notNull(),
})

const kinds = sqliteView('round_kinds', {run_id: integer().notNull(), kind: text().notNull()}).as(
  sql`select run_id, kind from design_rows`,
)

const ROWS = 'create table design_rows (seq integer primary key, run_id integer not null, kind text not null)'

const KINDS = 'create view round_kinds as select run_id, kind from design_rows'

function stores() {
  const home = mkdtempSync(join(tmpdir(), 'conciv-sources-'))
  const runs = new DatabaseSync(join(home, 'runs.db'))
  runs.exec(ROWS)
  runs.exec(KINDS)
  runs.exec("insert into design_rows (run_id, kind) values (7, 'stored')")
  runs.close()
  const main = new DatabaseSync(join(home, 'conciv.db'))
  main.exec(ROWS)
  main.exec("insert into design_rows (run_id, kind) values (1, 'live')")
  return {home, orm: drizzle({client: main})}
}

describe('sources', () => {
  it('lists the declared fields of a source over a sqlite view, typed from the view columns', () => {
    const [catalog] = sourceCatalog({
      extension: 'design',
      home: '/home',
      sources: {kinds: {table: kinds, fields: {run: kinds.run_id, kind: kinds.kind}}},
    })
    expect([catalog?.table, catalog?.database, catalog?.fields]).toEqual([
      'round_kinds',
      null,
      [
        {name: 'run', column: 'run_id', path: null, type: 'number int53'},
        {name: 'kind', column: 'kind', path: null, type: 'string'},
      ],
    ])
  })

  it('reads a source in an attached database from its own table, not the same-named table in the main one', async () => {
    const {home, orm} = stores()
    const catalog = sourceCatalog({
      extension: 'design',
      home,
      sources: {
        live: {table: rows, fields: {run: rows.run_id, kind: rows.kind}},
        stored: {table: rows, database: 'runs', fields: {run: rows.run_id, kind: rows.kind}},
        kinds: {table: kinds, database: 'runs', fields: {run: kinds.run_id, kind: kinds.kind}},
      },
    })
    const sources = catalogSources({orm, sources: catalog})
    expect(catalog[1]?.database).toEqual({name: 'runs', file: join(home, 'runs.db')})
    expect(await sources.read({from: 'design_live'})).toEqual([{run: 1, kind: 'live'}])
    expect(await sources.read({from: 'design_stored', where: 'run == 7'})).toEqual([{run: 7, kind: 'stored'}])
    expect(await sources.read({from: 'design_kinds'})).toEqual([{run: 7, kind: 'stored'}])
    expect(await sources.read({from: 'design_kinds', where: 'run == 1'})).toEqual([])
  })

  it('refuses a source whose database file does not exist rather than creating it', async () => {
    const {home, orm} = stores()
    const sources = catalogSources({
      orm,
      sources: sourceCatalog({
        extension: 'design',
        home: join(home, 'elsewhere'),
        sources: {stored: {table: rows, database: 'runs', fields: {run: rows.run_id}}},
      }),
    })
    await expect(sources.read({from: 'design_stored'})).rejects.toThrow(
      `no runs database at ${join(home, 'elsewhere', 'runs.db')}`,
    )
  })
})
