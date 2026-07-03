import {randomUUID} from 'node:crypto'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import WebSocket from 'ws'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {startTerminalServer, type TerminalTestServer} from './helpers.js'

const until = async (cond: () => boolean, ms = 8000): Promise<void> => {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 25))
  }
}

type Client = {ws: WebSocket; received: string[]; controls: string[]}

function connect(wsBase: string, sessionId: string, params = ''): Promise<Client> {
  const ws = new WebSocket(`${wsBase}/api/ext/terminal/tty?session=${sessionId}${params}`)
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

describe('terminal extension routes', () => {
  const sessionId = `conciv_${randomUUID()}`
  const headers = {[CONCIV_SESSION_HEADER]: sessionId, 'content-type': 'application/json'}
  const ctx: {server?: TerminalTestServer} = {}
  const base = () => ctx.server?.base ?? ''
  const wsBase = () => ctx.server?.wsBase ?? ''

  beforeAll(async () => {
    ctx.server = await startTerminalServer()
  })

  afterAll(() => ctx.server?.close())

  it('reports no live terminal before open', async () => {
    const res = await fetch(`${base()}/api/ext/terminal/state`, {headers})
    expect(await res.json()).toEqual({alive: false, busy: false})
  })

  it('rejects open while the chat lock is held', async () => {
    ctx.server?.sessions.busy.add(sessionId)
    const res = await fetch(`${base()}/api/ext/terminal/open`, {method: 'POST', headers, body: JSON.stringify({})})
    expect(res.status).toBe(409)
    ctx.server?.sessions.busy.delete(sessionId)
  })

  it('opens a pty and streams bytes over ws', async () => {
    const open = await fetch(`${base()}/api/ext/terminal/open`, {method: 'POST', headers, body: JSON.stringify({})})
    expect(open.status).toBe(200)
    expect(await open.json()).toEqual({alive: true})

    const state = await fetch(`${base()}/api/ext/terminal/state`, {headers})
    expect(((await state.json()) as {alive: boolean}).alive).toBe(true)

    const client = await connect(wsBase(), sessionId, '&cols=100&rows=30')
    client.ws.send('echo ws-roundtrip-$((40+2))\r')
    await until(() => client.received.join('').includes('ws-roundtrip-42'))

    client.ws.send(JSON.stringify({type: 'resize', cols: 91, rows: 27}))
    client.ws.send('stty size\r')
    await until(() => client.received.join('').includes('27 91'))
    client.ws.close()
  })

  it('replays buffered bytes on reconnect', async () => {
    const client = await connect(wsBase(), sessionId)
    await until(() => client.received.join('').includes('ws-roundtrip-42'))
    client.ws.close()
  })

  it('rejects ws for a session with no live pty', async () => {
    const other = `conciv_${randomUUID()}`
    const ws = new WebSocket(`${wsBase()}/api/ext/terminal/tty?session=${other}`)
    const code = await new Promise<number>((resolve, reject) => {
      ws.on('close', (c) => resolve(c))
      ws.on('error', reject)
    })
    expect(code).toBe(4404)
  })

  it('close kills the pty and later ws connects are refused', async () => {
    const res = await fetch(`${base()}/api/ext/terminal/close`, {method: 'POST', headers, body: JSON.stringify({})})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({alive: false})

    const state = await fetch(`${base()}/api/ext/terminal/state`, {headers})
    expect(await state.json()).toEqual({alive: false, busy: false})

    const ws = new WebSocket(`${wsBase()}/api/ext/terminal/tty?session=${sessionId}`)
    const code = await new Promise<number>((resolve, reject) => {
      ws.on('close', (c) => resolve(c))
      ws.on('error', reject)
    })
    expect(code).toBe(4404)
  })

  it('records the minted harness session token for later chat resume', () => {
    expect(ctx.server?.sessions.tokens.get(sessionId)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects open when the harness has no tty command', async () => {
    const bare = await startTerminalServer({id: 'no-tty'})
    try {
      const res = await fetch(`${bare.base}/api/ext/terminal/open`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    } finally {
      await bare.close()
    }
  })
})
