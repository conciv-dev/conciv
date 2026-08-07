import {defineExtension, toolError} from '@conciv/extension'
import {buildErrorToAppError, makeDiagnosticsRing} from './server/diagnostics.js'
import {makeServerFnTraceRing} from './server/serverfn-trace.js'
import {readRouteManifest} from './server/route-manifest.js'
import {makeTanstackAdapter} from './server/adapter.js'
import {TANSTACK_VERB_DEFS} from './shared/verb-defs.js'
import {
  backServer,
  buildErrorsServer,
  loaderDataServer,
  navigateServer,
  queryCacheServer,
  queryInvalidateServer,
  queryRefetchServer,
  routeManifestServer,
  routeTreeServer,
  routerInvalidateServer,
  routerStateServer,
  serverFnTraceServer,
} from './tool/server.js'

export const tanstack = defineExtension({
  name: 'tanstack',
  tools: [
    routerStateServer,
    routeTreeServer,
    loaderDataServer,
    queryCacheServer,
    navigateServer,
    routerInvalidateServer,
    backServer,
    queryInvalidateServer,
    queryRefetchServer,
    buildErrorsServer,
    routeManifestServer,
    serverFnTraceServer,
    ...TANSTACK_VERB_DEFS.map((def) => def.client()),
  ],
}).server((server) => {
  const ring = makeDiagnosticsRing()
  const serverFnRing = makeServerFnTraceRing()
  const bundler = server.bundler
  const bundlerAvailable = typeof bundler?.subscribe === 'function'
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind === 'build-error') ring.push(buildErrorToAppError(diagnostic))
    serverFnRing.observe(diagnostic)
  })
  const adapter = makeTanstackAdapter({
    tools: server.tools,
    buildErrors: () => {
      if (!bundlerAvailable) throw toolError('BUNDLER_UNAVAILABLE', {message: 'bundler bridge unavailable'})
      return ring.list()
    },
    routeManifest: () => readRouteManifest(server.cwd),
    serverFnTraces: (count) => serverFnRing.traces(count),
    serverFns: () => serverFnRing.functions(),
    bundlerSubscribe: (listener) => bundler?.subscribe?.(listener) ?? (() => {}),
  })
  return {
    context: {adapter},
    dispose: () => unsubscribe?.(),
  }
})

export default tanstack
