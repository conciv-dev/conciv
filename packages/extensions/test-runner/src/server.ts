import {zValidator} from '@hono/zod-validator'
import {z} from 'zod'
import {defineExtension} from '@conciv/extension'
import {TEST_RUNNER_NAME, TEST_RUNNER_PROMPT, testRunnerConfig} from './shared/meta.js'
import {testTool} from './tool/server.js'
import {getRunner} from './runner/registry.js'
import {vitest} from './runners/vitest/adapter.js'
import {isRunnerUnavailable, type RunnerUnavailableError} from './runner/contract.js'
import {sseStream} from './runner/sse.js'

const ListQuerySchema = z.object({failed: z.string().optional()})
const RunArgsSchema = z.object({
  patterns: z.array(z.string()).optional(),
  testNamePattern: z.string().optional(),
  failedOnly: z.boolean().default(false),
})

function runnerUnavailableIn(error: unknown): RunnerUnavailableError | null {
  const original = error instanceof Error && error.cause !== undefined ? error.cause : error
  return isRunnerUnavailable(original) ? original : null
}

export default defineExtension({
  name: TEST_RUNNER_NAME,
  configSchema: testRunnerConfig,
  tools: [testTool],
  systemPrompt: TEST_RUNNER_PROMPT,
}).server((server) => {
  const adapter = getRunner(server.config.runner) ?? vitest
  const manager = adapter.create(server.cwd)

  server.app.onError((error, c) => {
    const unavailable = runnerUnavailableIn(error)
    if (!unavailable) throw error
    return c.json({available: false, error: unavailable.message}, 422)
  })
  server.app.get('/stream', (c) =>
    sseStream(c, 'test-runner open', (emit) => {
      emit(manager.emitSnapshot())
      return manager.subscribeRaw(emit)
    }),
  )
  server.app.get('/list', zValidator('query', ListQuerySchema), async (c) =>
    c.json(await manager.list(c.req.valid('query').failed === '1')),
  )
  server.app.get('/status', (c) => c.json(manager.status()))
  server.app.get('/ui', async (c) => c.json(await manager.openUiServer()))
  server.app.post('/run', zValidator('json', RunArgsSchema), async (c) =>
    c.json(await manager.run(c.req.valid('json'))),
  )
  server.app.post('/stop', async (c) => {
    await manager.stop()
    return c.json({ok: true})
  })
  return {context: {manager}, dispose: () => manager.stop()}
})
