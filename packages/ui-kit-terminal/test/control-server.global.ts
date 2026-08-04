import {createServer} from 'node:http'
import type {AddressInfo} from 'node:net'
import {WebSocketServer} from 'ws'
import type {TestProject} from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext {
    controlBase: string
  }
}

function isEmitRequest(value: unknown): value is {emit: unknown} {
  return typeof value === 'object' && value !== null && 'emit' in value
}

function isDropRequest(value: unknown): value is {drop: true} {
  return typeof value === 'object' && value !== null && 'drop' in value
}

function greetKey(url: string | undefined): string | null {
  return new URLSearchParams((url ?? '').split('?')[1] ?? '').get('greet')
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const http = createServer()
  const wss = new WebSocketServer({server: http})
  const opened = new Map<string, number>()
  wss.on('connection', (socket, request) => {
    const key = greetKey(request.url)
    if (key !== null) {
      const ordinal = (opened.get(key) ?? 0) + 1
      opened.set(key, ordinal)
      socket.send(Buffer.from(`${key}-${ordinal}\r\n`, 'utf8'))
    }
    socket.on('message', (raw) => {
      const text = raw.toString()
      try {
        const parsed: unknown = JSON.parse(text)
        if (isDropRequest(parsed)) {
          socket.close()
          return
        }
        if (isEmitRequest(parsed)) socket.send(JSON.stringify(parsed.emit))
      } catch {
        return
      }
    })
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const {port} = http.address() as AddressInfo
  project.provide('controlBase', `ws://127.0.0.1:${port}`)
  return async () => {
    wss.close()
    await new Promise<void>((resolve) => http.close(() => resolve()))
  }
}
