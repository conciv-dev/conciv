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
    if (error !== null && process.connected)
      console.error('[plugin-testkit] the engine child could not reach its parent', error)
  })
}

function emit(event: ProxyEvent): void {
  send({event})
}

async function answer(kit: CoreKit, proxy: EngineProxy, call: EngineCall): Promise<unknown> {
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

async function handle(kit: CoreKit, proxy: EngineProxy, raw: unknown): Promise<void> {
  const request = EngineRequestSchema.safeParse(raw)
  if (!request.success) {
    send({id: -1, ok: false, error: `the engine child got a malformed request: ${request.error.message}`})
    return
  }
  const {id, call} = request.data
  try {
    send({id, ok: true, value: await answer(kit, proxy, call)})
  } catch (error) {
    send({id, ok: false, error: error instanceof Error ? error.message : String(error)})
  }
}

async function main(): Promise<void> {
  const kit = await bootCoreKit({id: 'engine'})
  const proxy = await startEngineProxy(kit.base, emit)
  process.on('message', (raw) => void handle(kit, proxy, raw))
  process.once('disconnect', () => {
    void disposeAll([proxy.close, kit.cleanup], 'sequential', 'the engine child did not stop cleanly')
      .catch((error: unknown) => console.error('[plugin-testkit] the engine child did not stop cleanly', error))
      .finally(() => process.exit(0))
  })
  send({id: 0, ok: true, value: {apiBase: kit.base, token: kit.token, proxyBase: proxy.apiBase}})
}

main().catch((error: unknown) => {
  console.error('[plugin-testkit] the engine child failed to boot', error)
  process.exit(1)
})
