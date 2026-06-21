import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {z} from 'zod'
import {afterEach, expect, test} from 'vitest'
import {emitMigration, writeTrailConfig, migrationFileName} from '../../src/db/trail-config.js'
import {createTrailSupervisor} from '../../src/db/trail-supervisor.js'
import {getJson, postJson} from '../helpers/http.js'

const dirs: string[] = []

function makeDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mx-cfg-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

test('emitMigration writes a UUID-PK + cid + fts migration; writeTrailConfig declares the record api', () => {
  const dir = makeDataDir()
  emitMigration(dir, 0, 'notes', 'body TEXT NOT NULL', ['body'])
  writeTrailConfig(dir, [{name: 'notes'}])
  const migration = readFileSync(join(dir, 'migrations', 'main', migrationFileName(0, 'notes')), 'utf8')
  expect(migration).toContain('is_uuid_v7(id)')
  expect(migration).toContain('cid TEXT NOT NULL')
  expect(migration).toContain('CREATE UNIQUE INDEX')
  expect(migration).toContain('body TEXT NOT NULL')
  expect(migration).toContain('fts5')
  const config = readFileSync(join(dir, 'config.textproto'), 'utf8')
  expect(config).toContain('application_name')
  expect(config).toContain('enable_subscriptions: true')
  expect(config).toContain('acl_world')
})

test('a booted supervisor exposes the declared record api for anonymous CRUD', async () => {
  const dir = makeDataDir()
  emitMigration(dir, 0, 'notes', 'body TEXT NOT NULL', ['body'])
  writeTrailConfig(dir, [{name: 'notes'}])
  const port = await getPort()
  const sup = createTrailSupervisor({dataDir: dir, port})
  await sup.start()
  const cid = crypto.randomUUID()
  const created = await postJson(
    `${sup.baseUrl}/api/records/v1/notes`,
    {cid, body: 'hello'},
    z.object({ids: z.array(z.string())}),
  )
  expect(created.status).toBe(200)
  expect(created.data.ids.length).toBe(1)
  const listed = await getJson(
    `${sup.baseUrl}/api/records/v1/notes?filter[cid][$eq]=${cid}`,
    z.object({records: z.array(z.object({cid: z.string(), body: z.string()}))}),
  )
  expect(listed.data.records.map((r) => r.body)).toContain('hello')
  await sup.stop()
})
