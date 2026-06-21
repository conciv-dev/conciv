import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {initClient} from 'trailbase'
import {z} from 'zod'
import {afterEach, expect, test} from 'vitest'
import {registerCors} from '../../src/api/cors.js'
import {registerDbProxy} from '../../src/db/proxy.js'
import {createLiveDb} from '../../src/db/live-db.js'
import {createTrailSupervisor, type TrailSupervisor} from '../../src/db/trail-supervisor.js'

const NoteSchema = z.object({cid: z.string(), body: z.string()})
type Note = z.infer<typeof NoteSchema>
const InsertEvent = z.object({Insert: z.object({cid: z.string()})})

const dirs: string[] = []
const sups: TrailSupervisor[] = []
const servers: Server[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close()
  for (const sup of sups.splice(0)) await sup.stop()
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

async function bootProxied() {
  const dir = mkdtempSync(join(tmpdir(), 'mx-proxy-'))
  dirs.push(dir)
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  db.collection<Note>('notes', {schema: NoteSchema, columns: 'body TEXT NOT NULL', fts: ['body']})
  const sup = createTrailSupervisor({dataDir: dir, port: trailPort})
  sups.push(sup)
  await sup.start()
  const app = new H3()
  registerCors(app, [])
  registerDbProxy(app, sup.baseUrl)
  const server = serve({fetch: app.fetch, port: await getPort(), hostname: '127.0.0.1'})
  servers.push(server)
  await server.ready()
  return {base: new URL(server.url ?? '').origin}
}

test('the trailbase client creates and lists through the core proxy', async () => {
  const {base} = await bootProxied()
  const api = initClient(base).records<Note>('notes')
  const cid = crypto.randomUUID()
  await api.create({cid, body: 'via core'})
  const listed = await api.list({filters: [{column: 'cid', op: 'equal', value: cid}]})
  expect(listed.records.map((r) => r.body)).toContain('via core')
})

test('a disallowed Origin is rejected with 403', async () => {
  const {base} = await bootProxied()
  const res = await fetch(`${base}/api/records/v1/notes`, {headers: {origin: 'http://evil.example'}})
  expect(res.status).toBe(403)
})

test('the proxied subscribe stream delivers a realtime insert', async () => {
  const {base} = await bootProxied()
  const api = initClient(base).records<Note>('notes')
  const stream = await api.subscribeAll()
  const reader = stream.getReader()
  const cid = crypto.randomUUID()
  await api.create({cid, body: 'realtime'})
  let seen = false
  for (let read = 0; read < 20 && !seen; read++) {
    const {value, done} = await reader.read()
    if (done) break
    const parsed = InsertEvent.safeParse(value)
    seen = parsed.success && parsed.data.Insert.cid === cid
  }
  await reader.cancel()
  expect(seen).toBe(true)
})
