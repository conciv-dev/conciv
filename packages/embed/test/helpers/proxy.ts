import {createServer, request as httpRequest, type Server} from 'node:http'
import {listenLocal} from './host.js'

export type ProxyCore = {
  base: string
  port: number
  requestCount: () => number
  close: () => Promise<void>
}

export async function proxyTo(targetBase: string): Promise<ProxyCore> {
  const target = new URL(targetBase)
  let count = 0
  const server: Server = createServer((req, res) => {
    count += 1
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
  const {base, port, close} = await listenLocal(server)
  return {base, port, requestCount: () => count, close}
}
