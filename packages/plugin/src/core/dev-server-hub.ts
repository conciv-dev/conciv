import type {IncomingMessage} from 'node:http'
import {BlockList, isIPv6} from 'node:net'
import type {Engine} from '@conciv/core/start'

export const HUB_PATH = '/__conciv'

const LOOPBACK = new BlockList()
LOOPBACK.addSubnet('127.0.0.0', 8, 'ipv4')
LOOPBACK.addAddress('::1', 'ipv6')

type HubProxy = {
  pathFilter: (pathname: string, request: IncomingMessage) => boolean
  router: () => Promise<string>
  ws: true
}

type DevServerOptions = {devServer?: false | {proxy?: unknown}}

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  return LOOPBACK.check(address, isIPv6(address) ? 'ipv6' : 'ipv4')
}

export function isHubPath(pathname: string | undefined): boolean {
  if (!pathname) return false
  return pathname === HUB_PATH || pathname.startsWith(`${HUB_PATH}/`) || pathname.startsWith(`${HUB_PATH}?`)
}

function hubProxy(engine: () => Promise<Engine>): HubProxy {
  return {
    pathFilter: (pathname, request) => isHubPath(pathname) && isLoopback(request.socket.remoteAddress),
    router: async () => (await engine()).apiBase,
    ws: true,
  }
}

export function forwardDevServerHub(options: DevServerOptions, engine: () => Promise<Engine>): void {
  const devServer = options.devServer
  if (devServer === false) return
  const proxy = Array.isArray(devServer?.proxy) ? devServer.proxy : []
  options.devServer = {...devServer, proxy: [hubProxy(engine), ...proxy]}
}
