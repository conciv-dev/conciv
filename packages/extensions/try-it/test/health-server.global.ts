import {createServer, type ServerResponse} from 'node:http'
import {CONNECT_LAST_PORT} from '@conciv/protocol/connect-ports'
import type {TestProject} from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext {
    armBase: string
  }
}

const ARM_PREFIX = '/arm/'
const PROBES_PREFIX = '/probes/'
const HEALTH_SUFFIX = '/health'
const TOKEN_PREFIX = '/t/'

type Ledger = {armed: Set<string>; probes: Map<string, number>}

function tokenOf(url: string, prefix: string, suffix: string): string | null {
  if (!url.startsWith(prefix) || !url.endsWith(suffix)) return null
  return url.slice(prefix.length, url.length - suffix.length)
}

function arm(url: string, ledger: Ledger, response: ServerResponse): boolean {
  const token = tokenOf(url, ARM_PREFIX, '')
  if (token === null) return false
  ledger.armed.add(token)
  response.writeHead(204)
  response.end()
  return true
}

function report(url: string, ledger: Ledger, response: ServerResponse): boolean {
  const token = tokenOf(url, PROBES_PREFIX, '')
  if (token === null) return false
  response.writeHead(200, {'content-type': 'application/json'})
  response.end(JSON.stringify({probes: ledger.probes.get(token) ?? 0}))
  return true
}

function health(url: string, ledger: Ledger, response: ServerResponse): boolean {
  const token = tokenOf(url, TOKEN_PREFIX, HEALTH_SUFFIX)
  if (token === null) return false
  ledger.probes.set(token, (ledger.probes.get(token) ?? 0) + 1)
  if (!ledger.armed.has(token)) return false
  response.writeHead(200)
  response.end('ok')
  return true
}

const ROUTES = [arm, report, health]

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const ledger: Ledger = {armed: new Set(), probes: new Map()}
  const server = createServer((request, response) => {
    const url = request.url ?? ''
    response.setHeader('access-control-allow-origin', '*')
    if (ROUTES.some((route) => route(url, ledger, response))) return
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(CONNECT_LAST_PORT, '127.0.0.1', resolve))
  project.provide('armBase', `http://127.0.0.1:${CONNECT_LAST_PORT}`)
  return () => new Promise<void>((resolve) => server.close(() => resolve()))
}
