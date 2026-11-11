import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {describe, expect, it, vi} from 'vitest'
import {openDb, registerEngine, withHomeDb, writeCatalog, type CatalogSource} from '@conciv/db'
import {defineExtension} from '@conciv/extension'
import {main as cliMain} from '../src/main.js'
import {localCatalog} from '../src/local-catalog.js'
import {runCli} from '../src/run.js'
import {bootCli, cliSession, onlyDocument} from './helpers.js'

function cataloged(input: {source: string; database: CatalogSource['database']}): CatalogSource {
  const field = {name: 'kind', column: 'kind', path: null, type: 'string'}
  const {source, database} = input
  return {
    name: `design_${source}`,
    extension: 'design',
    source,
    table: 'design_rows',
    database,
    fields: [field],
    order: 0,
    writable: false,
    sort: [],
  }
}

const probe = defineExtension({
  name: 'probe',
  cliCommands: {
    stamp: {
      description: 'stamp a wave',
      positionals: ['label'],
      options: {wave: {type: 'string', description: 'the wave to stamp'}},
      scope: 'home',
      run: ({args, options}) => ({args, options}),
    },
  },
})

describe('extension commands', () => {
  const {cleanups, written} = cliSession()

  function scratch(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    cleanups.push(async () => rmSync(dir, {recursive: true, force: true}))
    return dir
  }

  function withEnv(name: string, value: string): void {
    const held = process.env[name]
    process.env[name] = value
    cleanups.push(async () => {
      if (held === undefined) Reflect.deleteProperty(process.env, name)
      if (held !== undefined) process.env[name] = held
    })
  }

  function outside(): void {
    const back = process.cwd()
    process.chdir(scratch('conciv-nowhere-'))
    Reflect.deleteProperty(process.env, 'CONCIV_PORT')
    cleanups.push(async () => process.chdir(back))
  }

  it('renders a declared option and sends a home-scoped command to the engine that loads its extension', async () => {
    const home = scratch('conciv-home-')
    withEnv('CONCIV_HOME', home)
    const kit = await bootCli(cleanups, {extensions: [probe]})
    withHomeDb(home, (db) => {
      registerEngine(db, {id: 'other', pid: 1, root: scratch('conciv-other-'), apiBase: 'http://127.0.0.1:9'})
      registerEngine(db, {id: 'probe', pid: process.pid, root: kit.stateRoot, apiBase: kit.base})
    })
    outside()
    const logged: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logged.push(String(line))
    })
    expect(await runCli(cliMain, ['probe:stamp', '--help'])).toBe(0)
    expect(logged.join('\n')).toContain('--wave')
    expect(await runCli(cliMain, ['probe:stamp', 'one', '--wave', 'thirty'])).toBe(0)
    expect(onlyDocument(written)).toMatchObject({ok: true, data: {args: ['one'], options: {wave: 'thirty'}}})
  })

  it('resolves a source in the project catalog before the home catalog, and the home one when the project lacks it', async () => {
    const home = scratch('conciv-home-')
    const project = scratch('conciv-project-')
    const store = new DatabaseSync(join(home, 'runs.db'))
    store.exec('create table design_rows (seq integer primary key, kind text not null)')
    store.exec("insert into design_rows (kind) values ('stored')")
    store.close()
    const runs = {name: 'runs', file: join(home, 'runs.db')}
    const shared = [cataloged({source: 'rows', database: runs}), cataloged({source: 'stored', database: runs})]
    withHomeDb(home, (orm) => writeCatalog({orm, extensions: ['design'], sources: shared, commands: []}))
    const orm = openDb({stateRoot: project})
    orm.$client.exec('create table design_rows (seq integer primary key, kind text not null)')
    orm.$client.exec("insert into design_rows (kind) values ('live')")
    writeCatalog({
      orm,
      extensions: ['design'],
      sources: [cataloged({source: 'rows', database: null})],
      commands: [],
    })
    orm.$client.close()
    withEnv('CONCIV_HOME', home)
    withEnv('CONCIV_STATE_ROOT', project)
    const {sources} = localCatalog()
    expect((await sources.read({from: 'design_rows'})).results).toEqual([{kind: 'live'}])
    expect((await sources.read({from: 'design_stored'})).results).toEqual([{kind: 'stored'}])
  })
})

describe('db query', () => {
  const {cleanups, written} = cliSession()

  function project(): void {
    const root = mkdtempSync(join(tmpdir(), 'conciv-query-project-'))
    cleanups.push(async () => rmSync(root, {recursive: true, force: true}))
    writeFileSync(join(root, 'dom.json'), JSON.stringify({sites: [{drawn: false}, {drawn: true}]}))
    const orm = openDb({stateRoot: root})
    orm.$client.exec(
      'create table design_rows (seq integer primary key, kind text not null, path text, content_type text)',
    )
    orm.$client.exec(
      "insert into design_rows (kind, path, content_type) values ('live', 'dom.json', 'application/json'), ('more', 'gone.json', 'application/json')",
    )
    const fields = [
      {name: 'seq', column: 'seq', path: null, type: 'number int53'},
      {name: 'kind', column: 'kind', path: null, type: 'string'},
      {name: 'content', column: 'path', path: null, type: 'unknown', file: {contentType: 'content_type', root}},
    ]
    writeCatalog({
      orm,
      extensions: ['design'],
      sources: [{...cataloged({source: 'rows', database: null}), fields}],
      commands: [],
    })
    orm.$client.close()
    const held = process.env.CONCIV_STATE_ROOT
    process.env.CONCIV_STATE_ROOT = root
    cleanups.push(async () => {
      if (held === undefined) Reflect.deleteProperty(process.env, 'CONCIV_STATE_ROOT')
      if (held !== undefined) process.env.CONCIV_STATE_ROOT = held
    })
  }

  async function query(args: string[]): Promise<string> {
    written.length = 0
    await runCli(cliMain, ['db', 'query', '--from', 'design_rows', ...args])
    return written.join('')
  }

  it('prints a map select as a table, a scalar one per line and a list in numbered columns', async () => {
    project()
    expect(await query(['--select', '{"kind": kind, "seq": seq}'])).toBe('kind  seq\nlive  1\nmore  2\n')
    expect(await query(['--select', 'kind'])).toBe('live\nmore\n')
    expect(await query(['--select', '[seq, kind]'])).toBe('0  1\n1  live\n2  more\n')
    expect(await query(['--where', 'seq == 1', '--select', 'content.sites.filter(s, !s.drawn).size()'])).toBe('1\n')
  })

  it('returns results, total and next with --json, pages with --cursor, and one bare row with --single', async () => {
    project()
    const first = JSON.parse(await query(['--select', 'seq', '--order=-seq', '--limit', '1', '--json']))
    expect(first).toMatchObject({ok: true, data: {results: [2], total: 2, next: expect.any(String)}})
    const rest = JSON.parse(
      await query(['--select', 'seq', '--order=-seq', '--limit', '1', '--cursor', first.data.next, '--json']),
    )
    expect(rest).toEqual({ok: true, data: {results: [1], total: 2, next: null}})
    expect(JSON.parse(await query(['--where', 'kind == "live"', '--single', '--json']))).toEqual({
      ok: true,
      data: {seq: 1, kind: 'live'},
    })
  })

  it('takes an option value that starts with a dash as its own next argument', async () => {
    project()
    expect(await query(['--select', '-seq', '--order', '-seq'])).toBe('-2\n-1\n')
  })

  it('refuses a query it cannot answer as a user error naming the reason', async () => {
    project()
    const refused = async (args: string[]) => JSON.parse(await query(args)).error
    expect(await refused(['--single'])).toMatchObject({
      kind: 'user',
      code: 'QUERY_FAILED',
      message: expect.stringContaining('2 rows'),
    })
    expect(await refused(['--single', '--limit', '1'])).toMatchObject({
      kind: 'user',
      message: expect.stringContaining('--single'),
    })
    expect(await refused(['--cursor', 'abc'])).toMatchObject({
      kind: 'user',
      message: expect.stringContaining('--order'),
    })
    expect(await refused(['--where', 'missing == 1'])).toMatchObject({
      kind: 'user',
      code: 'QUERY_FAILED',
      message: 'no field missing; the fields are seq, kind, content',
    })
    expect(await refused(['--select', 'content'])).toMatchObject({
      code: 'QUERY_FAILED',
      message: expect.stringContaining('gone.json'),
    })
  })
})
