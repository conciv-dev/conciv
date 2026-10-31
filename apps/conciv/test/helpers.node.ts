import {type Server, createServer, request as httpRequest, type IncomingMessage} from 'node:http'
import type {Duplex} from 'node:stream'
import {createReadStream, existsSync, statSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import type {PersistedAttachment, RpcClient} from '@conciv/contract'

async function listenLocal(server: Server): Promise<{base: string; port: number; close: () => Promise<void>}> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.()
        server.close(() => resolve())
      }),
  }
}

const AWAIT_REQUEST_TIMEOUT_MS = 4000

export type AwaitRequestOptions = {since?: number; timeout?: number}

export type ProxyCore = {
  base: string
  port: number
  requestCount: (pathname?: string) => number
  wsConnectionCount: () => number
  mark: () => number
  awaitRequest: (pathname: string, options?: AwaitRequestOptions) => Promise<void>
  fail: (pathname: string) => void
  repair: () => void
  close: () => Promise<void>
}

type Completion = {pathname: string; at: number}

type Waiter = {pathname: string; since: number; deliver: () => void}

function handshakeResponse(upstream: IncomingMessage): string {
  const statusLine = `HTTP/1.1 ${upstream.statusCode ?? 101} ${upstream.statusMessage ?? 'Switching Protocols'}`
  const headers = upstream.rawHeaders.reduce<string[]>((lines, value, index) => {
    if (index % 2 === 1) return lines
    return [...lines, `${value}: ${upstream.rawHeaders[index + 1] ?? ''}`]
  }, [])
  return [statusLine, ...headers, '', ''].join('\r\n')
}

export async function proxyTo(targetBase: string, opts: {blockUpgrades?: boolean} = {}): Promise<ProxyCore> {
  const target = new URL(targetBase)
  const seen: string[] = []
  const refused = new Set<string>()
  let upgrades = 0
  const piped = new Set<Duplex>()
  const completions: Completion[] = []
  const waiters = new Set<Waiter>()
  const sequence = {next: 0}

  const settle = (pathname: string): void => {
    const at = (sequence.next += 1)
    completions.push({pathname, at})
    for (const waiter of waiters) {
      if (waiter.pathname !== pathname || at <= waiter.since) continue
      waiters.delete(waiter)
      waiter.deliver()
    }
  }

  const server: Server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', target).pathname
    seen.push(pathname)
    res.on('finish', () => settle(pathname))
    if (refused.has(pathname)) {
      res.writeHead(500, {'content-type': 'text/plain'})
      res.end('the proxied core refused the call')
      return
    }
    const proxyReq = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: {...req.headers, host: target.host},
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
        proxyRes.pipe(res)
      },
    )
    proxyReq.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    req.pipe(proxyReq)
  })
  server.on('upgrade', (req, clientSocket: Duplex, head: Buffer) => {
    upgrades += 1
    if (opts.blockUpgrades) {
      clientSocket.destroy()
      return
    }
    piped.add(clientSocket)
    clientSocket.on('close', () => piped.delete(clientSocket))
    const proxyReq = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: {...req.headers, host: target.host},
    })
    proxyReq.on('upgrade', (upstreamRes, upstreamSocket: Duplex, upstreamHead: Buffer) => {
      piped.add(upstreamSocket)
      upstreamSocket.on('close', () => piped.delete(upstreamSocket))
      clientSocket.write(handshakeResponse(upstreamRes))
      if (upstreamHead.length > 0) clientSocket.write(upstreamHead)
      if (head.length > 0) upstreamSocket.write(head)
      upstreamSocket.on('error', () => clientSocket.destroy())
      clientSocket.on('error', () => upstreamSocket.destroy())
      upstreamSocket.pipe(clientSocket)
      clientSocket.pipe(upstreamSocket)
    })
    proxyReq.on('error', () => clientSocket.destroy())
    proxyReq.end()
  })
  const {base, port, close} = await listenLocal(server)
  return {
    base,
    port,
    requestCount: (pathname) =>
      pathname === undefined ? seen.length : seen.filter((entry) => entry === pathname).length,
    wsConnectionCount: () => upgrades,
    mark: () => sequence.next,
    awaitRequest: (pathname, options = {}) => {
      const since = options.since ?? sequence.next
      if (completions.some((entry) => entry.pathname === pathname && entry.at > since)) return Promise.resolve()
      const timeoutMs = options.timeout ?? AWAIT_REQUEST_TIMEOUT_MS
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(waiter)
          reject(
            new Error(
              `no proxied request to ${pathname} completed within ${timeoutMs}ms (completed paths: ${completions.map((entry) => entry.pathname).join(', ')})`,
            ),
          )
        }, timeoutMs)
        const waiter: Waiter = {
          pathname,
          since,
          deliver: () => {
            clearTimeout(timer)
            resolve()
          },
        }
        waiters.add(waiter)
      })
    },
    fail: (pathname) => {
      refused.add(pathname)
    },
    repair: () => refused.clear(),
    close: async () => {
      for (const socket of piped) socket.destroy()
      piped.clear()
      await close()
    },
  }
}

const dirname = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.join(dirname, '../dist')

function isReadableFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile()
  } catch {
    return false
  }
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

export async function serveStandaloneApp(): Promise<{base: string; close: () => Promise<void>}> {
  if (!existsSync(path.join(distRoot, 'index.html'))) {
    throw new Error(`apps/conciv dist is missing at ${distRoot}; build @conciv/app before running this test`)
  }
  const server: Server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const requested = pathname === '/' ? '/index.html' : pathname
    const candidate = path.join(distRoot, requested)
    const filePath = isReadableFile(candidate) ? candidate : path.join(distRoot, 'index.html')
    const ext = path.extname(filePath)
    res.writeHead(200, {'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream'})
    createReadStream(filePath).pipe(res)
  })
  const {base, close} = await listenLocal(server)
  return {base, close}
}

export type SeededDraft = {text?: string; attachments?: PersistedAttachment[]}

export async function createSession(rpc: RpcClient): Promise<string> {
  const {sessionId} = await rpc.sessions.create()
  return sessionId
}

export async function seedDraft(rpc: RpcClient, sessionId: string, draft: SeededDraft): Promise<void> {
  const text = draft.text ?? ''
  await rpc.drafts.set({
    sessionId,
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
    attachments: draft.attachments ?? [],
  })
}
