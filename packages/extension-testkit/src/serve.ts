import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {extname, join, normalize} from 'node:path'
import getPort from 'get-port'

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export type ServedHost = {origin: string; close: () => Promise<void>}

export async function serveDir(dir: string, config: {apiBase: string; session: string}): Promise<ServedHost> {
  const port = await getPort()
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    const rel =
      path === '/'
        ? 'index.html'
        : normalize(path)
            .replace(/^(\.\.[/\\])+/, '')
            .replace(/^\//, '')
    readFile(join(dir, rel))
      .then((buffer) => {
        if (rel.endsWith('.html')) {
          const html = buffer
            .toString('utf8')
            .replaceAll('__CONCIV_API_BASE__', config.apiBase)
            .replaceAll('__CONCIV_SESSION__', config.session)
          res.setHeader('content-type', 'text/html')
          res.end(html)
          return
        }
        res.setHeader('content-type', MIME[extname(rel)] ?? 'application/octet-stream')
        res.end(buffer)
      })
      .catch(() => {
        res.statusCode = 404
        res.end('not found')
      })
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
