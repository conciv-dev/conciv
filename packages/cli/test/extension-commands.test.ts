import {mkdtempSync, rmSync} from 'node:fs'
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
    expect(await sources.read({from: 'design_rows'})).toEqual([{kind: 'live'}])
    expect(await sources.read({from: 'design_stored'})).toEqual([{kind: 'stored'}])
  })
})
