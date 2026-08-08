import {createReadStream, existsSync, statSync} from 'node:fs'
import {createServer, type Server} from 'node:http'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {listenLocal} from './listen-local.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.join(dirname, '../../dist')

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
