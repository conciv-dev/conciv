import {randomUUID} from 'node:crypto'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import WebSocket from 'ws'
import {recordingHarness, startTerminalServer, type TerminalTestServer} from './helpers.js'
import {until} from '@conciv/harness-testkit'

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
  const ctx: {server?: TerminalTestServer} = {}
  const rpc = () => {
    if (!ctx.server) throw new Error('server not started')
    return ctx.server.rpc
  }
  const wsBase = () => ctx.server?.wsBase ?? ''

  beforeAll(async () => {
    ctx.server = await startTerminalServer()
  })

  afterAll(() => ctx.server?.close())

  it('reports no live terminal before open', async () => {
    expect(await rpc().state({sessionId})).toEqual({alive: false, busy: false})
  })

  it('rejects open while the chat lock is held', async () => {
    ctx.server?.sessions.busy.add(sessionId)
    await expect(rpc().open({sessionId})).rejects.toMatchObject({code: 'BUSY'})
    ctx.server?.sessions.busy.delete(sessionId)
  })

  it('opens a pty and streams bytes over ws', async () => {
    expect(await rpc().open({sessionId})).toEqual({alive: true})
    expect((await rpc().state({sessionId})).alive).toBe(true)

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

  it('open is idempotent while the pty is alive — buffer survives a re-open', async () => {
    expect(await rpc().open({sessionId})).toEqual({alive: true})
    const client = await connect(wsBase(), sessionId)
    await until(() => client.received.join('').includes('ws-roundtrip-42'))
    client.ws.close()
  })

  it('inject control frame writes a marker readable by a reconnecting socket', async () => {
    const client = await connect(wsBase(), sessionId)
    client.ws.send(JSON.stringify({type: 'inject', text: 'conciv says hi'}))
    await until(() => client.received.join('').includes('\r\nconciv says hi\r\n'))
    client.ws.close()
    const second = await connect(wsBase(), sessionId)
    await until(() => second.received.join('').includes('\r\nconciv says hi\r\n'))
    second.ws.close()
  })

  it('a chat turn on the session kills the pty', async () => {
    ctx.server?.sessions.fireChatTurn(sessionId)
    const ws = new WebSocket(`${wsBase()}/api/ext/terminal/tty?session=${sessionId}`)
    const code = await new Promise<number>((resolve, reject) => {
      ws.on('close', (c) => resolve(c))
      ws.on('error', reject)
    })
    expect(code).toBe(4404)

    expect(await rpc().open({sessionId})).toEqual({alive: true})
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
    expect(await rpc().close({sessionId})).toEqual({alive: false})
    expect(await rpc().state({sessionId})).toEqual({alive: false, busy: false})

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

  it('spawns with model override, conciv mcp url, and session id', async () => {
    const {harness, captured} = recordingHarness()
    const dedicated = await startTerminalServer(harness)
    try {
      expect(await dedicated.rpc.open({sessionId, model: 'claude-x'})).toEqual({alive: true})
      expect(captured).toHaveLength(1)
      expect(captured[0]?.model).toBe('claude-x')
      expect(captured[0]?.mcpUrl).toMatch(/\/api\/mcp$/)
      expect(captured[0]?.concivSessionId).toBe(sessionId)
    } finally {
      await dedicated.close()
    }
  })

  it('injects a resumed marker when reopening an existing transcript', async () => {
    const {harness} = recordingHarness()
    const dedicated = await startTerminalServer({...harness, transcriptExists: () => true})
    try {
      dedicated.sessions.tokens.set(sessionId, randomUUID())
      expect(await dedicated.rpc.open({sessionId})).toEqual({alive: true})
      const wsBaseUrl = dedicated.wsBase
      const client = await connect(wsBaseUrl, sessionId)
      await until(() => client.received.join('').includes('— conciv: resumed session —'))
      client.ws.close()
    } finally {
      await dedicated.close()
    }
  })

  it('rejects open when the harness has no tty command', async () => {
    const bare = await startTerminalServer({id: 'no-tty'})
    try {
      await expect(bare.rpc.open({sessionId})).rejects.toMatchObject({code: 'NO_TTY'})
    } finally {
      await bare.close()
    }
  })
})
