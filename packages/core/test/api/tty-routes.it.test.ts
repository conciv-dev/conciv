import {randomUUID} from 'node:crypto'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {H3} from 'h3'
import {serve} from 'srvx'
import WebSocket from 'ws'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {registerTtyRoutes} from '../../src/api/tty/tty.js'
import {attachWebSocket} from '../../src/api/ws.js'
import {originAllowed} from '../../src/api/cors.js'
import {createFsSessionStore} from '../../src/store/session-store.js'
import {acquireLock, releaseLock} from '../../src/store/lock.js'

const BASH_TTY = {
  id: 'test-tty',
  tty: {
    command: () => ({bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}}),
  },
  release: () => {},
}

const until = async (cond: () => boolean, ms = 8000): Promise<void> => {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 25))
  }
}

type Client = {ws: WebSocket; received: string[]; controls: string[]}

function connect(wsBase: string, sessionId: string, params = ''): Promise<Client> {
  const ws = new WebSocket(`${wsBase}/api/tty?session=${sessionId}${params}`)
  const client: Client = {ws, received: [], controls: []}
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      client.received.push(new TextDecoder().decode(data as Buffer))
      return
    }
    client.controls.push(String(data))
  })
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(client))
    ws.on('error', reject)
  })
}

describe('tty routes', () => {
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-tty-'))
  const sessionId = `conciv_${randomUUID()}`
  const headers = {[CONCIV_SESSION_HEADER]: sessionId, 'content-type': 'application/json'}
  const ctx: {base: string; wsBase: string; close: () => Promise<void>} = {base: '', wsBase: '', close: async () => {}}

  beforeAll(async () => {
    const app = new H3()
    const store = createFsSessionStore({stateRoot})
    const guard = (origin: string | null) => originAllowed(origin, new Set())
    const routes = registerTtyRoutes(app, {cwd: process.cwd(), stateRoot, harness: BASH_TTY, store})
    const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
    await server.ready()
    attachWebSocket(server, app, guard)
    ctx.base = new URL(server.url ?? '').origin
    ctx.wsBase = ctx.base.replace('http', 'ws')
    ctx.close = async () => {
      routes.dispose()
      await server.close(true)
    }
  })

  afterAll(() => ctx.close())

  it('mode defaults to chat', async () => {
    const res = await fetch(`${ctx.base}/api/chat/mode`, {headers})
    expect(await res.json()).toEqual({mode: 'chat'})
  })

  it('rejects terminal mode while the chat lock is held', async () => {
    acquireLock(stateRoot, sessionId, 'chat', process.pid)
    const res = await fetch(`${ctx.base}/api/chat/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({mode: 'terminal'}),
    })
    expect(res.status).toBe(409)
    releaseLock(stateRoot, sessionId)
  })

  it('switches to terminal and streams pty bytes over ws', async () => {
    const set = await fetch(`${ctx.base}/api/chat/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({mode: 'terminal'}),
    })
    expect(set.status).toBe(200)
    expect(await set.json()).toEqual({mode: 'terminal'})

    const client = await connect(ctx.wsBase, sessionId, '&cols=100&rows=30')
    client.ws.send('echo ws-roundtrip-$((40+2))\r')
    await until(() => client.received.join('').includes('ws-roundtrip-42'))

    client.ws.send(JSON.stringify({type: 'resize', cols: 91, rows: 27}))
    client.ws.send('stty size\r')
    await until(() => client.received.join('').includes('27 91'))
    client.ws.close()
  })

  it('replays buffered bytes on reconnect', async () => {
    const client = await connect(ctx.wsBase, sessionId)
    await until(() => client.received.join('').includes('ws-roundtrip-42'))
    client.ws.close()
  })

  it('rejects ws for a session not in terminal mode', async () => {
    const other = `conciv_${randomUUID()}`
    const ws = new WebSocket(`${ctx.wsBase}/api/tty?session=${other}`)
    const code = await new Promise<number>((resolve, reject) => {
      ws.on('close', (c) => resolve(c))
      ws.on('error', reject)
    })
    expect(code).toBe(4404)
  })

  it('returns to chat mode and kills the pty', async () => {
    const set = await fetch(`${ctx.base}/api/chat/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({mode: 'chat'}),
    })
    expect(set.status).toBe(200)
    const res = await fetch(`${ctx.base}/api/chat/mode`, {headers})
    expect(await res.json()).toEqual({mode: 'chat'})
    const ws = new WebSocket(`${ctx.wsBase}/api/tty?session=${sessionId}`)
    const code = await new Promise<number>((resolve, reject) => {
      ws.on('close', (c) => resolve(c))
      ws.on('error', reject)
    })
    expect(code).toBe(4404)
  })

  it('records the minted harness session id for later chat resume', async () => {
    const store = createFsSessionStore({stateRoot})
    const record = await store.get(sessionId)
    expect(record?.harnessSessionId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
