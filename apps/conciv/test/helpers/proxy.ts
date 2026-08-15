import {createServer, request as httpRequest, type IncomingMessage, type Server} from 'node:http'
import type {Duplex} from 'node:stream'
import {listenLocal} from './listen-local.js'

export type ProxyCore = {
  base: string
  port: number
  requestCount: (pathname?: string) => number
  wsConnectionCount: () => number
  fail: (pathname: string) => void
  repair: () => void
  close: () => Promise<void>
}

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
  const server: Server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', target).pathname
    seen.push(pathname)
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
