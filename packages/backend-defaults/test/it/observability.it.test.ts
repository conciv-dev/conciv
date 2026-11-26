import {join} from 'node:path'
import {ConfigProvider} from 'effect'
import {describe, expect} from 'vitest'
import {z} from 'zod'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {askingToolProvisioner} from '../../src/ai.js'
import {startObservability} from '../../src/engine/runtime/observability.js'
import {test} from '../utils/engine-parts.js'

describe('engine spans', () => {
  const JsonRpcErrorSchema = z.object({error: z.object({code: z.number()})})

  function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: {...headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream'},
      body: JSON.stringify(body),
    })
  }

  test('without an OTLP endpoint the engine has no tracer, and a traced tool bridge answers a body that is not an object with a JSON-RPC error', async ({
    otlpEndpoint,
  }) => {
    const untraced = await startObservability({
      home: tempDir('conciv-spans-home-'),
      fallbackRoots: join(tempDir('conciv-spans-'), 'plugin-host'),
      configProvider: ConfigProvider.fromEnv({env: {}}),
      engineId: 'spans-untraced-engine',
    })
    const untracedTracer = untraced.tracer
    await untraced.dispose()
    expect(untracedTracer).toBeUndefined()

    const observability = await startObservability({
      home: tempDir('conciv-spans-home-'),
      fallbackRoots: join(tempDir('conciv-spans-'), 'plugin-host'),
      configProvider: ConfigProvider.fromEnv({env: {OTEL_EXPORTER_OTLP_ENDPOINT: otlpEndpoint}}),
      engineId: 'spans-bridge-engine',
    })
    try {
      expect(observability.tracer).toBeDefined()
      const bridge = await askingToolProvisioner(
        async () => ({allowed: false, message: 'no asks here'}),
        observability.tracer,
        {runFork: () => undefined},
      ).provision([], {threadId: 'spans-bridge', provider: 'local-process'})
      try {
        const headers = {authorization: `Bearer ${bridge.token}`}
        expect(JsonRpcErrorSchema.parse(await (await postJson(bridge.url, [], headers)).json()).error.code).toBe(-32601)
        expect(JsonRpcErrorSchema.parse(await (await postJson(bridge.url, 42, headers)).json()).error.code).toBe(-32600)
      } finally {
        await bridge.close()
      }
    } finally {
      await observability.dispose()
    }
  })
})
