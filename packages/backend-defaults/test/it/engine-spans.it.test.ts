import {once} from 'node:events'
import {createServer} from 'node:http'
import {text} from 'node:stream/consumers'
import {countBy} from 'es-toolkit'
import {afterAll, beforeAll, describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'
import {z} from 'zod'
import {makeRpcClient} from '@conciv/client'
import {TestLLM} from '../utils/engine.js'

describe('engine spans', () => {
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

  function startCollector() {
    const received: Span[] = []
    const server = createServer(async (request, response) => {
      const body = await text(request)
      if (request.url === '/v1/traces') {
        for (const resource of TracesSchema.parse(JSON.parse(body)).resourceSpans) {
          const engine = resource.resource.attributes.find((attribute) => attribute.key === 'conciv.engine.id')
          for (const scope of resource.scopeSpans) {
            received.push(...scope.spans.map((span) => ({...span, engine: engine?.value.stringValue})))
          }
        }
      }
      response.writeHead(200, {'content-type': 'application/json'}).end('{}')
    })
    server.listen(0, '127.0.0.1')
    return {
      endpoint: async () => {
        if (!server.listening) await once(server, 'listening')
        const address = server.address()
        return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
      },
      spans: (): readonly Span[] => [...received],
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    }
  }

  const CLIENT_CALL_STEPS = ['encode_input', 'send_request', 'decode_response']
  function stoppedRunSpans(spans: readonly Span[]): Span[] {
    const stops = spans.filter((span) => span.name === 'Engine.stop')
    expect(stops).toHaveLength(1)
    const run = spans.filter((span) => span.engine === stops[0]?.engine)
    const clientCalls = new Set(
      run.filter((span) => CLIENT_CALL_STEPS.includes(span.name)).map((span) => span.parentSpanId),
    )
    return run.map((span) => (clientCalls.has(span.spanId) ? {...span, name: `client ${span.name}`} : span))
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

  function expectTree(spans: readonly Span[], tree: Record<string, string | null>) {
    const names = Object.keys(tree)
    expect(namesSeen(spans, names)).toEqual(Object.fromEntries(names.map((name) => [name, 1])))
    expect(parentNames(spans, names)).toEqual(tree)
  }

  const ENGINE_SPANS = {
    'Engine.start': null,
    'Engine.listen': 'Engine.start',
    'Engine.makeApp': 'Engine.start',
    'Engine.awaitActivation': 'Engine.start',
    'Engine.openDatabase': 'Engine.makeApp',
    'Engine.buildPluginHost': 'Engine.makeApp',
    'Engine.loadIsolateDriver': 'Engine.makeApp',
    'Engine.createChatPlane': 'Engine.makeApp',
    'core.permissions.followCards': 'Engine.makeApp',
    'Engine.ensureConfiguredRows': 'Engine.makeApp',
    'Engine.supervisePlugins': 'Engine.makeApp',
    'core.eventFeed.make': 'Engine.buildPluginHost',
    'core.bundler.followDiagnostics': 'Engine.buildPluginHost',
    'ConfigPluginSource.reconcileWatches': 'Engine.buildPluginHost',
    'ChatServer.sweepAbandonedRuns': 'Engine.createChatPlane',
    'PluginModule.make': 'Engine.supervisePlugins',
    'PluginInternal.list': 'Engine.supervisePlugins',
    'PluginSupervisor.activate': 'Engine.supervisePlugins',
    'ConfigPluginSource.operations': 'PluginSupervisor.activate',
    'PluginSupervisor.resolve': 'PluginSupervisor.activate',
    'Plugin.activate': 'PluginSupervisor.activate',
    'ConfigPluginSource.scan': 'ConfigPluginSource.operations',
    'ConfigPluginSource.watchConfiguredSources': 'ConfigPluginSource.operations',
    'PluginSourceDirectory.discover': 'ConfigPluginSource.scan',
    'orpc.sessions/create': null,
    'orpc.meta/harnesses': null,
    'Engine.stop': null,
    'Engine.dispose': 'Engine.stop',
    'Engine.dispose.endListings': 'Engine.dispose',
    'Engine.dispose.closeRpc': 'Engine.dispose',
    'Engine.dispose.closePlugins': 'Engine.dispose',
    'Engine.dispose.closeIdleTriggers': 'Engine.dispose',
    'Engine.dispose.closePermissions': 'Engine.dispose',
    'Engine.dispose.endAllRuns': 'Engine.dispose',
    'Engine.dispose.shutdownPtys': 'Engine.dispose',
    'Engine.dispose.disposeSearch': 'Engine.dispose',
    'Engine.dispose.closeSettings': 'Engine.dispose',
    'Engine.dispose.closeBrowsers': 'Engine.dispose',
    'Engine.dispose.disposePluginHost': 'Engine.dispose',
    'Engine.dispose.closeDatabase': 'Engine.dispose',
    'ChatServer.endAllRuns': 'Engine.dispose.endAllRuns',
    'CodeMode.closePool': 'ChatServer.endAllRuns',
  }

  const TURN_SPANS = {
    'orpc.chat/send': null,
    'ChatServer.turn': null,
    'ChatServer.plan': 'ChatServer.turn',
    'ChatServer.admit': 'ChatServer.turn',
    'ChatServer.prompt': 'ChatServer.turn',
    'ChatServer.prepareContext': 'ChatServer.turn',
    'Transcript.sync': 'ChatServer.prepareContext',
    'ChatServer.recordRun': 'ChatServer.turn',
    'ChatServer.settle': 'ChatServer.turn',
    'CodeMode.execute': 'ChatServer.turn',
    'CodeMode.createContext': 'CodeMode.execute',
    'CodeMode.isolateRun': 'CodeMode.execute',
    'CodeMode.disposeContext': 'CodeMode.execute',
    'CodeMode.toolCall': 'CodeMode.isolateRun',
    'core.permissions.settleAsks': 'CodeMode.toolCall',
    'Tool.execute': 'core.permissions.settleAsks',
    'Permission.forSession': 'core.permissions.settleAsks',
    'chat engine': 'ChatServer.turn',
    'chat engine #0': 'chat engine',
    'chat engine #1': 'chat engine',
    'execute_tool execute_typescript': 'chat engine #0',
    'CodeMode.closePool': 'ChatServer.endAllRuns',
  }

  const collector = startCollector()
  const env = {OTEL_EXPORTER_OTLP_ENDPOINT: ''}

  beforeAll(async () => {
    env.OTEL_EXPORTER_OTLP_ENDPOINT = await collector.endpoint()
  })

  afterAll(() => collector.close())

  test('a start that fails sends no span', async ({createEngine}) => {
    const before = collector.spans().length
    await expect(createEngine({}, {port: 'connect', token: 'short', env})).rejects.toThrow(
      'conciv: accessToken must be a UUID pairing token',
    )
    expect(collector.spans()).toHaveLength(before)
  })

  test('an engine start, one rpc call and the stop send each span once, in its tree, under one engine id', async ({
    createEngine,
  }) => {
    const before = collector.spans().length
    const engine = await createEngine({}, {env})
    await makeRpcClient(engine.address.apiBase, {token: engine.address.token}).meta.harnesses()
    await engine.restart()

    const spans = stoppedRunSpans(collector.spans().slice(before))
    expectTree(spans, ENGINE_SPANS)
    expect(spans[0]?.engine).toMatch(/^eng_[0-9A-Za-z]{26}$/)
  })

  test('one turn with one code mode tool call is one span tree under ChatServer.turn', async ({createEngine}) => {
    const before = collector.spans().length
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk']}, {env})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {typescriptCode: "return await external_desk_echo({text: 'hi'})"}),
      TestLLM.text('done'),
    )
    await engine.session.send('echo hi')
    await engine.restart()

    expectTree(stoppedRunSpans(collector.spans().slice(before)), TURN_SPANS)
  })
})
