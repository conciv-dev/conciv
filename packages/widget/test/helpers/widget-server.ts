import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// The built widget global bundle the ITs inject into the page (real bundle, not a mock).
export const widgetBundle = fs.readFileSync(path.join(dirname, '../../dist/conciv-widget.global.js'), 'utf8')

function writeJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {'content-type': 'application/json', 'access-control-allow-origin': '*'})
  res.end(JSON.stringify(body))
}

// Stub the conciv dev-server routes the widget probes on mount, and serve `html` as the document.
// A real http server (no mocks); returns its base URL + a close fn. Shared by the widget ITs.
export async function startWidgetServer(html: string): Promise<{base: string; close: () => Promise<void>}> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? ''
    if (url.startsWith('/api/chat/session/resolve') && req.method === 'POST') {
      return writeJson(res, {sessionId: 'conciv_new_1'})
    }
    if (url.startsWith('/api/chat/session') && !url.startsWith('/api/chat/sessions')) {
      return writeJson(res, {
        sessionId: 'conciv_new_1',
        harnessSessionId: null,
        name: null,
        origin: 'chat',
        cwd: '/app',
        lock: {held: false, role: null},
        usage: null,
        harness: {id: 'claude', name: 'Claude', canLaunch: false},
      })
    }
    if (url.startsWith('/api/chat/models')) {
      return writeJson(res, {
        models: [{id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced', group: 'Claude'}],
        defaultModel: 'sonnet',
        harness: {id: 'claude', name: 'Claude', canLaunch: false},
      })
    }
    if (url.startsWith('/api/chat/sessions')) return writeJson(res, {sessions: []})
    if (url.startsWith('/api/chat/history')) return writeJson(res, [])
    if (url === '/api/page/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      })
      return
    }
    res.writeHead(200, {'content-type': 'text/html'})
    res.end(html)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
