import {getValidatedQuery, readValidatedBody, onError, HTTPError} from 'h3'
import {z} from 'zod'
import {defineExtension} from '@conciv/extension'
import {TEST_RUNNER_NAME, TEST_RUNNER_PROMPT, testRunnerConfig} from './shared/meta.js'
import {testTool} from './tool/server.js'
import {getRunner} from './runner/registry.js'
import {vitest} from './runners/vitest/adapter.js'
import {isRunnerUnavailable} from './runner/contract.js'
import {sseStream} from './runner/sse.js'

const ListQuerySchema = z.object({failed: z.string().optional()})
const RunArgsSchema = z.object({
  patterns: z.array(z.string()).optional(),
  testNamePattern: z.string().optional(),
  failedOnly: z.boolean().default(false),
})

export default defineExtension({
  name: TEST_RUNNER_NAME,
  configSchema: testRunnerConfig,
  tools: [testTool],
  systemPrompt: TEST_RUNNER_PROMPT,
}).server((server) => {
  const adapter = getRunner(server.config.runner) ?? vitest
  const manager = adapter.create(server.cwd)

  server.app.use(
    onError((error) => {
      const original = error.cause ?? error
      if (!isRunnerUnavailable(original)) return undefined
      return new HTTPError({status: 422, message: original.message, body: {available: false, error: original.message}})
    }),
  )
  server.app.get('/stream', (event) =>
    sseStream(event, 'test-runner open', (emit) => {
      emit(manager.emitSnapshot())
      return manager.subscribeRaw(emit)
    }),
  )
  server.app.get('/list', async (event) =>
    manager.list((await getValidatedQuery(event, ListQuerySchema)).failed === '1'),
  )
  server.app.get('/status', () => manager.status())
  server.app.get('/ui', () => manager.openUiServer())
  server.app.post('/run', async (event) => manager.run(await readValidatedBody(event, RunArgsSchema)))
  server.app.post('/stop', async () => {
    await manager.stop()
    return {ok: true}
  })
  return {context: {manager}, dispose: () => manager.stop()}
})
