import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {z} from 'zod'
import {defineExtension} from '@conciv/extension'
import {TEST_RUNNER_NAME, TEST_RUNNER_PROMPT, testRunnerConfig} from './shared/meta.js'
import {testTool} from './tool/server.js'
import {getRunner} from './runner/registry.js'
import {vitest} from './runners/vitest/adapter.js'
import {isRunnerUnavailable, type RunnerUnavailableError, type TestRunnerManager} from './runner/contract.js'
import {sseStream} from './runner/sse.js'

const ListQuerySchema = z.object({failed: z.string().optional()})
const RunArgsSchema = z.object({
  patterns: z.array(z.string()).optional(),
  testNamePattern: z.string().optional(),
  failedOnly: z.boolean().default(false),
})

type TestRunnerEnv = {Variables: {'test-runner': {manager: TestRunnerManager}}}

function runnerUnavailableIn(error: unknown): RunnerUnavailableError | null {
  const original = error instanceof Error && error.cause !== undefined ? error.cause : error
  return isRunnerUnavailable(original) ? original : null
}

const app = new Hono<TestRunnerEnv>()
  .onError((error, c) => {
    const unavailable = runnerUnavailableIn(error)
    if (!unavailable) throw error
    return c.json({available: false, error: unavailable.message}, 422)
  })
  .get('/stream', (c) => {
    const {manager} = c.var['test-runner']
    return sseStream(c, 'test-runner open', (emit) => {
      emit(manager.emitSnapshot())
      return manager.subscribeRaw(emit)
    })
  })
  .get('/list', zValidator('query', ListQuerySchema), async (c) =>
    c.json(await c.var['test-runner'].manager.list(c.req.valid('query').failed === '1')),
  )
  .get('/status', (c) => c.json(c.var['test-runner'].manager.status()))
  .get('/ui', async (c) => c.json(await c.var['test-runner'].manager.openUiServer()))
  .post('/run', zValidator('json', RunArgsSchema), async (c) =>
    c.json(await c.var['test-runner'].manager.run(c.req.valid('json'))),
  )
  .post('/stop', async (c) => {
    await c.var['test-runner'].manager.stop()
    return c.json({ok: true})
  })

export type TestRunnerAppType = typeof app

export default defineExtension({
  name: TEST_RUNNER_NAME,
  configSchema: testRunnerConfig,
  tools: [testTool],
  systemPrompt: TEST_RUNNER_PROMPT,
}).server((server) => {
  const adapter = getRunner(server.config.runner) ?? vitest
  const manager = adapter.create(server.cwd)
  return {
    context: {manager},
    app: new Hono<TestRunnerEnv>()
      .use(async (c, next) => {
        c.set('test-runner', {manager})
        await next()
      })
      .route('/', app),
    dispose: () => manager.stop(),
  }
})
