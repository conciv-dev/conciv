import {join} from 'node:path'
import type {Duplex} from 'node:stream'
import type {IncomingMessage} from 'node:http'
import type {ConcivPlugin} from '@conciv/extension'
import {CONCIV_HOST_SERVICE, type ConcivHost} from '@conciv/extension/devframe-host'
import type {ClaimUpgrade} from '@conciv/serve'
import {initHub, type HubInstance} from '@devframes/hub/initiate'
import type {DevframePtyTerminalSession, DevframeTerminalSession} from '@devframes/hub/types'
import {createMessagesDevframe} from '@devframes/plugin-messages'
import {createTerminalsDevframe} from '@devframes/plugin-terminals'
import {defineDevframe, type DevframeDefinition} from 'devframe'
import type {DevframeAuthHandler} from 'devframe/node/auth'
import {createInteractiveAuth} from 'devframe/recipes/interactive-auth'
import {isInheritedToken} from './devframe-trust.js'

const HUB_BASE = '/__conciv/'

export type DevframePlaneOpts = {
  stateDir: string
  cwd: string
  host: ConcivHost
  plugins?: readonly ConcivPlugin[]
  devframes?: readonly DevframeDefinition[]
  loginToken: string
  allowedOrigins?: readonly string[]
}

export type DevframePlane = {
  hub: HubInstance
  claimUpgrade: ClaimUpgrade
  close: () => Promise<void>
}

function coreDevframe(opts: DevframePlaneOpts): DevframeDefinition {
  return defineDevframe({
    id: 'conciv',
    name: 'conciv',
    version: '0.0.0',
    packageName: '@conciv/core',
    homepage: 'https://conciv.dev',
    description: 'conciv engine',
    importMetaUrl: import.meta.url,
    services: [{package: '@devframes/service-open', options: {roots: [opts.cwd]}}],
    setup(ctx) {
      ctx.services.provide(CONCIV_HOST_SERVICE, opts.host)
    },
  })
}

function unfilledAuth(): DevframeAuthHandler {
  return {
    rpcFunctions: [],
    authorize: () => false,
    onConnect: () => {},
    printBanner: () => {},
    buildOpenUrl: (url) => url,
  }
}

function claimHubUpgrade(hub: HubInstance): ClaimUpgrade {
  const socketPath = `${hub.base}__ws`
  return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url?.split('?')[0] !== socketPath) return false
    hub.handleUpgrade(req, socket, head)
    return true
  }
}

function isRunnableSession(session: DevframeTerminalSession): session is DevframePtyTerminalSession {
  return 'terminate' in session
}

async function stopHubSessions(hub: HubInstance): Promise<void> {
  const context = await hub.context
  const live = [...context.terminals.sessions.values()].filter(isRunnableSession)
  await Promise.allSettled(live.map((session) => session.terminate()))
}

export function makeDevframePlane(opts: DevframePlaneOpts): DevframePlane {
  const auth = unfilledAuth()
  const hub = initHub({
    name: 'conciv',
    base: HUB_BASE,
    cwd: opts.cwd,
    mcp: false,
    devframes: [
      coreDevframe(opts),
      createMessagesDevframe(),
      createTerminalsDevframe(),
      ...(opts.plugins ?? []).map((plugin) => plugin.devframe),
      ...(opts.devframes ?? []),
    ],
    auth,
    allowedOrigins: opts.allowedOrigins,
    getStorageDir: (scope) => join(opts.stateDir, 'devframe', scope),
    configure(ctx) {
      const interactive = createInteractiveAuth(ctx, {clientAuthTokens: [opts.loginToken]})
      const guarded: DevframeAuthHandler = {
        ...interactive,
        authorize: (method, session) =>
          interactive.authorize(method, session) && !isInheritedToken(ctx, session.meta.clientAuthToken),
      }
      Object.assign(auth, guarded)
    },
  })
  return {
    hub,
    claimUpgrade: claimHubUpgrade(hub),
    close: async () => {
      await stopHubSessions(hub)
      await hub.close()
    },
  }
}
