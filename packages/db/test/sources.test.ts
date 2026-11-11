import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {sql} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {integer, sqliteTable, sqliteView, text} from 'drizzle-orm/sqlite-core'
import {describe, expect, it} from 'vitest'
import {catalogSources} from '../src/catalog-sources.js'
import {homeCatalog} from '../src/home-catalog.js'
import {withHomeDb} from '../src/home-db.js'
import {sourceCatalog} from '../src/source-catalog.js'
import type {CatalogCommand} from '../src/source-types.js'
import {writeCatalog} from '../src/write-catalog.js'

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
    expect((await sources.read({from: 'design_live'})).results).toEqual([{run: 1, kind: 'live'}])
    expect((await sources.read({from: 'design_stored', where: 'run == 7'})).results).toEqual([{run: 7, kind: 'stored'}])
    expect((await sources.read({from: 'design_kinds'})).results).toEqual([{run: 7, kind: 'stored'}])
    expect((await sources.read({from: 'design_kinds', where: 'run == 1'})).results).toEqual([])
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

const REPORT: CatalogCommand = {
  name: 'design:report',
  extension: 'design',
  command: 'report',
  description: 'renders a wave',
  positionals: ['wave'],
  options: {lifetime: {type: 'string', description: 'kind=days', multiple: true}},
  scope: 'home',
}

describe('home catalog', () => {
  it('serves the sources and commands an extension cataloged in home.db, reading the store file they name', async () => {
    const home = mkdtempSync(join(tmpdir(), 'conciv-home-catalog-'))
    const runs = new DatabaseSync(join(home, 'runs.db'))
    runs.exec('create table design_rows (seq integer primary key, run_id integer not null, kind text not null)')
    runs.exec("insert into design_rows (run_id, kind) values (7, 'stored')")
    runs.close()
    const sources = sourceCatalog({
      extension: 'design',
      home,
      sources: {stored: {table: rows, database: 'runs', fields: {run: rows.run_id, kind: rows.kind}}},
    })
    withHomeDb(home, (orm) => writeCatalog({orm, extensions: ['design'], sources, commands: [REPORT]}))
    const catalog = homeCatalog(home)
    expect(catalog.sources.list()).toEqual([
      {
        name: 'design_stored',
        extension: 'design',
        source: 'stored',
        fields: ['run', 'kind'],
        writable: false,
        order: [],
      },
    ])
    expect((await catalog.sources.read({from: 'design_stored'})).results).toEqual([{run: 7, kind: 'stored'}])
    expect(catalog.commands).toEqual([REPORT])
  })
})

const artifacts = sqliteTable('design_artifacts', {
  id: integer().primaryKey(),
  run: integer().notNull(),
  kind: text().notNull(),
  path: text().notNull(),
  content_type: text().notNull(),
  meta: text({mode: 'json'}),
})

const ARTIFACTS =
  'create table design_artifacts (id integer primary key, run integer not null, kind text not null, path text not null, content_type text not null, meta text)'

function artifactStore() {
  const home = mkdtempSync(join(tmpdir(), 'conciv-query-'))
  mkdirSync(join(home, 'artifacts'))
  writeFileSync(
    join(home, 'artifacts', 'dom.json'),
    JSON.stringify({
      sites: [
        {path: 'a', drawn: false},
        {path: 'b', drawn: true},
        {path: 'c', drawn: false},
      ],
    }),
  )
  writeFileSync(join(home, 'artifacts', 'note.txt'), 'plain words')
  writeFileSync(join(home, 'artifacts', 'shot.png'), new Uint8Array([137, 80, 78, 71]))
  const main = new DatabaseSync(join(home, 'conciv.db'))
  main.exec(ARTIFACTS)
  const insert = main.prepare(
    'insert into design_artifacts (run, kind, path, content_type, meta) values (?, ?, ?, ?, ?)',
  )
  insert.run(1, 'dom', 'artifacts/dom.json', 'application/json; charset=utf-8', '{"tags": ["x", "y"]}')
  insert.run(1, 'note', 'artifacts/note.txt', 'text/plain', '{"tags": []}')
  insert.run(2, 'screenshot', 'artifacts/shot.png', 'image/png', '{"tags": ["x"]}')
  insert.run(3, 'dom', 'artifacts/gone.json', 'application/json', '{}')
  insert.run(1, 'cssom', 'artifacts/gone-too.json', 'application/json', null)
  const orm = drizzle({client: main})
  const sources = catalogSources({
    orm,
    sources: sourceCatalog({
      extension: 'design',
      home,
      sources: {
        artifacts: {
          table: artifacts,
          fields: {
            id: artifacts.id,
            run: artifacts.run,
            kind: artifacts.kind,
            path: artifacts.path,
            meta: artifacts.meta,
            content: {file: artifacts.path, contentType: artifacts.content_type},
          },
        },
      },
    }),
  })
  return {home, sources}
}

describe('query', () => {
  it('projects each row through a CEL select: a map keeps its keys, a scalar is the value, a list stays a list', async () => {
    const {sources} = artifactStore()
    const where = 'run == 1'
    expect(await sources.read({from: 'design_artifacts', where, select: '{"kind": kind, "id": id}'})).toEqual({
      results: [
        {kind: 'dom', id: 1},
        {kind: 'note', id: 2},
        {kind: 'cssom', id: 5},
      ],
      total: 3,
      next: null,
    })
    expect((await sources.read({from: 'design_artifacts', where, select: 'kind'})).results).toEqual([
      'dom',
      'note',
      'cssom',
    ])
    expect((await sources.read({from: 'design_artifacts', where, select: '[id, size(meta.tags)]'})).results).toEqual([
      [1, 2],
      [2, 0],
      null,
    ])
  })

  it('pushes what SQL can say into SQL and lets CEL decide the rest on every row SQL returned', async () => {
    const {sources} = artifactStore()
    const ids = async (where: string) => (await sources.read({from: 'design_artifacts', where, select: 'id'})).results
    expect(await ids('meta.tags.exists(t, t == "x")')).toEqual([1, 3])
    expect(await ids('run == 1 && meta.tags.exists(t, t == "x")')).toEqual([1])
    expect(await ids('size(kind) > 3 || run == 3')).toEqual([2, 3, 4, 5])
    expect(await ids('!(kind in ["dom", "note"]) && run < 3')).toEqual([3, 5])
    expect(await ids('meta.tags == ["x"]')).toEqual([3])
  })

  it('reads a lazy file field only when the where or select touches it: JSON parses, text stays text, binary is refused', async () => {
    const {sources} = artifactStore()
    expect((await sources.read({from: 'design_artifacts', select: 'id'})).total).toBe(5)
    expect(
      (
        await sources.read({
          from: 'design_artifacts',
          where: 'id == 1',
          select: 'content.sites.filter(s, s.drawn == false).map(s, s.path)',
        })
      ).results,
    ).toEqual([['a', 'c']])
    expect(
      (await sources.read({from: 'design_artifacts', where: 'kind == "note"', select: 'content'})).results,
    ).toEqual(['plain words'])
    expect(
      (await sources.read({from: 'design_artifacts', where: 'id < 3 && type(content) == string', select: 'id'}))
        .results,
    ).toEqual([2])
    await expect(sources.read({from: 'design_artifacts', where: 'run == 3', select: 'content'})).rejects.toThrow(
      'gone.json',
    )
    await expect(
      sources.read({from: 'design_artifacts', where: 'kind == "screenshot"', select: 'content'}),
    ).rejects.toThrow('artifacts/shot.png is image/png')
  })

  it('pages with a keyset cursor over the order, ties included, and refuses a cursor without an order', async () => {
    const {sources} = artifactStore()
    const order = [{field: 'run', dir: 'asc' as const}]
    const first = await sources.read({from: 'design_artifacts', select: 'id', order, limit: 2})
    expect([first.results, first.total]).toEqual([[1, 2], 5])
    const pages = [first.results]
    const walk = async (next: string | null): Promise<void> => {
      if (next === null) return
      const page = await sources.read({from: 'design_artifacts', select: 'id', order, limit: 2, cursor: next})
      pages.push(page.results)
      return walk(page.next)
    }
    await walk(first.next)
    expect(pages).toEqual([[1, 2], [5, 3], [4]])
    const filtered = await sources.read({
      from: 'design_artifacts',
      where: 'meta.tags.exists(t, t == "x") || run == 3',
      select: 'id',
      order: [{field: 'id', dir: 'desc'}],
      limit: 2,
    })
    expect([filtered.results, filtered.total]).toEqual([[4, 3], 3])
    const rest = await sources.read({
      from: 'design_artifacts',
      where: 'meta.tags.exists(t, t == "x") || run == 3',
      select: 'id',
      order: [{field: 'id', dir: 'desc'}],
      limit: 2,
      cursor: filtered.next ?? '',
    })
    expect(rest).toEqual({results: [1], total: 3, next: null})
    await expect(sources.read({from: 'design_artifacts', cursor: first.next ?? ''})).rejects.toThrow('takes an order')
  })

  it('refuses an unknown field in the where or the select, listing the fields of the source', async () => {
    const {sources} = artifactStore()
    const listed = 'the fields are id, run, kind, path, meta, content'
    await expect(sources.read({from: 'design_artifacts', where: 'nope == 1'})).rejects.toThrow(
      `no field nope; ${listed}`,
    )
    await expect(sources.read({from: 'design_artifacts', select: '{"a": kind, "b": other}'})).rejects.toThrow(
      `no field other; ${listed}`,
    )
    expect(
      (await sources.read({from: 'design_artifacts', where: 'meta.tags.all(kind, kind != "z")', select: 'id'})).total,
    ).toBe(3)
  })
})
