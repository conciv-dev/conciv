import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import react from '@vitejs/plugin-react'
import {createLogger, createServer, type Connect, type Plugin, type ViteDevServer} from 'vite'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {unplugin} from '../../../src/plugin-instance.js'

export type DesignConfigInput = NonNullable<ConcivConfig['extensions']>['design']

export async function serveDesignHost(input: {
  stateRoot: string
  homeDir: string
  devEndpointDir: string
  config?: DesignConfigInput
  print: (line: string) => void
}): Promise<{server: ViteDevServer; origin: string}> {
  const server = await createServer({
    root: HOST_ROOT,
    configFile: false,
    customLogger: {...createLogger('silent'), info: (message) => input.print(message)},
    server: {host: '127.0.0.1', port: 0},
    resolve: {alias: {'@app': join(HOST_ROOT, 'src')}},
    plugins: [
      slowFiles(),
      react(),
      unplugin.vite({
        stateRoot: input.stateRoot,
        harnessBin: 'true',
        systemPrompt: false,
        devEndpointDir: input.devEndpointDir,
        homeDir: input.homeDir,
        extensions: {design: input.config ?? {}},
      }),
    ],
  })
  await server.listen()
  const local = server.resolvedUrls?.local[0]
  if (local === undefined) throw new Error('the fixture dev server has no local url')
  return {server, origin: new URL(local).origin}
}

export const HOST_ROOT = fileURLToPath(new URL('host/', import.meta.url))
const DELAYS = [
  {prefix: '/slow/', ms: 3000},
  {prefix: '/late/', ms: 1000},
]

function slowFiles(): Plugin {
  return {
    name: 'conciv-it-slow-files',
    configureServer: (server) => {
      server.middlewares.use(slowly)
    },
  }
}

function slowly(request: Connect.IncomingMessage, _response: unknown, next: () => void): void {
  const url = request.url ?? ''
  const delay = DELAYS.find((entry) => url.startsWith(entry.prefix))
  if (delay === undefined) return next()
  request.url = url.slice(delay.prefix.length - 1)
  setTimeout(next, delay.ms)
}
