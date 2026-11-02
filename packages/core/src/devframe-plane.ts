import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import type {Duplex} from 'node:stream'
import type {IncomingMessage} from 'node:http'
import type {ConcivPlugin} from '@conciv/extension'
import {CONCIV_HOST_SERVICE, type ConcivHost} from '@conciv/extension/devframe-host'
import type {ClaimUpgrade} from '@conciv/serve'
import {initHub, type HubInstance} from '@devframes/hub/initiate'
import {AsyncQueuer} from '@tanstack/pacer'
import type {DevframePtyTerminalSession, DevframeTerminalSession} from '@devframes/hub/types'
import {createMessagesDevframe} from '@devframes/plugin-messages'
import {createTerminalsDevframe} from '@devframes/plugin-terminals'
import {defineDevframe, type DevframeDefinition} from 'devframe'
import type {DevframeAuthHandler} from 'devframe/node/auth'
import type {DevframeNodeContext} from 'devframe/types'
import {createInteractiveAuth} from 'devframe/recipes/interactive-auth'
import type {z} from 'zod'
import {logError} from './lib/debug.js'

const HUB_BASE = '/__conciv/'

export type PublishedGroup = 'sessions'

export type Publish = (group: PublishedGroup) => Promise<void>

export type CoreFunction = Parameters<DevframeNodeContext['rpc']['register']>[0]

export type ServerFunctionsOf<Definitions extends readonly unknown[]> = {
  [
    Definition in Definitions[number] as Definition extends {name: infer Name extends string} ? Name : never
  ]: Definition extends {args: readonly [infer Input extends z.ZodType]; returns: infer Output extends z.ZodType}
    ? (input: z.input<Input>) => Promise<z.output<Output>>
    : never
}

export type DevframePlaneOpts = {
  stateDir: string
  cwd: string
  host: ConcivHost
  published: Record<PublishedGroup, () => Promise<object>>
  functions: (publish: Publish) => readonly CoreFunction[]
  plugins?: readonly ConcivPlugin[]
  devframes?: readonly DevframeDefinition[]
  loginToken?: string
  allowedOrigins?: readonly string[]
}

export type DevframePlane = {
  hub: HubInstance
  claimUpgrade: ClaimUpgrade
  loginToken: string
  publish: Publish
  close: () => Promise<void>
}

type PublishRequest = {group: PublishedGroup; done: PromiseWithResolvers<void>}

function coreDevframe(opts: DevframePlaneOpts, publish: Publish): DevframeDefinition {
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
      opts.functions(publish).forEach((definition) => ctx.rpc.register(definition))
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

async function publishGroup(
  hub: HubInstance,
  published: DevframePlaneOpts['published'],
  group: PublishedGroup,
): Promise<void> {
  try {
    const context = await hub.context
    const value = await published[group]()
    const state = await context.rpc.sharedState.get(`conciv:${group}`, {initialValue: value})
    state.mutate(() => value)
  } catch (error) {
    logError(`[core] publishing ${group} to the hub failed: ${String(error)}`)
  }
}

export function makeDevframePlane(opts: DevframePlaneOpts): DevframePlane {
  const auth = unfilledAuth()
  const loginToken = opts.loginToken ?? randomUUID()
  const queue = new AsyncQueuer<PublishRequest>(
    async (request) => {
      await publishGroup(hub, opts.published, request.group)
      request.done.resolve()
    },
    {concurrency: 1},
  )
  const publish: Publish = (group) => {
    const done = Promise.withResolvers<void>()
    if (!queue.addItem({group, done})) done.resolve()
    return done.promise
  }
  const hub = initHub({
    name: 'conciv',
    base: HUB_BASE,
    cwd: opts.cwd,
    mcp: false,
    devframes: [
      coreDevframe(opts, publish),
      createMessagesDevframe(),
      createTerminalsDevframe(),
      ...(opts.plugins ?? []).map((plugin) => plugin.devframe),
      ...(opts.devframes ?? []),
    ],
    auth,
    allowedOrigins: opts.allowedOrigins,
    getStorageDir: (scope) => join(opts.stateDir, 'devframe', scope),
    configure(ctx) {
      Object.assign(auth, createInteractiveAuth(ctx, {clientAuthTokens: [loginToken]}))
    },
  })
  return {
    hub,
    claimUpgrade: claimHubUpgrade(hub),
    loginToken,
    publish,
    close: async () => {
      await stopHubSessions(hub)
      await hub.close()
    },
  }
}
