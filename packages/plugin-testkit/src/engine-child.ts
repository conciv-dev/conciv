import {once} from 'es-toolkit'
import {Match} from 'effect'
import {z} from 'zod'
import {bootCoreKit, type CoreKit} from './core-kit.js'
import {disposeAll} from './dispose.js'
import {EngineCallSchema, type EngineCall, type ProxyEvent} from './engine-process.js'
import {startEngineProxy, type EngineProxy} from './engine-proxy.js'

const EngineRequestSchema = z.object({id: z.number(), call: EngineCallSchema})

function send(message: unknown): void {
  if (!process.send) throw new Error('the engine child runs without an IPC channel to its parent')
  if (!process.connected) return
  process.send(message, (error: Error | null) => {
    if (error !== null) console.error('[plugin-testkit] the engine child could not reach its parent', error)
  })
}

type Child = {kit: CoreKit; proxy: EngineProxy; state: {running: boolean}; stop: () => Promise<void>}

async function answer(kit: CoreKit, proxy: EngineProxy, call: Exclude<EngineCall, {kind: 'stop'}>): Promise<unknown> {
  return Match.value(call).pipe(
    Match.discriminatorsExhaustive('kind')({
      reply: (reply) => kit.harness.script.scriptTurn({toolCalls: [], text: reply.text}),
      hold: () => kit.harness.script.hold(),
      release: () => kit.harness.script.release(),
      session: async () => (await kit.rpc.sessions.create()).sessionId,
      offline: () => proxy.offline(),
      online: () => proxy.online(),
      pause: () => proxy.pause(),
      resume: () => proxy.resume(),
      listen: (listen) => proxy.listen(listen.socket),
      connect: (connect) => proxy.connect(connect.socket),
      send: (frame) => proxy.send(frame.side, frame.socket, frame.message),
      close: (close) => proxy.closeSocket(close.side, close.socket, close.code, close.reason),
    }),
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function settle(id: number, work: () => Promise<unknown>): Promise<unknown> {
  try {
    return {id, ok: true, value: await work()}
  } catch (error) {
    return {id, ok: false, error: errorMessage(error)}
  }
}

function reply(child: Child, message: unknown): void {
  if (child.state.running) send(message)
}

async function stopChild(child: Child, id: number): Promise<void> {
  child.state.running = false
  send(await settle(id, child.stop))
}

async function handle(child: Child, raw: unknown): Promise<void> {
  const request = EngineRequestSchema.safeParse(raw)
  if (!request.success)
    return reply(child, {
      id: -1,
      ok: false,
      error: `the engine child got a malformed request: ${request.error.message}`,
    })
  const {id, call} = request.data
  if (call.kind === 'stop') return stopChild(child, id)
  reply(child, await settle(id, () => answer(child.kit, child.proxy, call)))
}

async function main(): Promise<void> {
  const kit = await bootCoreKit({id: 'engine'})
  const state = {running: true}
  const proxy = await startEngineProxy(kit.base, (event: ProxyEvent) => {
    if (state.running) send({event})
  })
  const child: Child = {
    kit,
    proxy,
    state,
    stop: once(() => disposeAll([proxy.close, kit.cleanup], 'sequential', 'the engine child did not stop cleanly')),
  }
  process.on('message', (raw) => void handle(child, raw))
  process.once('disconnect', () => {
    child.state.running = false
    void child
      .stop()
      .catch((error: unknown) => console.error('[plugin-testkit] the engine child did not stop cleanly', error))
      .finally(() => process.exit(0))
  })
  send({id: 0, ok: true, value: {apiBase: kit.base, token: kit.token, proxyBase: proxy.apiBase}})
}

main().catch((error: unknown) => {
  console.error('[plugin-testkit] the engine child failed to boot', error)
  process.exit(1)
})
