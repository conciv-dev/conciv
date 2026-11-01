import type {IncomingMessage} from 'node:http'
import {BlockList, isIPv6} from 'node:net'
import type {Engine} from '@conciv/core/start'

const HUB_BASE = '/__conciv'
const LOOPBACK = new BlockList()
LOOPBACK.addSubnet('127.0.0.0', 8, 'ipv4')
LOOPBACK.addAddress('::1', 'ipv6')

type HubProxy = {
  pathFilter: (pathname: string, request: IncomingMessage) => boolean
  router: () => Promise<string>
  ws: true
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  return LOOPBACK.check(address, isIPv6(address) ? 'ipv6' : 'ipv4')
}

export function hubProxy(engine: () => Promise<Engine>): HubProxy {
  return {
    pathFilter: (pathname, request) =>
      (pathname === HUB_BASE || pathname.startsWith(`${HUB_BASE}/`)) && isLoopback(request.socket.remoteAddress),
    router: async () => `http://127.0.0.1:${(await engine()).port}`,
    ws: true,
  }
}
