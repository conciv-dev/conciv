import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'

export function writeJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {'content-type': 'application/json', 'access-control-allow-origin': '*'})
  res.end(JSON.stringify(body))
}

export function writeSse(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
  })
}

const sessionPayload = (sessionId: string) => ({
  sessionId,
  harnessSessionId: null,
  name: null,
  origin: 'chat',
  cwd: '/app',
  lock: {held: false, role: null},
  usage: null,
  harness: {id: 'claude', name: 'Claude', canLaunch: false},
})

const modelsPayload = {
  models: [{id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced', group: 'Claude'}],
  defaultModel: 'sonnet',
  harness: {id: 'claude', name: 'Claude', canLaunch: false},
}

export type ChatFixtureOptions = {
  sessionId: string
  pageHtml: () => string
  routes?: (req: IncomingMessage, res: ServerResponse, url: string) => boolean
}

function handleCommon(req: IncomingMessage, res: ServerResponse, url: string, opts: ChatFixtureOptions): void {
  if (url.startsWith('/api/chat/session/resolve') && req.method === 'POST') {
    return writeJson(res, {sessionId: opts.sessionId})
  }
  if (url.startsWith('/api/chat/session') && !url.startsWith('/api/chat/sessions')) {
    return writeJson(res, sessionPayload(opts.sessionId))
  }
  if (url.startsWith('/api/chat/sessions')) return writeJson(res, {sessions: []})
  if (url.startsWith('/api/chat/models')) return writeJson(res, modelsPayload)
  if (url.startsWith('/api/chat/commands')) return writeJson(res, {commands: []})
  if (url.startsWith('/api/chat/tools')) return writeJson(res, {tools: []})
  if (url === '/api/page/stream') return writeSse(res)
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
  res.end(opts.pageHtml())
}

export async function makeChatFixtureServer(opts: ChatFixtureOptions): Promise<{server: Server; base: string}> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? ''
    if (opts.routes?.(req, res, url)) return
    handleCommon(req, res, url, opts)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {server, base}
}
