import {describe, it, expect, afterEach} from 'vitest'
import {request as httpRequest} from 'node:http'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {serveApp, type ServedApp} from '@conciv/harness-testkit'
import {makeApp} from '../../src/app.js'
import type {AppType} from '../../src/app.js'
import {resolveConfig} from '../../src/config.js'

const dirs: string[] = []

const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'loopback-guard-test', version: '0'}},
})

const MCP_HEADERS = {'content-type': 'application/json', accept: 'application/json, text/event-stream'}

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-mcp-host-'))
  dirs.push(dir)
  return dir
}

function cleanDirs(): void {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
}

async function makeCoreApp(): Promise<AppType> {
  const root = tmp()
  const {app} = await makeApp({cfg: resolveConfig({}, root), cwd: root, openInEditor: () => {}})
  return app
}

type Reply = {status: number; body: string}

function postMcpOverHttp(port: number, host: string): Promise<Reply> {
  const headers = {...MCP_HEADERS, host, 'content-length': String(Buffer.byteLength(INITIALIZE))}
  return new Promise<Reply>((resolve, reject) => {
    const req = httpRequest(
      {hostname: '127.0.0.1', port, path: '/api/mcp', method: 'POST', setHost: false, headers},
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolve({status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8')}))
      },
    )
    req.on('error', reject)
    req.end(INITIALIZE)
  })
}

async function postMcpOnRoute(app: AppType, host?: string): Promise<Response> {
  const headers = host === undefined ? MCP_HEADERS : {...MCP_HEADERS, host}
  return app.request('http://127.0.0.1/api/mcp', {method: 'POST', headers, body: INITIALIZE})
}

describe('/api/mcp loopback host guard (IT, real http)', () => {
  const state: {served: ServedApp | undefined} = {served: undefined}

  afterEach(async () => {
    await state.served?.close()
    state.served = undefined
    cleanDirs()
  })

  async function serve(): Promise<ServedApp> {
    const served = await serveApp((await makeCoreApp()).fetch)
    state.served = served
    return served
  }

  it('accepts the loopback authority the server is bound to', async () => {
    const served = await serve()
    const reply = await postMcpOverHttp(served.port, `127.0.0.1:${served.port}`)
    expect(reply.status).toBe(200)
    expect(reply.body).toContain('conciv')
  }, 15_000)

  it('rejects a hostile Host with no Origin, naming the host as the failed check', async () => {
    const served = await serve()
    const reply = await postMcpOverHttp(served.port, `evil.com:${served.port}`)
    expect(reply.status).toBe(403)
    expect(reply.body).toBe('forbidden host')
    expect(reply.body).not.toContain('origin')
  }, 15_000)

  it('accepts the bracketed IPv6 loopback authority on any port', async () => {
    const served = await serve()
    const bound = await postMcpOverHttp(served.port, `[::1]:${served.port}`)
    expect(bound.status).toBe(200)
    expect(bound.body).toContain('conciv')
    const other = await postMcpOverHttp(served.port, '[::1]:65535')
    expect(other.status).toBe(200)
  }, 15_000)

  it('lets the transport rebinding guard reject a Host the outer guard normalized', async () => {
    const served = await serve()
    const reply = await postMcpOverHttp(served.port, `LOCALHOST:${served.port}`)
    expect(reply.status).toBe(403)
    expect(reply.body).toContain('Invalid Host header')
  }, 15_000)
})

describe('/api/mcp loopback host guard (route surface, hosts the wire cannot carry)', () => {
  afterEach(() => {
    cleanDirs()
  })

  it('rejects a request with no Host header', async () => {
    const res = await postMcpOnRoute(await makeCoreApp())
    expect(res.status).toBe(403)
  }, 15_000)

  it('rejects a Host whose authority carries a path past the loopback name', async () => {
    const res = await postMcpOnRoute(await makeCoreApp(), '127.0.0.1:4321/evil.com')
    expect(res.status).toBe(403)
  }, 15_000)

  it('rejects a Host with a second colon-separated segment past the port', async () => {
    const res = await postMcpOnRoute(await makeCoreApp(), '127.0.0.1:4321:evil.com')
    expect(res.status).toBe(403)
  }, 15_000)

  it('rejects a Host that hides a hostile authority behind loopback userinfo', async () => {
    const res = await postMcpOnRoute(await makeCoreApp(), `127.0.0.1@evil.com:4321`)
    expect(res.status).toBe(403)
  }, 15_000)

  it('rejects a Host whose loopback hostname is demoted to userinfo', async () => {
    const res = await postMcpOnRoute(await makeCoreApp(), `evil.com@127.0.0.1:4321`)
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('forbidden host')
  }, 15_000)
})
