import {once} from 'node:events'
import {createServer} from 'node:http'
import {join} from 'node:path'
import {text} from 'node:stream/consumers'
import {countBy, uniq} from 'es-toolkit'
import {ConfigProvider, Effect, Scope} from 'effect'
import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import {askingToolProvisioner} from '@conciv/ai/server'
import {makeRpcClient} from '@conciv/contract'
import {createFakeHarness} from '@conciv/harness-testkit'
import {Tool} from '@conciv/plugin-host'
import {SessionId} from '@conciv/protocol/chat-types'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {makeApp} from '../app.js'
import {resolveConfig} from '../config.js'
import {agentPath} from '../engine-login.js'
import {ensureRow} from '../sessions/session-rows.js'
import {start} from '../start.js'
import {startObservability, type EngineObservability} from './observability.js'

const SpanSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
})

const AttributeSchema = z.object({key: z.string(), value: z.object({stringValue: z.string().optional()})})

const TracesSchema = z.object({
  resourceSpans: z.array(
    z.object({
      resource: z.object({attributes: z.array(AttributeSchema)}),
      scopeSpans: z.array(z.object({spans: z.array(SpanSchema)})),
    }),
  ),
})

type Span = z.infer<typeof SpanSchema> & {engine: string | undefined}

type Collector = {configProvider: ConfigProvider.ConfigProvider; spans: () => Span[]}

async function startCollector(): Promise<Collector & {close: () => Promise<void>}> {
  const received: Span[][] = []
  const server = createServer(async (request, response) => {
    const body = await text(request)
    if (request.url === '/v1/traces') {
      received.push(
        TracesSchema.parse(JSON.parse(body)).resourceSpans.flatMap((resource) => {
          const engine = resource.resource.attributes.find((attribute) => attribute.key === 'conciv.engine.id')
          return resource.scopeSpans.flatMap((scope) =>
            scope.spans.map((span) => ({...span, engine: engine?.value.stringValue})),
          )
        }),
      )
    }
    response.writeHead(200, {'content-type': 'application/json'}).end('{}')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
      CONCIV_PRINT_LOGS: '',
    }).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
  )
  return {
    configProvider: ConfigProvider.fromEnv({env, preserveEmptyStrings: true}),
    spans: () => received.flat(),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

const withCollector = test.extend<{collector: Collector}>({
  collector: async ({task: _task}, use) => {
    const collector = await startCollector()
    try {
      await use(collector)
    } finally {
      await collector.close()
    }
  },
})

const JsonRpcErrorSchema = z.object({error: z.object({code: z.number()})})

function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {...headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream'},
    body: JSON.stringify(body),
  })
}

async function turnOnce(root: string, home: string, collector: Collector, observability: EngineObservability) {
  const harness = createFakeHarness()
  const made = await makeApp({
    cfg: resolveConfig({}, root),
    cwd: root,
    openInEditor: () => {},
    harness,
    home,
    configProvider: collector.configProvider,
    observability,
    print: () => {},
  })
  try {
    await made.awaitActivation()
    const scope = made.pluginHost.runSync(Scope.make())
    await made.pluginHost.runPromise(
      Tool.Service.use((tools) =>
        tools.transform((editor) => {
          editor.add({
            name: 'unit_echo',
            description: 'Echo the text.',
            input: z.object({text: z.string()}),
            execute: (input: {text: string}) => Effect.succeed({content: input.text}),
          })
        }),
      ).pipe(Scope.provide(scope)),
    )
    const id = SessionId.parse('conciv_spans_turn')
    await ensureRow(made.chat.rows, id)
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: "return await external_unit_echo({text: 'hi'})",
    })
    expect(await made.plane.followUp(id, 'echo hi')).toEqual({kind: 'delivered'})
  } finally {
    await made.dispose()
  }
}

function parentNames(spans: readonly Span[], names: readonly string[]): Record<string, string | null> {
  return Object.fromEntries(
    spans
      .filter((span) => names.includes(span.name))
      .map((span) => [span.name, spans.find((parent) => parent.spanId === span.parentSpanId)?.name ?? null]),
  )
}

function namesSeen(spans: readonly Span[], names: readonly string[]): Record<string, number> {
  return countBy(
    spans.filter((span) => names.includes(span.name)),
    (span) => span.name,
  )
}

const ENGINE_SPANS = {
  'Engine.start': null,
  'Engine.listen': 'Engine.start',
  'Engine.makeApp': 'Engine.start',
  'Engine.openDatabase': 'Engine.makeApp',
  'Engine.buildPluginHost': 'Engine.makeApp',
  'Engine.loadIsolateDriver': 'Engine.makeApp',
  'Engine.createChatPlane': 'Engine.makeApp',
  'ChatServer.sweepAbandonedRuns': 'Engine.createChatPlane',
  'Engine.ensureConfiguredRows': 'Engine.makeApp',
  'Engine.supervisePlugins': 'Engine.makeApp',
  'core.eventFeed.make': 'Engine.buildPluginHost',
  'PluginSupervisor.activate': 'Engine.supervisePlugins',
  'Engine.awaitActivation': 'Engine.start',
  'Rpc.navigation.get': null,
  'Engine.stop': null,
  'Engine.dispose': 'Engine.stop',
  'Engine.dispose.disposePluginHost': 'Engine.dispose',
  'Engine.dispose.closeDatabase': 'Engine.dispose',
}

const TURN_SPANS = {
  'ChatServer.turn': null,
  'ChatServer.plan': 'ChatServer.turn',
  'ChatServer.admit': 'ChatServer.turn',
  'ChatServer.prompt': 'ChatServer.turn',
  'ChatServer.prepareContext': 'ChatServer.turn',
  'Transcript.sync': 'ChatServer.prepareContext',
  'ChatServer.recordRun': 'ChatServer.turn',
  'ChatServer.settle': 'ChatServer.turn',
  'CodeMode.execute': 'ChatServer.turn',
  'CodeMode.isolateRun': 'CodeMode.execute',
  'CodeMode.toolCall': 'CodeMode.isolateRun',
  'core.permissions.settleAsks': 'CodeMode.toolCall',
  'Tool.execute': 'core.permissions.settleAsks',
  'chat fake-harness': 'ChatServer.turn',
  'chat fake-harness #0': 'chat fake-harness',
  'execute_tool execute_typescript': 'chat fake-harness #0',
  'CodeMode.closePool': 'ChatServer.endAllRuns',
}

describe('engine spans', () => {
  withCollector(
    'an engine start, one rpc call and the stop export each span once in its tree, flushed by the stop',
    async ({collector}) => {
      const root = tempDir('conciv-spans-')
      await expect(
        start({
          options: {stateRoot: root, systemPrompt: false},
          root,
          launchEditor: () => {},
          accessToken: 'short',
          configProvider: collector.configProvider,
        }),
      ).rejects.toThrow()
      expect(collector.spans()).toEqual([])

      const untraced = await startObservability({
        home: tempDir('conciv-spans-home-'),
        fallbackRoots: join(root, 'untraced-plugin-host'),
        configProvider: ConfigProvider.fromEnv({env: {}}),
        engineId: 'spans-untraced-engine',
      })
      const untracedTracer = untraced.tracer
      await untraced.dispose()
      expect(untracedTracer).toBeUndefined()

      const engine = await start({
        options: {stateRoot: root, systemPrompt: false},
        root,
        launchEditor: () => {},
        harness: createFakeHarness(),
        homeDir: tempDir('conciv-spans-home-'),
        configProvider: collector.configProvider,
      })
      const base = `http://127.0.0.1:${engine.port}${agentPath(engine.agentToken)}`
      try {
        await makeRpcClient(base).navigation.get()
        expect((await postJson(`${base}/api/mcp`, [], {})).status).toBe(400)
      } finally {
        await engine.stop()
      }

      const names = Object.keys(ENGINE_SPANS)
      expect(namesSeen(collector.spans(), names)).toEqual(Object.fromEntries(names.map((name) => [name, 1])))
      expect(parentNames(collector.spans(), names)).toEqual(ENGINE_SPANS)
      expect(uniq(collector.spans().map((span) => span.engine))).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/)])
    },
  )

  withCollector(
    'a traced tool bridge answers a non-object body over JSON-RPC, and one turn with one code mode tool call is one span tree under ChatServer.turn',
    async ({collector}) => {
      const root = tempDir('conciv-spans-')
      const home = tempDir('conciv-spans-home-')
      const observability = await startObservability({
        home,
        fallbackRoots: join(root, 'plugin-host'),
        configProvider: collector.configProvider,
        engineId: 'spans-turn-engine',
      })
      try {
        const bridge = await askingToolProvisioner(
          async () => ({allowed: false, message: 'no asks here'}),
          observability.tracer,
        ).provision([], {threadId: 'spans-bridge', provider: 'local-process'})
        try {
          const headers = {authorization: `Bearer ${bridge.token}`}
          expect(JsonRpcErrorSchema.parse(await (await postJson(bridge.url, [], headers)).json()).error.code).toBe(
            -32601,
          )
          expect(JsonRpcErrorSchema.parse(await (await postJson(bridge.url, 42, headers)).json()).error.code).toBe(
            -32600,
          )
        } finally {
          await bridge.close()
        }
        await turnOnce(root, home, collector, observability)
      } finally {
        await observability.dispose()
      }

      const names = Object.keys(TURN_SPANS)
      expect(namesSeen(collector.spans(), names)).toEqual(Object.fromEntries(names.map((name) => [name, 1])))
      expect(parentNames(collector.spans(), names)).toEqual(TURN_SPANS)
      expect(uniq(collector.spans().map((span) => span.engine))).toEqual(['spans-turn-engine'])
    },
  )
})
