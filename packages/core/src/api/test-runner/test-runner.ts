import {type H3, getValidatedQuery, readValidatedBody} from 'h3'
import {z} from 'zod'
import type {TestRunnerManager} from '@opendui/aidx-protocol/runner-types'
import {sseStream} from '../sse.js'

// A runner-unavailable error thrown by mgr.list/run is mapped to a 422 by the app error handler
// (see api/errors.ts) — the routes here stay oblivious and just await the manager.
export function registerTestRunnerRoutes(app: H3, mgr: TestRunnerManager): void {
  app.get('/api/test-runner/stream', (event) =>
    sseStream(event, 'test-runner open', (emit) => {
      emit(mgr.emitSnapshot())
      return mgr.subscribeRaw(emit)
    }),
  )

  app.get('/api/test-runner/list', async (event) => {
    const {failed} = await getValidatedQuery(event, ListQuerySchema)
    return mgr.list(failed === '1')
  })

  app.get('/api/test-runner/status', () => mgr.status())

  app.get('/api/test-runner/ui', () => mgr.openUiServer())

  app.post('/api/test-runner/run', async (event) => {
    const args = await readValidatedBody(event, RunArgsSchema)
    return mgr.run(args)
  })

  app.post('/api/test-runner/stop', async () => {
    await mgr.stop()
    return {ok: true}
  })
}

const ListQuerySchema = z.object({failed: z.string().optional()})
const RunArgsSchema = z.object({
  patterns: z.array(z.string()).optional(),
  testNamePattern: z.string().optional(),
  failedOnly: z.boolean().default(false),
})
