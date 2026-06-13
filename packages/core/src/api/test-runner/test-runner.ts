import {type H3, type H3Event, getValidatedQuery, readValidatedBody} from 'h3'
import {z} from 'zod'
import {isRunnerUnavailable, type TestRunnerManager} from '@devgent/protocol/runner-types'

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
  'access-control-allow-origin': '*',
}

const ListQuerySchema = z.object({failed: z.string().optional()})
const RunArgsSchema = z.object({
  patterns: z.array(z.string()).optional(),
  testNamePattern: z.string().optional(),
  failedOnly: z.boolean().default(false),
})

// Render a typed "runner unavailable" failure as a 422 rather than a 500.
function unavailableBody(event: H3Event, e: unknown): {available: false; error: string} | null {
  if (!isRunnerUnavailable(e)) return null
  event.res.status = 422
  return {available: false, error: e.message}
}

export function registerTestRunnerRoutes(app: H3, mgr: TestRunnerManager): void {
  app.get('/api/test-runner/stream', () => {
    const encoder = new TextEncoder()
    let unsubscribe = () => {}
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': test-runner open\n\n'))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(mgr.emitSnapshot())}\n\n`))
        unsubscribe = mgr.subscribeRaw((e) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)))
      },
      cancel() {
        unsubscribe()
      },
    })
    return new Response(stream, {status: 200, headers: SSE_HEADERS})
  })

  app.get('/api/test-runner/list', async (event) => {
    const {failed} = await getValidatedQuery(event, ListQuerySchema)
    try {
      return await mgr.list(failed === '1')
    } catch (e) {
      const body = unavailableBody(event, e)
      if (body) return body
      throw e
    }
  })

  app.get('/api/test-runner/status', () => mgr.status())

  app.get('/api/test-runner/ui', () => mgr.openUiServer())

  app.post('/api/test-runner/run', async (event) => {
    const args = await readValidatedBody(event, RunArgsSchema)
    try {
      return await mgr.run(args)
    } catch (e) {
      const body = unavailableBody(event, e)
      if (body) return body
      throw e
    }
  })

  app.post('/api/test-runner/stop', async () => {
    await mgr.stop()
    return {stopped: true}
  })
}
