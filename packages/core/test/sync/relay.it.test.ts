import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {H3, type H3Event} from 'h3'
import {serve, type Server} from 'srvx'
import * as Y from 'yjs'
import {z} from 'zod'
import {afterEach, expect, test} from 'vitest'
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'
import {registerCors} from '../../src/api/cors.js'
import {createLiveDb} from '../../src/db/live-db.js'
import {createSnapshotStore} from '../../src/sync/snapshot-store.js'
import {createSyncEngine} from '../../src/sync/sync-engine.js'
import {registerSyncRelay} from '../../src/sync/relay.js'
import {createTrailSupervisor, type TrailSupervisor} from '../../src/db/trail-supervisor.js'

const ROOM = 'preview:session'
const TOKEN = 'session-token'
const Frame = z.object({u: z.string(), o: z.string().optional()})

const dirs: string[] = []
const sups: TrailSupervisor[] = []
const servers: Server[] = []
const aborters: AbortController[] = []

function streamFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const aborter = new AbortController()
  aborters.push(aborter)
  return fetch(url, {headers, signal: aborter.signal})
}

afterEach(async () => {
  for (const aborter of aborters.splice(0)) aborter.abort()
  for (const server of servers.splice(0)) await server.close()
  for (const sup of sups.splice(0)) await sup.stop()
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

async function bootRelay() {
  const dir = mkdtempSync(join(tmpdir(), 'mx-relay-'))
  dirs.push(dir)
  const port = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${port}`, dataDir: dir})
  const engine = createSyncEngine({store: createSnapshotStore(db)})
  const sup = createTrailSupervisor({dataDir: dir, port})
  sups.push(sup)
  await sup.start()
  const app = new H3()
  registerCors(app, [])
  const validateRoom = (room: string, event: H3Event): boolean =>
    room === ROOM && event.req.headers.get(MANDARAX_SESSION_HEADER) === TOKEN
  registerSyncRelay(app, engine, validateRoom)
  const server = serve({fetch: app.fetch, port: await getPort(), hostname: '127.0.0.1'})
  servers.push(server)
  await server.ready()
  return {base: new URL(server.url ?? '').origin}
}

function settingUpdate(key: string, value: string): string {
  const src = new Y.Doc()
  src.getMap('data').set(key, value)
  return Buffer.from(Y.encodeStateAsUpdate(src)).toString('base64')
}

function frameReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const queued: unknown[] = []
  let buffer = ''
  const pump = async (): Promise<unknown | null> => {
    for (;;) {
      const {value, done} = await reader.read()
      if (done) return null
      buffer += decoder.decode(value)
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) if (part.startsWith('data: ')) queued.push(JSON.parse(part.slice(6)))
      if (queued.length) return queued.shift() ?? null
    }
  }
  const next = (timeoutMs: number): Promise<unknown | null> => {
    if (queued.length) return Promise.resolve(queued.shift() ?? null)
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    return Promise.race([pump(), timeout])
  }
  return {next}
}

test('a bad Origin and a missing session token are both rejected', async () => {
  const {base} = await bootRelay()
  const badOrigin = await fetch(`${base}/api/sync/${ROOM}?c=x`, {headers: {origin: 'http://evil.example'}})
  expect(badOrigin.status).toBe(403)
  const noToken = await fetch(`${base}/api/sync/${ROOM}?c=x`)
  expect(noToken.status).toBe(403)
})

test('an update POSTed by client A reaches client B and is not echoed to A', async () => {
  const {base} = await bootRelay()
  const headers = {[MANDARAX_SESSION_HEADER]: TOKEN}
  const subB = await streamFetch(`${base}/api/sync/${ROOM}?c=B`, headers)
  const subA = await streamFetch(`${base}/api/sync/${ROOM}?c=A`, headers)
  const readerB = frameReader(subB.body!)
  const readerA = frameReader(subA.body!)
  expect(Frame.parse(await readerB.next(5000)).u).toBeTypeOf('string')
  expect(Frame.parse(await readerA.next(5000)).u).toBeTypeOf('string')

  const update = settingUpdate('hello', 'world')
  await fetch(`${base}/api/sync/${ROOM}`, {
    method: 'POST',
    headers: {...headers, 'content-type': 'application/json'},
    body: JSON.stringify({u: update, c: 'A'}),
  })

  const onB = Frame.parse(await readerB.next(5000))
  expect(onB.o).toBe('A')
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array(Buffer.from(onB.u, 'base64')))
  expect(doc.getMap('data').get('hello')).toBe('world')

  expect(await readerA.next(1500)).toBeNull()
})
