import {z} from 'zod'
import {bootCoreKit, type CoreKit} from './core-kit.js'

const EngineRequestSchema = z.object({
  id: z.number(),
  call: z.discriminatedUnion('kind', [
    z.object({kind: z.literal('reply'), text: z.string()}),
    z.object({kind: z.literal('hold')}),
    z.object({kind: z.literal('release')}),
    z.object({kind: z.literal('session')}),
  ]),
})

type EngineCall = z.infer<typeof EngineRequestSchema>['call']

function send(message: unknown): void {
  if (!process.send) throw new Error('the engine child runs without an IPC channel to its parent')
  process.send(message)
}

async function answer(kit: CoreKit, call: EngineCall): Promise<unknown> {
  if (call.kind === 'reply') return kit.harness.script.scriptTurn({toolCalls: [], text: call.text})
  if (call.kind === 'hold') return kit.harness.script.hold()
  if (call.kind === 'release') return kit.harness.script.release()
  return (await kit.rpc.sessions.create()).sessionId
}

async function handle(kit: CoreKit, raw: unknown): Promise<void> {
  const request = EngineRequestSchema.safeParse(raw)
  if (!request.success) {
    send({id: -1, ok: false, error: `the engine child got a malformed request: ${request.error.message}`})
    return
  }
  const {id, call} = request.data
  try {
    send({id, ok: true, value: await answer(kit, call)})
  } catch (error) {
    send({id, ok: false, error: error instanceof Error ? error.message : String(error)})
  }
}

async function main(): Promise<void> {
  const kit = await bootCoreKit({id: 'engine'})
  process.on('message', (raw) => void handle(kit, raw))
  process.once('disconnect', () => void kit.cleanup().finally(() => process.exit(0)))
  send({id: 0, ok: true, value: {apiBase: kit.base, token: kit.token}})
}

main().catch((error: unknown) => {
  console.error('[plugin-testkit] the engine child failed to boot', error)
  process.exit(1)
})
