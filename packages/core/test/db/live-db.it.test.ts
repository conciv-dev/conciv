import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {z} from 'zod'
import {afterEach, expect, test} from 'vitest'
import {createLiveDb} from '../../src/db/live-db.js'
import {createTrailSupervisor, type TrailSupervisor} from '../../src/db/trail-supervisor.js'

const NoteSchema = z.object({cid: z.string(), body: z.string()})
type Note = z.infer<typeof NoteSchema>

const dirs: string[] = []
const sups: TrailSupervisor[] = []

afterEach(async () => {
  for (const sup of sups.splice(0)) await sup.stop()
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

async function bootDb() {
  const dir = mkdtempSync(join(tmpdir(), 'mx-livedb-'))
  dirs.push(dir)
  const port = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${port}`, dataDir: dir})
  const notes = db.collection<Note>('notes', {schema: NoteSchema, columns: 'body TEXT NOT NULL', fts: ['body']})
  const sup = createTrailSupervisor({dataDir: dir, port})
  sups.push(sup)
  await sup.start()
  return {db, notes}
}

test('insert read-backs the row by cid; query filters by equality and search', async () => {
  const {notes} = await bootDb()
  const cid = crypto.randomUUID()
  const inserted = await notes.insert({cid, body: 'hello world'})
  expect(inserted).toEqual({cid, body: 'hello world'})
  expect(await notes.query({cid})).toEqual([{cid, body: 'hello world'}])
  expect((await notes.query({search: 'hello'})).map((n) => n.cid)).toContain(cid)
})

test('update patches by cid and delete removes by cid', async () => {
  const {notes} = await bootDb()
  const cid = crypto.randomUUID()
  await notes.insert({cid, body: 'first'})
  const updated = await notes.update(cid, {body: 'second'})
  expect(updated.body).toBe('second')
  const [reread] = await notes.query({cid})
  expect(reread?.body).toBe('second')
  await notes.delete(cid)
  expect(await notes.query({cid})).toEqual([])
})

test('list and get expose declared collections with JSON schema + fts', async () => {
  const {db} = await bootDb()
  const info = db.list().find((c) => c.name === 'notes')
  expect(info?.fts).toEqual(['body'])
  expect(info?.table).toBe('notes')
  expect(info?.schema).toMatchObject({type: 'object'})
  expect(db.get('notes')).not.toBeNull()
  expect(db.get('missing')).toBeNull()
})

test('redeclaring a collection with a mismatched schema throws', async () => {
  const {db} = await bootDb()
  expect(() => db.collection('notes', {schema: z.object({cid: z.string()}), columns: 'x TEXT'})).toThrow()
})
