import {fork, type ChildProcess} from 'node:child_process'
import {join} from 'node:path'
import {z} from 'zod'
import type {RpcSocketEndpoint, RpcSocketRoute, RpcSocketSource} from './rpc-socket.js'

const FrameSchema = z.union([z.string(), z.instanceof(Buffer)])

const SideSchema = z.enum(['page', 'engine'])

export const EngineCallSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('reply'), text: z.string()}),
  z.object({kind: z.literal('hold')}),
  z.object({kind: z.literal('release')}),
  z.object({kind: z.literal('session')}),
  z.object({kind: z.literal('offline')}),
  z.object({kind: z.literal('online')}),
  z.object({kind: z.literal('pause')}),
  z.object({kind: z.literal('resume')}),
  z.object({kind: z.literal('stop')}),
  z.object({kind: z.literal('listen'), socket: z.number()}),
  z.object({kind: z.literal('connect'), socket: z.number()}),
  z.object({kind: z.literal('send'), side: SideSchema, socket: z.number(), message: FrameSchema}),
  z.object({
    kind: z.literal('close'),
    side: SideSchema,
    socket: z.number(),
    code: z.number().optional(),
    reason: z.string().optional(),
  }),
])

export type EngineCall = z.infer<typeof EngineCallSchema>

export type ProxySide = z.infer<typeof SideSchema>

export type ProxyFrame = z.infer<typeof FrameSchema>

const ProxyEventSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('open'), socket: z.number(), url: z.string()}),
  z.object({kind: z.literal('message'), side: SideSchema, socket: z.number(), message: FrameSchema}),
  z.object({kind: z.literal('closed'), side: SideSchema, socket: z.number(), code: z.number(), reason: z.string()}),
])

export type ProxyEvent = z.infer<typeof ProxyEventSchema>

const ProxyEventMessageSchema = z.object({event: ProxyEventSchema})

const EngineAnswerSchema = z.discriminatedUnion('ok', [
  z.object({id: z.number(), ok: z.literal(true), value: z.unknown().optional()}),
  z.object({id: z.number(), ok: z.literal(false), error: z.string()}),
])

const EngineReadySchema = z.object({apiBase: z.string(), token: z.string(), proxyBase: z.string()})

export type EngineProcess = {
  apiBase: string
  token: string
  proxy: RpcSocketSource & {apiBase: string}
  call: (call: EngineCall) => Promise<unknown>
  settled: () => Promise<void>
  stop: () => Promise<void>
}

type Pending = {resolve: (value: unknown) => void; reject: (error: Error) => void}

type RouteHandler = {url: RegExp; handler: (route: RpcSocketRoute) => Promise<void>}

type SideListeners = {
  message: (message: ProxyFrame) => void
  close: (code: number | undefined, reason: string | undefined) => void
}

type SocketListeners = Partial<Record<ProxySide, SideListeners | undefined>>

const ENGINE_CHILD = join(import.meta.dirname, '../dist/engine-child.js')

function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => child.once('exit', () => resolve()))
}

function deliverAnswer(waiter: Pending, answer: z.infer<typeof EngineAnswerSchema>): void {
  if (answer.ok) return waiter.resolve(answer.value)
  waiter.reject(new Error(answer.error))
}

function silentListeners(): SideListeners {
  return {message: () => undefined, close: () => undefined}
}

async function pipeThrough(route: RpcSocketRoute): Promise<void> {
  const server = route.connectToServer()
  route.onMessage(server.send)
  server.onMessage(route.send)
  route.onClose(() => void server.close())
  server.onClose(() => void route.close())
}

export async function forkEngine(): Promise<EngineProcess> {
  const child = fork(ENGINE_CHILD, [], {
    execArgv: [],
    serialization: 'advanced',
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  const pending = new Map<number, Pending>()
  const sockets = new Map<number, SocketListeners>()
  const routes: RouteHandler[] = []
  const settling: Pending[] = []
  const next = {id: 1}
  const failAll = (error: Error): void => {
    for (const waiter of [...pending.values(), ...settling.splice(0)]) waiter.reject(error)
    pending.clear()
  }
  const deliverSettled = (): void => {
    if (sockets.size > 0 || pending.size > 0) return
    for (const waiter of settling.splice(0)) waiter.resolve(undefined)
  }
  const settled = (): Promise<void> =>
    new Promise((resolve, reject) => {
      settling.push({resolve: () => resolve(), reject})
      deliverSettled()
    })
  const ask = (id: number): Promise<unknown> =>
    new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject})
    })
  const call = (request: EngineCall): Promise<unknown> => {
    if (!child.connected)
      return Promise.reject(new Error(`the engine child has stopped, so it cannot take a ${request.kind} call`))
    const id = next.id++
    const answer = ask(id)
    child.send({id, call: request})
    return answer
  }
  const tell = (request: EngineCall): void => {
    call(request).catch((error: unknown) =>
      console.error('[plugin-testkit] the engine proxy refused a socket call', error),
    )
  }
  const routeFor = (socket: number): RpcSocketRoute => {
    const endpoint = (side: ProxySide): RpcSocketEndpoint => {
      const listeners = silentListeners()
      const entry = sockets.get(socket) ?? {}
      entry[side] = listeners
      sockets.set(socket, entry)
      return {
        send: (message) => tell({kind: 'send', side, socket, message}),
        close: async (options = {}) => {
          await call({kind: 'close', side, socket, ...options})
        },
        onMessage: (handler) => {
          listeners.message = handler
          if (side === 'page') tell({kind: 'listen', socket})
        },
        onClose: (handler) => {
          listeners.close = handler
        },
      }
    }
    return {
      ...endpoint('page'),
      connectToServer: () => {
        tell({kind: 'connect', socket})
        return endpoint('engine')
      },
    }
  }
  const opened = (socket: number, url: string): void => {
    const route = routeFor(socket)
    const routed = routes.find((entry) => entry.url.test(url))
    const handled = routed ? routed.handler(route) : pipeThrough(route)
    handled.catch((error: unknown) => console.error('[plugin-testkit] a proxied socket could not be routed', error))
  }
  const proxyEvent = (event: ProxyEvent): void => {
    if (event.kind === 'open') return opened(event.socket, event.url)
    const entry = sockets.get(event.socket)
    const listeners = entry?.[event.side]
    if (!entry || !listeners) return failAll(new Error(`the engine proxy reported an unknown socket ${event.socket}`))
    if (event.kind === 'message') return listeners.message(event.message)
    listeners.close(event.code, event.reason)
    entry[event.side] = undefined
    if (entry.page === undefined && entry.engine === undefined) sockets.delete(event.socket)
    deliverSettled()
  }
  child.on('message', (raw) => {
    const event = ProxyEventMessageSchema.safeParse(raw)
    if (event.success) return proxyEvent(event.data.event)
    const answer = EngineAnswerSchema.safeParse(raw)
    if (!answer.success) return failAll(new Error(`the engine child sent a malformed answer: ${answer.error.message}`))
    const waiter = pending.get(answer.data.id)
    if (!waiter) return failAll(new Error(`the engine child answered an unknown request ${answer.data.id}`))
    pending.delete(answer.data.id)
    deliverAnswer(waiter, answer.data)
    deliverSettled()
  })
  child.once('exit', (code, signal) => failAll(new Error(`the engine child exited (code ${code}, signal ${signal})`)))
  child.once('error', failAll)
  const ready = EngineReadySchema.parse(await ask(0))
  return {
    apiBase: ready.apiBase,
    token: ready.token,
    proxy: {
      apiBase: ready.proxyBase,
      routeWebSocket: async (url, handler) => {
        routes.push({url, handler})
      },
    },
    call,
    settled,
    stop: async () => {
      try {
        if (child.connected) {
          await settled()
          await call({kind: 'stop'})
        }
      } finally {
        if (child.connected) child.disconnect()
        await exited(child)
      }
    },
  }
}
